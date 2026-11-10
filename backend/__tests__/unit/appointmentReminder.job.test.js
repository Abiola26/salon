'use strict';

jest.mock('../../src/utils/email');
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const { sendAppointmentReminderEmail } = require('../../src/utils/email');
const { runAppointmentReminderJob } = require('../../src/jobs/appointmentReminder.job');

const makeDb = (rows = []) => ({
  appointment: {
    findMany: jest.fn().mockResolvedValue(rows),
    update: jest.fn().mockResolvedValue({}),
  },
});

const makeAppointment = (id, overrides = {}) => ({
  id,
  user: { email: 'customer@example.com', emailReminders: true, ...(overrides.user || {}) },
  service: { name: 'Haircut', duration: 60 },
  staff: null,
  ...overrides,
});

describe('appointmentReminder job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendAppointmentReminderEmail.mockResolvedValue({ id: 'email-1' });
  });

  it('queries tomorrow in salon-local time with opt-in and dedupe filters', async () => {
    const db = makeDb([]);

    const result = await runAppointmentReminderJob({
      now: new Date('2026-06-29T13:00:00.000Z'),
      db,
    });

    expect(result).toEqual({ checked: 0, sent: 0, failed: 0, skipped: 0 });
    expect(db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          appointmentDate: new Date('2026-06-30T00:00:00.000Z'),
          status: { in: ['PENDING', 'CONFIRMED'] },
          emailReminderSentAt: null,
          user: { emailReminders: true, deletedAt: null },
        },
      })
    );
  });

  it('sends reminders, marks them as sent, and isolates failures', async () => {
    const ok = makeAppointment('ok');
    const noEmail = makeAppointment('no-email', {
      user: { email: '', emailReminders: true },
    });
    const enqueueFailed = makeAppointment('enqueue-failed');
    const thrown = makeAppointment('thrown');
    const db = makeDb([ok, noEmail, enqueueFailed, thrown]);

    sendAppointmentReminderEmail
      .mockResolvedValueOnce({ id: 'email-ok' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('smtp exploded'));

    const result = await runAppointmentReminderJob({
      now: new Date('2026-06-29T13:00:00.000Z'),
      db,
    });

    expect(result).toEqual({ checked: 4, sent: 1, failed: 2, skipped: 1 });
    expect(sendAppointmentReminderEmail).toHaveBeenCalledTimes(3);
    expect(db.appointment.update).toHaveBeenCalledTimes(1);
    expect(db.appointment.update).toHaveBeenCalledWith({
      where: { id: 'ok' },
      data: { emailReminderSentAt: expect.any(Date) },
    });
  });

  it('skips users who opted out even if they slip through the query', async () => {
    const db = makeDb([
      makeAppointment('opted-out', {
        user: { email: 'customer@example.com', emailReminders: false },
      }),
    ]);

    const result = await runAppointmentReminderJob({ db });

    expect(result).toEqual({ checked: 1, sent: 0, failed: 0, skipped: 1 });
    expect(sendAppointmentReminderEmail).not.toHaveBeenCalled();
  });
});
