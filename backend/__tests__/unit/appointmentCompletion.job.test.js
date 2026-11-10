'use strict';

const { completePastAppointments } = require('../../src/jobs/appointmentCompletion.job');

const makeDb = (rows = []) => ({
  appointment: {
    findMany: jest.fn().mockResolvedValue(rows),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

describe('appointmentCompletion job', () => {
  it('completes CONFIRMED appointments whose end time has passed', async () => {
    const db = makeDb([
      {
        id: 'past',
        appointmentDate: new Date('2026-06-28'),
        appointmentTime: '10:00',
        service: { duration: 60 },
      },
      {
        id: 'later-today',
        appointmentDate: new Date('2026-06-29'),
        appointmentTime: '18:00',
        service: { duration: 60 },
      },
    ]);
    const now = new Date('2026-06-29T15:00:00.000Z');

    const result = await completePastAppointments({ now, db });

    expect(result).toEqual({ completed: 1, checked: 2 });
    expect(db.appointment.updateMany).toHaveBeenCalledTimes(1);
    expect(db.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 'past', status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
  });

  it('completes a same-day appointment once its end time has passed', async () => {
    const db = makeDb([
      {
        id: 'finished-today',
        appointmentDate: new Date('2026-06-29'),
        appointmentTime: '09:00',
        service: { duration: 60 },
      },
    ]);
    const now = new Date('2026-06-29T14:00:00.000Z');

    const result = await completePastAppointments({ now, db });

    expect(result.completed).toBe(1);
    expect(db.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 'finished-today', status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
  });

  it('skips a same-day appointment whose end time is still in the future', async () => {
    const db = makeDb([
      {
        id: 'upcoming-today',
        appointmentDate: new Date('2026-06-29'),
        appointmentTime: '10:00',
        service: { duration: 60 },
      },
    ]);
    const now = new Date('2026-06-29T14:00:00.000Z');

    const result = await completePastAppointments({ now, db });

    expect(result).toEqual({ completed: 0, checked: 1 });
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('only queries CONFIRMED appointments up to the salon-local today', async () => {
    const db = makeDb([]);

    await completePastAppointments({
      now: new Date('2026-06-29T15:00:00.000Z'),
      db,
    });

    expect(db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'CONFIRMED',
          appointmentDate: { lte: new Date('2026-06-29T00:00:00.000Z') },
        },
      })
    );
  });

  it('does not count rows whose CAS update lost a race', async () => {
    const db = makeDb([
      {
        id: 'past',
        appointmentDate: new Date('2026-06-28'),
        appointmentTime: '10:00',
        service: { duration: 60 },
      },
    ]);
    db.appointment.updateMany.mockResolvedValue({ count: 0 });

    const result = await completePastAppointments({
      now: new Date('2026-06-29T15:00:00.000Z'),
      db,
    });

    expect(result).toEqual({ completed: 0, checked: 1 });
  });

  it('treats a missing service duration as zero', async () => {
    const db = makeDb([
      {
        id: 'no-service',
        appointmentDate: new Date('2026-06-29'),
        appointmentTime: '10:00',
        service: null,
      },
    ]);

    const result = await completePastAppointments({
      now: new Date('2026-06-29T14:00:01.000Z'),
      db,
    });

    expect(result.completed).toBe(1);
  });
});
