'use strict';

const {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendPaymentConfirmationEmail,
  sendCancellationEmail,
  sendRefundEmail,
} = require('../../src/utils/email');
const { enqueueEmail } = require('../../src/utils/emailQueue');

jest.mock('../../src/utils/emailQueue', () => ({
  enqueueEmail: jest.fn(),
  processEmailQueue: jest.fn(),
}));

describe('emailUtils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    enqueueEmail.mockResolvedValue({ id: 'q1' });
  });

  describe('sendEmail', () => {
    it('queues the email via the email queue pipeline', async () => {
      const res = await sendEmail({ to: 't@t.com', subject: 'sub', html: '<p>h</p>', text: 't' });
      expect(res).toEqual({ id: 'q1' });
      expect(enqueueEmail).toHaveBeenCalledWith({ to: 't@t.com', subject: 'sub', html: '<p>h</p>' });
    });

    it('falls back to text when no html is given', async () => {
      await sendEmail({ to: 't@t.com', subject: 'sub', text: 'plain' });
      expect(enqueueEmail).toHaveBeenCalledWith({ to: 't@t.com', subject: 'sub', html: 'plain' });
    });

    it('does not throw when enqueue fails (returns null)', async () => {
      enqueueEmail.mockResolvedValue(null);

      await expect(
        sendEmail({ to: 't@t.com', subject: 'sub', html: '<p>h</p>' })
      ).resolves.toBeNull();
    });
  });

  describe('templates', () => {
    const user = { name: 'Alice', email: 'alice@example.com' };
    const appointment = { appointmentDate: '2026-06-25', appointmentTime: '10:00' };
    const service = { name: 'Cut', price: '50.00', duration: 30 };
    const payment = { amount: 50.00, paymentType: 'FULL', stripePaymentIntentId: 'pi_123' };

    it('sendWelcomeEmail', async () => {
      await sendWelcomeEmail(user);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Welcome') })
      );
    });

    it('sendPasswordResetEmail', async () => {
      await sendPasswordResetEmail(user, 'token123');
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Password Reset') })
      );
    });

    it('sendAppointmentConfirmationEmail', async () => {
      await sendAppointmentConfirmationEmail(user, appointment, service);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Confirmed') })
      );
    });

    it('sendAppointmentReminderEmail', async () => {
      await sendAppointmentReminderEmail(user, appointment, service);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Reminder') })
      );
    });

    it('sendPaymentConfirmationEmail', async () => {
      await sendPaymentConfirmationEmail(user, payment, appointment, service);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Payment Confirmed') })
      );
    });

    it('sendPaymentConfirmationEmail with string amount', async () => {
      await sendPaymentConfirmationEmail(user, { ...payment, amount: '50.00' }, appointment, service);
      expect(enqueueEmail).toHaveBeenCalled();
    });

    it('sendCancellationEmail', async () => {
      await sendCancellationEmail(user, appointment, service);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Cancelled') })
      );
    });

    it('sendRefundEmail', async () => {
      await sendRefundEmail(user, payment, service);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Refund') })
      );
    });

    it('sendRefundEmail with string amount', async () => {
      await sendRefundEmail(user, { ...payment, amount: '50.00' }, service);
      expect(enqueueEmail).toHaveBeenCalled();
    });
  });
});
