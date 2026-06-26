'use strict';

const paymentService = require('../../src/services/payment.service');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const paymentRepository = require('../../src/repositories/payment.repository');
const userRepository = require('../../src/repositories/user.repository');
const stripe = require('../../src/config/stripe');
const emailUtils = require('../../src/utils/email');
const { auditLog } = require('../../src/utils/audit');

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
          amount: 100,
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
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        amountPaid: '0.00',
        service: { price: '100.00' },
      });
      paymentRepository.updateByStripeIntentId.mockResolvedValue({});
      appointmentRepository.update.mockResolvedValue({});
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendPaymentConfirmationEmail.mockResolvedValue({});

      const result = await paymentService.handleWebhook('body', 'sig');
      expect(result).toEqual({ received: true });
      expect(paymentRepository.updateByStripeIntentId).toHaveBeenCalledWith('pi_123', {
        status: 'SUCCEEDED',
      });
    });

    it('handles payment failed event', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_123' } },
      });
      paymentRepository.updateByStripeIntentId.mockResolvedValue({});

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.updateByStripeIntentId).toHaveBeenCalledWith('pi_123', {
        status: 'FAILED',
      });
    });

    it('handles charge refunded event', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_123' } },
      });
      paymentRepository.updateByStripeIntentId.mockResolvedValue({});

      await paymentService.handleWebhook('body', 'sig');
      expect(paymentRepository.updateByStripeIntentId).toHaveBeenCalledWith('pi_123', {
        status: 'REFUNDED',
      });
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

    it('initiates refund successfully', async () => {
      paymentRepository.findById.mockResolvedValue({
        id: 'p1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_123',
        amount: '100.00',
        appointmentId: 'a1',
        userId: 'u1',
      });
      stripe.refunds.create.mockResolvedValue({ id: 'ref_123' });
      paymentRepository.update.mockResolvedValue({});
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        amountPaid: '100.00',
        service: {},
      });
      appointmentRepository.update.mockResolvedValue({});
      userRepository.findById.mockResolvedValue({});
      emailUtils.sendRefundEmail.mockResolvedValue({});
      auditLog.mockResolvedValue({});

      const result = await paymentService.initiateRefund('p1', 'admin-1', '127.0.0.1');

      expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
      expect(paymentRepository.update).toHaveBeenCalledWith('p1', { status: 'REFUNDED' });
      expect(result.refundId).toBe('ref_123');
    });
  });
});
