'use strict';

const { z } = require('zod');

// Time format: HH:MM (24-hour)
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createAppointmentSchema = z.object({
  serviceId: z.string({ required_error: 'Service ID is required' }).uuid('Invalid service ID'),
  appointmentDate: z
    .string({ required_error: 'Appointment date is required' })
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .refine((val) => new Date(val) >= new Date(new Date().setHours(0, 0, 0, 0)), {
      message: 'Appointment date cannot be in the past',
    }),
  appointmentTime: z
    .string({ required_error: 'Appointment time is required' })
    .regex(timeRegex, 'Time must be in HH:MM 24-hour format (e.g. 10:30)'),
  notes: z.string().max(500).optional(),
});

const rescheduleAppointmentSchema = z.object({
  appointmentDate: z
    .string({ required_error: 'Appointment date is required' })
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .refine((val) => new Date(val) >= new Date(new Date().setHours(0, 0, 0, 0)), {
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
    .refine((val) => new Date(val) >= new Date(new Date().setHours(0, 0, 0, 0)), {
      message: 'Date cannot be in the past',
    }),
  serviceId: z.string().uuid('Invalid service ID').optional(),
});

module.exports = { createAppointmentSchema, rescheduleAppointmentSchema, availableSlotsSchema };

