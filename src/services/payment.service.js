'use strict';

const stripe = require('../config/stripe');
const appointmentRepository = require('../repositories/appointment.repository');
const paymentRepository = require('../repositories/payment.repository');
const userRepository = require('../repositories/user.repository');
const { sendPaymentConfirmationEmail, sendRefundEmail } = require('../utils/email');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');
const { DEPOSIT_PERCENTAGE } = require('../config/env');
const logger = require('../config/logger');

const paymentService = {
  async createPaymentIntent(userId, { appointmentId, paymentType }) {
    const appointment = await appointmentRepository.findById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    if (appointment.userId !== userId) {
      throw ApiError.forbidden('Not authorized to pay for this appointment');
    }

    if (appointment.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot process payment for a cancelled appointment');
    }

    if (appointment.paymentStatus === 'PAID') {
      throw ApiError.badRequest('This appointment is already fully paid');
    }

    const servicePrice = parseFloat(appointment.service.price);
    const amountAlreadyPaid = parseFloat(appointment.amountPaid);
    const remaining = servicePrice - amountAlreadyPaid;

    if (remaining <= 0) {
      throw ApiError.badRequest('No outstanding balance for this appointment');
    }

    let chargeAmount; // in cents

    if (paymentType === 'DEPOSIT') {
      if (appointment.paymentStatus === 'PARTIAL') {
        throw ApiError.badRequest('A deposit has already been paid. Please complete full payment.');
      }
      chargeAmount = Math.round((servicePrice * DEPOSIT_PERCENTAGE) / 100 * 100);
    } else {
      // FULL — charge remaining balance
      chargeAmount = Math.round(remaining * 100);
    }

    const user = await userRepository.findById(userId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: 'usd',
      metadata: {
        appointmentId,
        userId,
        paymentType,
        serviceId: appointment.serviceId,
      },
      description: `${paymentType === 'DEPOSIT' ? 'Deposit' : 'Full payment'} for ${appointment.service.name}`,
      receipt_email: user.email,
    });

    // Record in DB as pending
    await paymentRepository.create({
      userId,
      appointmentId,
      stripePaymentIntentId: paymentIntent.id,
      amount: chargeAmount / 100,
      currency: 'usd',
      status: 'PENDING',
      paymentType,
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: chargeAmount,
      currency: 'usd',
      paymentType,
    };
  },

  async handleWebhook(rawBody, signature) {
    const { STRIPE } = require('../config/env');
    let event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE.WEBHOOK_SECRET);
    } catch (err) {
      logger.error(`Webhook signature verification failed: ${err.message}`);
      throw ApiError.badRequest(`Webhook Error: ${err.message}`);
    }

    logger.info(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await paymentService._handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await paymentService._handlePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await paymentService._handleRefund(event.data.object);
        break;
      default:
        logger.debug(`Unhandled webhook event: ${event.type}`);
    }

    return { received: true };
  },

  async _handlePaymentSucceeded(paymentIntent) {
    const payment = await paymentRepository.findByStripeIntentId(paymentIntent.id);
    if (!payment) {
      logger.warn(`Payment record not found for intent: ${paymentIntent.id}`);
      return;
    }

    await paymentRepository.updateByStripeIntentId(paymentIntent.id, {
      status: 'SUCCEEDED',
    });

    const appointment = await appointmentRepository.findById(payment.appointmentId);
    const servicePrice = parseFloat(appointment.service.price);
    const newAmountPaid = parseFloat(appointment.amountPaid) + parseFloat(payment.amount);

    const paymentStatus = newAmountPaid >= servicePrice ? 'PAID' : 'PARTIAL';

    await appointmentRepository.update(payment.appointmentId, {
      paymentStatus,
      amountPaid: newAmountPaid,
      status: 'CONFIRMED',
    });

    // Send confirmation email
    const user = await userRepository.findById(payment.userId);
    sendPaymentConfirmationEmail(user, payment, appointment, appointment.service).catch(() => {});

    logger.info(`Payment succeeded for appointment ${payment.appointmentId} — status: ${paymentStatus}`);
  },

  async _handlePaymentFailed(paymentIntent) {
    await paymentRepository.updateByStripeIntentId(paymentIntent.id, {
      status: 'FAILED',
    }).catch(() => {});
    logger.warn(`Payment failed for intent: ${paymentIntent.id}`);
  },

  async _handleRefund(charge) {
    const paymentIntentId = charge.payment_intent;
    if (paymentIntentId) {
      await paymentRepository.updateByStripeIntentId(paymentIntentId, {
        status: 'REFUNDED',
      }).catch(() => {});
      logger.info(`Refund processed for intent: ${paymentIntentId}`);
    }
  },

  async getPayments({ page = 1, limit = 20, userId, status } = {}) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      paymentRepository.findAll({ skip, take: limit, userId, status }),
      paymentRepository.count({ ...(userId && { userId }), ...(status && { status }) }),
    ]);
    return { payments, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  async getPaymentsByAppointment(appointmentId, userId, role) {
    const appointment = await appointmentRepository.findByIdRaw(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    if (role !== 'ADMIN' && appointment.userId !== userId) {
      throw ApiError.forbidden('Not authorized');
    }
    return paymentRepository.findByAppointmentId(appointmentId);
  },

  /**
   * Admin-initiated refund. Calls Stripe, marks payment REFUNDED,
   * updates appointment paymentStatus, and sends a refund email.
   */
  async initiateRefund(paymentId, actorId = null, ipAddress = null) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw ApiError.notFound('Payment not found');

    if (payment.status !== 'SUCCEEDED') {
      throw ApiError.badRequest(
        `Cannot refund a payment with status "${payment.status}". Only SUCCEEDED payments can be refunded.`
      );
    }

    // Call Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
    });

    logger.info(`Stripe refund created: ${refund.id} for intent ${payment.stripePaymentIntentId}`);

    // Update payment record
    await paymentRepository.update(paymentId, { status: 'REFUNDED' });

    // Recalculate appointment payment status
    const appointment = await appointmentRepository.findById(payment.appointmentId);
    const newAmountPaid = Math.max(
      0,
      parseFloat(appointment.amountPaid) - parseFloat(payment.amount)
    );
    await appointmentRepository.update(payment.appointmentId, {
      amountPaid: newAmountPaid,
      paymentStatus: newAmountPaid <= 0 ? 'UNPAID' : 'PARTIAL',
    });

    // Send refund confirmation email
    const user = await userRepository.findById(payment.userId);
    sendRefundEmail(user, payment, appointment.service).catch(() => {});

    // Audit log
    await auditLog({
      userId: actorId,
      action: 'CANCEL_APPOINTMENT', // closest existing enum — extend if needed
      details: `Admin refund of $${payment.amount} for payment ${paymentId} (intent: ${payment.stripePaymentIntentId})`,
      ipAddress,
    });

    return { refundId: refund.id, paymentId, amountRefunded: parseFloat(payment.amount) };
  },
};

module.exports = paymentService;
