'use strict';

const stripe = require('../config/stripe');
const appointmentRepository = require('../repositories/appointment.repository');
const paymentRepository = require('../repositories/payment.repository');
const userRepository = require('../repositories/user.repository');
const { sendPaymentConfirmationEmail, sendRefundEmail } = require('../utils/email');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');
const { DEPOSIT_AMOUNT } = require('../config/env');
const { toCents, toDecimal2 } = require('../utils/money');
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

    // Integer cents end-to-end: outstanding = price − discount − already paid.
    const dueCents = Math.max(0, toCents(appointment.service.price) - toCents(appointment.discountAmount));
    const remainingCents = dueCents - toCents(appointment.amountPaid);

    if (remainingCents <= 0) {
      throw ApiError.badRequest('No outstanding balance for this appointment');
    }

    let chargeAmount; // in cents

    if (paymentType === 'DEPOSIT') {
      if (appointment.paymentStatus === 'PARTIAL') {
        throw ApiError.badRequest('A deposit has already been paid. Please complete full payment.');
      }
      const depositCents = Math.round((typeof DEPOSIT_AMOUNT === 'number' ? DEPOSIT_AMOUNT : 30) * 100);
      chargeAmount = Math.min(depositCents, remainingCents);
    } else {
      // FULL — charge remaining balance
      chargeAmount = remainingCents;
    }

    // Stripe rejects sub-$0.50 charges — fail fast with a clear message.
    if (chargeAmount < 50) {
      throw ApiError.badRequest(
        `Charge amount $${(chargeAmount / 100).toFixed(2)} is below Stripe's $0.50 minimum`
      );
    }

    const user = await userRepository.findById(userId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: 'cad',
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
      amount: toDecimal2(chargeAmount),
      currency: 'cad',
      status: 'PENDING',
      paymentType,
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: chargeAmount,
      currency: 'cad',
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

    // Integrity: DB stays the source of truth — log drift loudly for ops.
    if (typeof paymentIntent.amount === 'number' && paymentIntent.amount !== toCents(payment.amount)) {
      logger.error(
        `Stripe amount mismatch for intent ${paymentIntent.id}: stripe=${paymentIntent.amount}c db=${toCents(payment.amount)}c — processing DB amount`
      );
    }
    if (paymentIntent.currency && paymentIntent.currency !== 'cad') {
      logger.error(
        `Unexpected currency "${paymentIntent.currency}" for intent ${paymentIntent.id} (expected cad)`
      );
    }

    // Idempotency: Stripe retries webhooks until 2xx. CAS-claim + appointment
    // update run in ONE transaction; duplicates return null and are ack'd.
    const appointment = await paymentRepository.processSucceeded(
      paymentIntent.id,
      payment.appointmentId,
      payment.amount
    );
    if (!appointment) {
      logger.info(
        `Duplicate payment_intent.succeeded ignored for intent ${paymentIntent.id} (already processed)`
      );
      return;
    }

    // Money arrived for a slot that was cancelled away — flag for manual refund.
    if (appointment.status === 'CANCELLED') {
      logger.error(
        `Payment ${paymentIntent.id} succeeded for CANCELLED appointment ${payment.appointmentId} — manual refund required`
      );
    }

    // Send confirmation email
    const user = await userRepository.findById(payment.userId);
    sendPaymentConfirmationEmail(user, payment, appointment, appointment.service).catch(() => {});

    // Credit loyalty points (1 point per $10 paid)
    const appointmentService = require('./appointment.service');
    appointmentService.creditLoyaltyPoints(payment.appointmentId, payment.amount).catch(() => {});

    logger.info(
      `Payment succeeded for appointment ${payment.appointmentId} — status: ${appointment.paymentStatus}`
    );
  },

  async _handlePaymentFailed(paymentIntent) {
    const claim = await paymentRepository.claimFailed(paymentIntent.id);
    if (claim.count === 0) {
      logger.info(
        `payment_intent.payment_failed ignored for intent ${paymentIntent.id} (already terminal)`
      );
      return;
    }
    logger.warn(`Payment failed for intent: ${paymentIntent.id}`);
  },

  async _handleRefund(charge) {
    const paymentIntentId =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId) return;

    // Full refunds only: a Stripe-dashboard partial refund leaves books we can't
    // reconcile automatically — keep the payment as-is and page ops.
    if (
      typeof charge.amount_refunded === 'number' &&
      typeof charge.amount === 'number' &&
      charge.amount_refunded < charge.amount
    ) {
      logger.error(
        `Partial refund ${charge.amount_refunded}/${charge.amount}c on intent ${paymentIntentId} — payment left unchanged, reconcile manually`
      );
      return;
    }

    // CAS-claim SUCCEEDED → REFUNDED + recompute appointment balance in one tx.
    const appointment = await paymentRepository.processRefund(paymentIntentId);
    if (!appointment) {
      logger.info(
        `charge.refunded ignored for intent ${paymentIntentId} (already processed or not SUCCEEDED)`
      );
      return;
    }
    logger.info(
      `Refund applied for intent ${paymentIntentId} — appointment ${appointment.id} now ${appointment.paymentStatus}`
    );
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
   * Admin-initiated refund. Stripe is called FIRST with an idempotency key so
   * concurrent double-clicks converge on one refund; the DB claim + appointment
   * balance recompute (processRefund) happen after, and the charge.refunded
   * webhook self-heals any crash between the two steps.
   */
  async initiateRefund(paymentId, actorId = null, ipAddress = null) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw ApiError.notFound('Payment not found');

    if (payment.status !== 'SUCCEEDED') {
      throw ApiError.badRequest(
        `Cannot refund a payment with status "${payment.status}". Only SUCCEEDED payments can be refunded.`
      );
    }

    let refund;
    try {
      refund = await stripe.refunds.create(
        { payment_intent: payment.stripePaymentIntentId },
        { idempotencyKey: `refund:${paymentId}` }
      );
    } catch (err) {
      // Nothing claimed in DB — the failed attempt is fully retryable.
      logger.error(`Stripe refund failed for payment ${paymentId}: ${err.message}`);
      throw ApiError.badRequest(`Stripe refund failed: ${err.message}`);
    }

    // Single CAS claim + appointment balance recompute (idempotent under races).
    const appointment = await paymentRepository.processRefund(payment.stripePaymentIntentId);
    if (!appointment) {
      logger.info(`Refund ${refund.id} for payment ${paymentId} already applied concurrently`);
      return {
        refundId: refund.id,
        paymentId,
        amountRefunded: parseFloat(payment.amount),
        alreadyProcessed: true,
      };
    }

    logger.info(`Stripe refund created: ${refund.id} for intent ${payment.stripePaymentIntentId}`);

    // Send refund confirmation email
    const user = await userRepository.findById(payment.userId);
    sendRefundEmail(user, payment, appointment.service).catch(() => {});

    // Audit log
    await auditLog({
      userId: actorId,
      action: 'REFUND_PAYMENT',
      details: `Admin refund of $${payment.amount} for payment ${paymentId} (intent: ${payment.stripePaymentIntentId})`,
      ipAddress,
    });

    return { refundId: refund.id, paymentId, amountRefunded: parseFloat(payment.amount) };
  },
};

module.exports = paymentService;
