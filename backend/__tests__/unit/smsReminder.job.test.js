'use strict';

jest.mock('../../src/utils/sms');
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const { sendSms } = require('../../src/utils/sms');
const { runSmsReminderJob } = require('../../src/jobs/smsReminder.job');

const makeDb = (rows = []) => ({
  appointment: {
    findMany: jest.fn().mockResolvedValue(rows),
    update: jest.fn().mockResolvedValue({}),
  },
});

const makeAppointment = (id, overrides = {}) => ({
  id,
  appointmentTime: '11:00',
  user: {
    name: 'Customer',
    phoneNumber: '+15550000000',
    smsReminders: true,
    ...(overrides.user || {}),
  },
  service: { name: 'Haircut' },
  staff: { name: 'Sam' },
  ...overrides,
});

describe('smsReminder job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendSms.mockResolvedValue({ success: true, sid: 'sid-1' });
  });

  it('queries the 2h window with opt-in and dedupe filters', async () => {
    const db = makeDb([]);

    const result = await runSmsReminderJob({
      now: new Date('2026-06-29T13:00:00.000Z'),
      db,
    });

    expect(result).toEqual({ checked: 0, sent: 0, failed: 0, skipped: 0 });

    const where = db.appointment.findMany.mock.calls[0][0].where;
    expect(where.appointmentDate).toEqual(new Date('2026-06-29'));
    expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
    expect(where.smsReminderSentAt).toBeNull();
    expect(where.user).toEqual({ smsReminders: true, phoneNumber: { not: null } });
    expect(where.appointmentTime.in).toContain('11:00');
  });

  it('sends, dedupes, skips ineligible users, and isolates failures', async () => {
    const db = makeDb([
      makeAppointment('ok'),
      makeAppointment('no-phone', { user: { phoneNumber: null } }),
      makeAppointment('opted-out', { user: { smsReminders: false } }),
      makeAppointment('provider-rejected'),
      makeAppointment('provider-threw'),
    ]);

    sendSms
      .mockResolvedValueOnce({ success: true, sid: 'sid-ok' })
      .mockResolvedValueOnce({ success: false, error: 'invalid number' })
      .mockRejectedValueOnce(new Error('twilio down'));

    const result = await runSmsReminderJob({
      now: new Date('2026-06-29T13:00:00.000Z'),
      db,
    });

    expect(result).toEqual({ checked: 5, sent: 1, failed: 2, skipped: 2 });
    expect(sendSms).toHaveBeenCalledTimes(3);
    expect(sendSms).toHaveBeenCalledWith(
      '+15550000000',
      expect.stringContaining('Haircut appointment with Sam')
    );
    expect(db.appointment.update).toHaveBeenCalledTimes(1);
    expect(db.appointment.update).toHaveBeenCalledWith({
      where: { id: 'ok' },
      data: { smsReminderSentAt: expect.any(Date) },
    });
  });

  it('returns an error summary when the query itself fails', async () => {
    const db = makeDb();
    db.appointment.findMany.mockRejectedValue(new Error('db down'));

    const result = await runSmsReminderJob({ db });

    expect(result).toEqual({ checked: 0, sent: 0, failed: 0, skipped: 0, error: 'db down' });
  });
});
