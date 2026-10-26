'use strict';

const { enqueueEmail, processEmailQueue } = require('../../src/utils/emailQueue');
const { prisma } = require('../../src/config/db');
const transporter = require('../../src/config/email');

jest.mock('../../src/config/db', () => ({
  prisma: {
    emailQueue: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/email', () => ({
  sendMail: jest.fn(),
}));

const row = (overrides = {}) => ({
  id: 'q1',
  to: 'a@b.com',
  subject: 'sub',
  html: '<p>h</p>',
  status: 'PENDING',
  attempts: 0,
  ...overrides,
});

describe('emailQueue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('enqueueEmail', () => {
    it('creates a PENDING row and nudges the processor', async () => {
      prisma.emailQueue.create.mockResolvedValue(row());
      prisma.emailQueue.findMany.mockResolvedValue([]); // nudge finds nothing

      const result = await enqueueEmail({ to: 'a@b.com', subject: 'sub', html: '<p>h</p>' });

      expect(prisma.emailQueue.create).toHaveBeenCalledWith({
        data: { to: 'a@b.com', subject: 'sub', html: '<p>h</p>', status: 'PENDING', attempts: 0 },
      });
      expect(result).toEqual(row());
      // allow the fire-and-forget nudge to settle
      await new Promise(setImmediate);
      expect(prisma.emailQueue.findMany).toHaveBeenCalled();
    });

    it('returns null and never throws when the DB write fails', async () => {
      prisma.emailQueue.create.mockRejectedValue(new Error('db down'));

      await expect(
        enqueueEmail({ to: 'a@b.com', subject: 'sub', html: '<p>h</p>' })
      ).resolves.toBeNull();
    });

    it('stores the ICS payload on the row when provided', async () => {
      prisma.emailQueue.create.mockResolvedValue(row({ ics: 'BEGIN:VCALENDAR' }));
      prisma.emailQueue.findMany.mockResolvedValue([]);

      await enqueueEmail({ to: 'a@b.com', subject: 'sub', html: '<p>h</p>', ics: 'BEGIN:VCALENDAR' });

      expect(prisma.emailQueue.create).toHaveBeenCalledWith({
        data: {
          to: 'a@b.com',
          subject: 'sub',
          html: '<p>h</p>',
          status: 'PENDING',
          attempts: 0,
          ics: 'BEGIN:VCALENDAR',
        },
      });
    });

    it('still resolves when the background nudge fails (logged, not thrown)', async () => {
      prisma.emailQueue.create.mockResolvedValue(row());
      prisma.emailQueue.findMany.mockRejectedValue(new Error('db down'));

      const result = await enqueueEmail({ to: 'a@b.com', subject: 'sub', html: '<p>h</p>' });

      expect(result).toEqual(row());
      await new Promise(setImmediate); // let the fire-and-forget nudge settle
    });
  });

  describe('processEmailQueue', () => {
    it('sends a claimed row and marks it SENT', async () => {
      prisma.emailQueue.findMany.mockResolvedValue([row()]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockResolvedValue({ messageId: 'm1' });

      const sent = await processEmailQueue();

      expect(sent).toBe(1);
      expect(prisma.emailQueue.updateMany).toHaveBeenCalledWith({
        where: { id: 'q1', status: 'PENDING', attempts: 0 },
        data: { attempts: { increment: 1 } },
      });
      expect(transporter.sendMail).toHaveBeenCalled();
      expect(prisma.emailQueue.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { status: 'SENT' },
      });
    });

    it('attaches the ICS payload as text/calendar when the row has one', async () => {
      const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
      prisma.emailQueue.findMany.mockResolvedValue([row({ ics })]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockResolvedValue({ messageId: 'm1' });

      const sent = await processEmailQueue();

      expect(sent).toBe(1);
      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'appointment.ics',
              content: ics,
              contentType: 'text/calendar; charset=utf-8',
            },
          ],
        })
      );
    });

    it('sends without attachments when the row has no ICS', async () => {
      prisma.emailQueue.findMany.mockResolvedValue([row()]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockResolvedValue({ messageId: 'm1' });

      await processEmailQueue();

      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.not.objectContaining({ attachments: expect.anything() })
      );
    });

    it('returns rows to PENDING for retry when an attempt below the max fails', async () => {
      prisma.emailQueue.findMany.mockResolvedValue([row({ attempts: 1 })]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockRejectedValue(new Error('SMTP down'));

      const sent = await processEmailQueue();

      expect(sent).toBe(0);
      expect(prisma.emailQueue.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { status: 'PENDING', lastError: 'SMTP down' },
      });
    });

    it('marks the row FAILED on the final attempt', async () => {
      prisma.emailQueue.findMany.mockResolvedValue([row({ attempts: 2 })]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockRejectedValue(new Error('SMTP down'));

      await processEmailQueue();

      expect(prisma.emailQueue.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { status: 'FAILED', lastError: 'SMTP down' },
      });
    });

    it('skips rows whose CAS claim lost (concurrent runner)', async () => {
      prisma.emailQueue.findMany.mockResolvedValue([row()]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 0 });

      const sent = await processEmailQueue();

      expect(sent).toBe(0);
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    it('a concurrent call joins the in-flight run and re-scans for new rows', async () => {
      // pass 1 sees the enqueued row; the re-run (triggered by the second
      // concurrent call) sees nothing
      prisma.emailQueue.findMany
        .mockResolvedValueOnce([row()])
        .mockResolvedValueOnce([]);
      prisma.emailQueue.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailQueue.update.mockResolvedValue({});
      transporter.sendMail.mockResolvedValue({ messageId: 'm1' });

      const first = processEmailQueue();
      const second = processEmailQueue(); // joins + requests a re-scan

      await expect(first).resolves.toBe(1);
      await expect(second).resolves.toBe(1);
      expect(prisma.emailQueue.findMany).toHaveBeenCalledTimes(2);
      expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    });

    it('propagates queue read errors (nudge logs, cron logs)', async () => {
      prisma.emailQueue.findMany.mockRejectedValue(new Error('db down'));

      await expect(processEmailQueue()).rejects.toThrow('db down');
    });
  });
});
