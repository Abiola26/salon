'use strict';

const {
  salonDateString,
  addDaysToDateString,
  toDateOnly,
  appointmentStartAt,
  appointmentEndAt,
} = require('../../src/utils/salonTime');

describe('salonTime utils', () => {
  describe('salonDateString', () => {
    it('uses the salon calendar date, not the UTC date', () => {
      const instant = new Date('2026-06-29T03:30:00.000Z');
      expect(salonDateString(instant, 'America/New_York')).toBe('2026-06-28');
      expect(salonDateString(instant, 'Asia/Tokyo')).toBe('2026-06-29');
    });
  });

  describe('addDaysToDateString', () => {
    it('crosses month and year boundaries', () => {
      expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDaysToDateString('2027-03-01', -1)).toBe('2027-02-28');
    });

    it('treats a missing offset as zero days', () => {
      expect(addDaysToDateString('2026-06-29')).toBe('2026-06-29');
    });
  });

  describe('toDateOnly', () => {
    it('normalizes Date and string values to YYYY-MM-DD', () => {
      expect(toDateOnly(new Date('2026-06-29T14:00:00.000Z'))).toBe('2026-06-29');
      expect(toDateOnly('2026-12-14T00:00:00.000Z')).toBe('2026-12-14');
    });
  });

  describe('appointmentStartAt', () => {
    it('converts salon wall time to UTC across DST', () => {
      const summer = appointmentStartAt(
        { appointmentDate: new Date('2026-06-29'), appointmentTime: '10:00' },
        'America/New_York'
      );
      const winter = appointmentStartAt(
        { appointmentDate: new Date('2026-12-14'), appointmentTime: '10:00' },
        'America/New_York'
      );

      expect(summer.toISOString()).toBe('2026-06-29T14:00:00.000Z');
      expect(winter.toISOString()).toBe('2026-12-14T15:00:00.000Z');
    });
  });

  describe('appointmentEndAt', () => {
    it('adds the service duration to the start time', () => {
      const end = appointmentEndAt(
        { appointmentDate: new Date('2026-06-29'), appointmentTime: '10:00' },
        90,
        'America/New_York'
      );

      expect(end.toISOString()).toBe('2026-06-29T15:30:00.000Z');
    });

    it('clamps missing or negative durations to zero', () => {
      const appointment = {
        appointmentDate: new Date('2026-06-29'),
        appointmentTime: '10:00',
      };

      expect(appointmentEndAt(appointment, undefined, 'America/New_York').toISOString()).toBe(
        '2026-06-29T14:00:00.000Z'
      );
      expect(appointmentEndAt(appointment, -30, 'America/New_York').toISOString()).toBe(
        '2026-06-29T14:00:00.000Z'
      );
    });
  });
});
