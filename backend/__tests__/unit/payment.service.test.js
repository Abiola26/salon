'use strict';

const paymentService = require('../../src/services/payment.service');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const paymentRepository = require('../../src/repositories/payment.repository');
const userRepository = require('../../src/repositories/user.repository');
const stripe = require('../../src/config/stripe');
const emailUtils = require('../../src/utils/email');
const { auditLog } = require('../../src/utils/audit');
const logger = require('../../src/config/logger');

jest.mock('../../src/repositories/appointment.repository');
jest.mock('../../src/repositories/payment.repository');
jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/config/stripe', () => ({
  paymentIntents: {
    create: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
}));
jest.mock('../../src/utils/email');
jest.mock('../../src/utils/audit');
jest.mock('../../src/config/logger');

describe('paymentService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('throws when appointment not found', async () => {
      appointmentRepository.findById.mockResolvedValue(null);

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' })
      ).rejects.toThrow('Appointment not found');
    });

    it('throws when unauthorized', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'other' });

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' })
      ).rejects.toThrow('Not authorized to pay for this appointment');
    });

    it('throws when cancelled', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'CANCELLED' });

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' })
      ).rejects.toThrow('Cannot process payment for a cancelled appointment');
    });

    it('throws when already fully paid', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'PAID',
      });

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' })
      ).rejects.toThrow('This appointment is already fully paid');
    });

    it('creates full payment intent successfully', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        amountPaid: '0.00',
        service: { price: '100.00', name: 'Cut' },
        serviceId: 's1',
      });
      userRepository.findById.mockResolvedValue({ id: 'u1', email: 'u1@example.com' });
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' });
      paymentRepository.create.mockResolvedValue({});

      const result = await paymentService.createPaymentIntent('u1', {
        appointmentId: 'a1',
        paymentType: 'FULL',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          currency: 'cad',
        })
      );
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_123',
          amount: '100.00',
          paymentType: 'FULL',
        })
      );
      expect(result.clientSecret).toBe('secret_123');
    });

    it('creates deposit payment intent successfully', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        amountPaid: '0.00',
        service: { price: '100.00', name: 'Cut' },
        serviceId: 's1',
      });
      userRepository.findById.mockResolvedValue({ id: 'u1', email: 'u1@example.com' });
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' });
      paymentRepository.create.mockResolvedValue({});

      const result = await paymentService.createPaymentIntent('u1', {
        appointmentId: 'a1',
        paymentType: 'DEPOSIT',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 3000, // $30 deposit default
        })
      );
      expect(result.paymentType).toBe('DEPOSIT');
    });

    it('applies discountAmount to the charge (coupon/points discount)', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        amountPaid: '0.00',
        discountAmount: '20.00',
        service: { price: '100.00', name: 'Cut' },
        serviceId: 's1',
      });
      userRepository.findById.mockResolvedValue({ id: 'u1', email: 'u1@example.com' });
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' });
      paymentRepository.create.mockResolvedValue({});

      await paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 8000 }) // $100 − $20 discount
      );
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '80.00' })
      );
    });

    it('charges the discounted remaining balance after a partial payment', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'PARTIAL',
        amountPaid: '30.00',
        discountAmount: '20.00',
        service: { price: '100.00', name: 'Cut' },
        serviceId: 's1',
      });
      userRepository.findById.mockResolvedValue({ id: 'u1', email: 'u1@example.com' });
      stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' });
      paymentRepository.create.mockResolvedValue({});

      await paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 }) // $100 − $20 − $30 paid
      );
    });

    it('rejects charges below Stripe $0.50 minimum', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        amountPaid: '0.00',
        discountAmount: '0.00',
        service: { price: '0.40', name: 'Touch-up' },
        serviceId: 's1',
      });

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'FULL' })
      ).rejects.toThrow("below Stripe's $0.50 minimum");
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('blocks a second deposit when the appointment is already PARTIAL', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'PENDING',
        paymentStatus: 'PARTIAL',
        amountPaid: '30.00',
        discountAmount: '0.00',
        service: { price: '100.00', name: 'Cut' },
        serviceId: 's1',
      });

      await expect(
        paymentService.createPaymentIntent('u1', { appointmentId: 'a1', paymentType: 'DEPOSIT' })
      ).rejects.toThrow('A deposit has already been paid');
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('throws on invalid webhook signature', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('sig fail');
      });

      await expect(paymentService.handleWebhook('body', 'sig')).rejects.toThrow('Webhook Error: sig fail');
    });

    it('handles payment succeeded event', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      });
      paymentRepository.findByStripeIntentId.mockResolvedValue({
        id: 'p1',
        appointmentId: 'a1',
        amount: '30.00',
        userId: 'u1',
      });
      paymentRepository.processSucceeded.mockResolvedValue({
        id: 'a1',
        paymentStatus: 'PARTIAL',
        status: 'CONFIRMED',
        service: { price: '100.00' },
      });
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendPaymentConfirmationEmail.mockResolvedValue({});

      const result = await paymentService.handleWebhook('body', 'sig');
      expect(result).toEqual({ received: true });
      expect(paymentRepository.processSucceeded).toHaveBeenCalledWith('pi_123', 'a1', '30.00');
    });

    it('logs when Stripe amount or currency drifts from the DB record', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', amount: 5000, currency: 'usd' } },
      });
      paymentRepository.findByStripeIntentId.mockResolvedValue({
        id: 'p1',
        appointmentId: 'a1',
        amount: '30.00',
        userId: 'u1',
      });
      paymentRepository.processSucceeded.mockResolvedValue({
        id: 'a1',
        paymentStatus: 'PARTIAL',
        status: 'CONFIRMED',
        service: { price: '100.00' },
      });
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendPaymentConfirmationEmail.mockResolvedValue({});

      await paymentService.handleWebhook('body', 'sig');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Stripe amount mismatch'));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected currency'));
      // DB remains the source of truth
      expect(paymentRepository.processSucceeded).toHaveBeenCalledWith('pi_123', 'a1', '30.00');
    });

    it('flags a succeeded payment on a cancelled appointment for manual refund', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', amount: 3000, currency: 'cad' } },
      });
      paymentRepository.findByStripeIntentId.mockResolvedValue({
        id: 'p1',
        appointmentId: 'a1',
        amount: '30.00',
        userId: 'u1',
      });
      // Late webhook: CAS wins but appointment.status stays CANCELLED
      paymentRepository.processSucceeded.mockResolvedValue({
        id: 'a1',
        status: 'CANCELLED',
        paymentStatus: 'PARTIAL',
        service: { price: '100.00' },
      });
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendPaymentConfirmationEmail.mockResolvedValue({});

      await paymentService.handleWebhook('body', 'sig');

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('manual refund required'));
    });

    it('ignores duplicate payment succeeded deliveries (idempotent)', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      });
      paymentRepository.findByStripeIntentId.mockResolvedValue({
        id: 'p1',
        appointmentId: 'a1',
        amount: '30.00',
        userId: 'u1',
        status: 'SUCCEEDED',
      });
      // Duplicate → transaction CAS loses → null, no side effects
      paymentRepository.processSucceeded.mockResolvedValue(null);

      const result = await paymentService.handleWebhook('body', 'sig');

      expect(result).toEqual({ received: true });
      expect(emailUtils.sendPaymentConfirmationEmail).not.toHaveBeenCalled();
      expect(paymentRepository.updateByStripeIntentId).not.toHaveBeenCalled();
    });

    it('skips succeeded handling when payment record is missing', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_missing' } },
      });
      paymentRepository.findByStripeIntentId.mockResolvedValue(null);

      const result = await paymentService.handleWebhook('body', 'sig');

      expect(result).toEqual({ received: true });
      expect(paymentRepository.processSucceeded).not.toHaveBeenCalled();
      expect(emailUtils.sendPaymentConfirmationEmail).not.toHaveBeenCalled();
    });

    it('handles payment failed event', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_123' } },
      });
      paymentRepository.claimFailed.mockResolvedValue({ count: 1 });

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.claimFailed).toHaveBeenCalledWith('pi_123');
    });

    it('ignores payment failed event for already-terminal payment', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_123' } },
      });
      paymentRepository.claimFailed.mockResolvedValue({ count: 0 });

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.claimFailed).toHaveBeenCalledWith('pi_123');
      expect(paymentRepository.updateByStripeIntentId).not.toHaveBeenCalled();
    });

    it('handles charge refunded event via processRefund (appointment balance updated)', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_123' } },
      });
      paymentRepository.processRefund.mockResolvedValue({ id: 'a1', paymentStatus: 'UNPAID' });

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.processRefund).toHaveBeenCalledWith('pi_123');
    });

    it('ignores duplicate charge.refunded deliveries', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_123' } },
      });
      paymentRepository.processRefund.mockResolvedValue(null);

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.processRefund).toHaveBeenCalledWith('pi_123');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('charge.refunded ignored')
      );
    });

    it('skips partial refunds from the Stripe dashboard (manual reconciliation)', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_123', amount: 1000, amount_refunded: 400 } },
      });

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.processRefund).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Partial refund'));
    });

    it('resolves expanded payment_intent objects in charge.refunded', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: { id: 'pi_expanded' } } },
      });
      paymentRepository.processRefund.mockResolvedValue({ id: 'a1', paymentStatus: 'PAID' });

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.processRefund).toHaveBeenCalledWith('pi_expanded');
    });
  });

  describe('getPayments', () => {
    it('returns list of payments', async () => {
      paymentRepository.findAll.mockResolvedValue([]);
      paymentRepository.count.mockResolvedValue(0);

      const result = await paymentService.getPayments({ page: 1, limit: 10 });
      expect(result.payments).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('getPaymentsByAppointment', () => {
    it('throws when appointment not found', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue(null);

      await expect(paymentService.getPaymentsByAppointment('a1', 'u1', 'CUSTOMER')).rejects.toThrow(
        'Appointment not found'
      );
    });

    it('throws when not authorized customer', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ userId: 'other' });

      await expect(paymentService.getPaymentsByAppointment('a1', 'u1', 'CUSTOMER')).rejects.toThrow(
        'Not authorized'
      );
    });

    it('returns payments for appointment', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ userId: 'u1' });
      paymentRepository.findByAppointmentId.mockResolvedValue([{ id: 'p1' }]);

      const result = await paymentService.getPaymentsByAppointment('a1', 'u1', 'CUSTOMER');
      expect(result).toEqual([{ id: 'p1' }]);
    });
  });

  describe('initiateRefund', () => {
    it('throws when payment not found', async () => {
      paymentRepository.findById.mockResolvedValue(null);

      await expect(paymentService.initiateRefund('p1')).rejects.toThrow('Payment not found');
    });

    it('throws when payment is not SUCCEEDED', async () => {
      paymentRepository.findById.mockResolvedValue({ id: 'p1', status: 'PENDING' });

      await expect(paymentService.initiateRefund('p1')).rejects.toThrow('Cannot refund a payment');
    });

    it('initiates refund successfully (Stripe idempotency key + single DB claim)', async () => {
      paymentRepository.findById.mockResolvedValue({
        id: 'p1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_123',
        amount: '100.00',
        appointmentId: 'a1',
        userId: 'u1',
      });
      stripe.refunds.create.mockResolvedValue({ id: 'ref_123' });
      paymentRepository.processRefund.mockResolvedValue({
        id: 'a1',
        paymentStatus: 'UNPAID',
        service: { name: 'Cut' },
      });
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendRefundEmail.mockResolvedValue({});
      auditLog.mockResolvedValue({});

      const result = await paymentService.initiateRefund('p1', 'admin-1', '127.0.0.1');

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123' },
        { idempotencyKey: 'refund:p1' }
      );
      expect(paymentRepository.processRefund).toHaveBeenCalledWith('pi_123');
      // Old ad-hoc paths are gone — everything runs through processRefund
      expect(paymentRepository.update).not.toHaveBeenCalled();
      expect(appointmentRepository.findById).not.toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_PAYMENT' })
      );
      expect(result).toEqual({ refundId: 'ref_123', paymentId: 'p1', amountRefunded: 100 });
    });

    it('fails cleanly when Stripe rejects the refund (nothing claimed in DB)', async () => {
      paymentRepository.findById.mockResolvedValue({
        id: 'p1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_123',
        amount: '100.00',
        appointmentId: 'a1',
        userId: 'u1',
      });
      stripe.refunds.create.mockRejectedValue(new Error('refund_declined'));

      await expect(paymentService.initiateRefund('p1')).rejects.toThrow(
        'Stripe refund failed: refund_declined'
      );
      expect(paymentRepository.processRefund).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
      expect(emailUtils.sendRefundEmail).not.toHaveBeenCalled();
    });

    it('returns alreadyProcessed when a concurrent refund claimed the payment first', async () => {
      paymentRepository.findById.mockResolvedValue({
        id: 'p1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_123',
        amount: '100.00',
        appointmentId: 'a1',
        userId: 'u1',
      });
      stripe.refunds.create.mockResolvedValue({ id: 'ref_123' });
      paymentRepository.processRefund.mockResolvedValue(null);

      const result = await paymentService.initiateRefund('p1', 'admin-1', '127.0.0.1');

      expect(result).toEqual({
        refundId: 'ref_123',
        paymentId: 'p1',
        amountRefunded: 100,
        alreadyProcessed: true,
      });
      // No duplicate side effects on the losing racer
      expect(emailUtils.sendRefundEmail).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    });
  });
});
