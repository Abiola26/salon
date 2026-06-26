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
const transporter = require('../../src/config/email');

jest.mock('../../src/config/email', () => ({
  sendMail: jest.fn(),
}));

describe('emailUtils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('sendEmail', () => {
    it('sends email successfully', async () => {
      transporter.sendMail.mockResolvedValue({ messageId: 'm1' });

      const res = await sendEmail({ to: 't@t.com', subject: 'sub', html: '<p>h</p>', text: 't' });
      expect(res.messageId).toBe('m1');
      expect(transporter.sendMail).toHaveBeenCalled();
    });

    it('throws error when transporter fails', async () => {
      transporter.sendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(
        sendEmail({ to: 't@t.com', subject: 'sub', html: '<p>h</p>', text: 't' })
      ).rejects.toThrow('SMTP error');
    });
  });

  describe('templates', () => {
    const user = { name: 'Alice', email: 'alice@example.com' };
    const appointment = { appointmentDate: '2026-06-25', appointmentTime: '10:00' };
    const service = { name: 'Cut', price: '50.00', duration: 30 };
    const payment = { amount: 50.00, paymentType: 'FULL', stripePaymentIntentId: 'pi_123' };

    beforeEach(() => {
      transporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    });

    it('sendWelcomeEmail', async () => {
      await sendWelcomeEmail(user);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Welcome') })
      );
    });

    it('sendPasswordResetEmail', async () => {
      await sendPasswordResetEmail(user, 'token123');
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Password Reset') })
      );
    });

    it('sendAppointmentConfirmationEmail', async () => {
      await sendAppointmentConfirmationEmail(user, appointment, service);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Confirmed') })
      );
    });

    it('sendAppointmentReminderEmail', async () => {
      await sendAppointmentReminderEmail(user, appointment, service);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Reminder') })
      );
    });

    it('sendPaymentConfirmationEmail', async () => {
      await sendPaymentConfirmationEmail(user, payment, appointment, service);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Payment Confirmed') })
      );
    });

    it('sendPaymentConfirmationEmail with string amount', async () => {
      await sendPaymentConfirmationEmail(user, { ...payment, amount: '50.00' }, appointment, service);
      expect(transporter.sendMail).toHaveBeenCalled();
    });

    it('sendCancellationEmail', async () => {
      await sendCancellationEmail(user, appointment, service);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Cancelled') })
      );
    });

    it('sendRefundEmail', async () => {
      await sendRefundEmail(user, payment, service);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, subject: expect.stringContaining('Refund') })
      );
    });

    it('sendRefundEmail with string amount', async () => {
      await sendRefundEmail(user, { ...payment, amount: '50.00' }, service);
      expect(transporter.sendMail).toHaveBeenCalled();
    });
  });
});
