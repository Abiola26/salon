'use strict';

const {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  availableSlotsSchema,
} = require('../../src/validators/appointment.validator');

describe('appointmentValidator', () => {
  const VALID_UUID = '2b7b045e-4c73-455f-8647-75927ad9a647';

  const getFutureDate = (daysAhead = 2) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const getFutureDatetime = (daysAhead = 2) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString(); // full ISO datetime string
  };

  // ─── createAppointmentSchema ───────────────────────────────────────────────

  describe('createAppointmentSchema', () => {
    it('validates a fully populated correct payload', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(2),
        appointmentTime: '10:00',
        notes: 'Need haircut',
        staffId: VALID_UUID,
        couponCode: 'SAVE10',
        redeemPoints: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates a minimal payload (only required fields)', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(1),
        appointmentTime: '09:00',
      });
      expect(result.success).toBe(true);
    });

    it('defaults redeemPoints to false when omitted', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(1),
        appointmentTime: '09:00',
      });
      expect(result.success).toBe(true);
      expect(result.data.redeemPoints).toBe(false);
    });

    it('accepts a future ISO datetime string for appointmentDate (non-YYYY-MM-DD path)', () => {
      // Exercises the non-YYYY-MM-DD branch in isDateOnOrAfterToday
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDatetime(3),
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(true);
    });

    it('fails when serviceId is missing', () => {
      const result = createAppointmentSchema.safeParse({
        appointmentDate: getFutureDate(2),
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails when serviceId is not a valid UUID', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: 'not-a-uuid',
        appointmentDate: getFutureDate(2),
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails when appointmentDate is a past YYYY-MM-DD string', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: '1999-12-31',
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails when appointmentDate is completely unparseable', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: 'not-a-date',
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails when time format is incorrect (99:99)', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(2),
        appointmentTime: '99:99',
      });
      expect(result.success).toBe(false);
    });

    it('fails when time uses 12-hour format without leading zero (1:30)', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(2),
        appointmentTime: '1:30',
      });
      expect(result.success).toBe(false);
    });

    it('accepts edge-case valid times (00:00 and 23:59)', () => {
      const base = { serviceId: VALID_UUID, appointmentDate: getFutureDate(2) };
      expect(createAppointmentSchema.safeParse({ ...base, appointmentTime: '00:00' }).success).toBe(true);
      expect(createAppointmentSchema.safeParse({ ...base, appointmentTime: '23:59' }).success).toBe(true);
    });

    it('fails when notes exceed 500 characters', () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: VALID_UUID,
        appointmentDate: getFutureDate(2),
        appointmentTime: '10:00',
        notes: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── rescheduleAppointmentSchema ──────────────────────────────────────────

  describe('rescheduleAppointmentSchema', () => {
    it('validates a correct rescheduling payload', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: getFutureDate(3),
        appointmentTime: '14:30',
        notes: 'Change of schedule',
      });
      expect(result.success).toBe(true);
    });

    it('validates without optional notes', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: getFutureDate(3),
        appointmentTime: '14:30',
      });
      expect(result.success).toBe(true);
    });

    it('accepts future ISO datetime string for appointmentDate', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: getFutureDatetime(2),
        appointmentTime: '09:15',
      });
      expect(result.success).toBe(true);
    });

    it('fails on past date', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: '2000-06-01',
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails on invalid date string', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: 'bad-date',
        appointmentTime: '10:00',
      });
      expect(result.success).toBe(false);
    });

    it('fails on invalid time format', () => {
      const result = rescheduleAppointmentSchema.safeParse({
        appointmentDate: getFutureDate(2),
        appointmentTime: 'ten-thirty',
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── availableSlotsSchema ─────────────────────────────────────────────────

  describe('availableSlotsSchema', () => {
    it('validates a complete query object', () => {
      const result = availableSlotsSchema.safeParse({
        date: getFutureDate(1),
        serviceId: VALID_UUID,
        staffId: VALID_UUID,
      });
      expect(result.success).toBe(true);
    });

    it('validates with only the required date', () => {
      const result = availableSlotsSchema.safeParse({ date: getFutureDate(1) });
      expect(result.success).toBe(true);
    });

    it('fails on past date', () => {
      const result = availableSlotsSchema.safeParse({ date: '2000-01-01' });
      expect(result.success).toBe(false);
    });

    it('fails when date is missing', () => {
      const result = availableSlotsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('fails on unparseable date string', () => {
      const result = availableSlotsSchema.safeParse({ date: 'not-a-date' });
      expect(result.success).toBe(false);
    });

    it('accepts future ISO datetime string for date (non-YYYY-MM-DD path)', () => {
      const result = availableSlotsSchema.safeParse({ date: getFutureDatetime(1) });
      expect(result.success).toBe(true);
    });
  });
});
