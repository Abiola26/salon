'use strict';

const { z } = require('zod');

// Time format: HH:MM (24-hour)
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const getTodayNewYorkString = (nowDate = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(nowDate);
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
};

const isDateOnOrAfterToday = (val) => {
  try {
    const todayStr = getTodayNewYorkString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return val >= todayStr;
    }
    const dateObj = new Date(val);
    if (isNaN(dateObj.getTime())) return false;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(dateObj);
    const partMap = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    const valNYStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    return valNYStr >= todayStr;
  } catch {
    return false;
  }
};

const createAppointmentSchema = z.object({
  serviceId: z.string({ required_error: 'Service ID is required' }).uuid('Invalid service ID'),
  appointmentDate: z
    .string({ required_error: 'Appointment date is required' })
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .refine(isDateOnOrAfterToday, {
      message: 'Appointment date cannot be in the past',
    }),
  appointmentTime: z
    .string({ required_error: 'Appointment time is required' })
    .regex(timeRegex, 'Time must be in HH:MM 24-hour format (e.g. 10:30)'),
  notes: z.string().max(500).optional(),
  // Optional — Zod strips unknown keys by default so these MUST be declared
  staffId: z.string().uuid('Invalid staff ID').optional(),
  couponCode: z.string().max(50).optional(),
  redeemPoints: z.boolean().optional().default(false),
});

const rescheduleAppointmentSchema = z.object({
  appointmentDate: z
    .string({ required_error: 'Appointment date is required' })
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .refine(isDateOnOrAfterToday, {
      message: 'Appointment date cannot be in the past',
    }),
  appointmentTime: z
    .string({ required_error: 'Appointment time is required' })
    .regex(timeRegex, 'Time must be in HH:MM 24-hour format'),
  notes: z.string().max(500).optional(),
});

const availableSlotsSchema = z.object({
  date: z
    .string({ required_error: 'date query param is required (YYYY-MM-DD)' })
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format. Use YYYY-MM-DD' })
    .refine(isDateOnOrAfterToday, {
      message: 'Date cannot be in the past',
    }),
  serviceId: z.string().uuid('Invalid service ID').optional(),
  // staffId must be declared or Zod strips it from req.query
  staffId: z.string().uuid('Invalid staff ID').optional(),
});

module.exports = { createAppointmentSchema, rescheduleAppointmentSchema, availableSlotsSchema };

