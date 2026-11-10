'use strict';

const { SALON_TIMEZONE } = require('../config/env');
const { zonedToUtc } = require('./ics');

const salonDateString = (date = new Date(), timeZone = SALON_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const addDaysToDateString = (dateStr, days) => {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

const toDateOnly = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const appointmentStartAt = (appointment, timeZone = SALON_TIMEZONE) =>
  zonedToUtc(
    toDateOnly(appointment.appointmentDate),
    appointment.appointmentTime,
    timeZone
  );

const appointmentEndAt = (
  appointment,
  durationMinutes = 0,
  timeZone = SALON_TIMEZONE
) =>
  new Date(
    appointmentStartAt(appointment, timeZone).getTime() +
      Math.max(Number(durationMinutes) || 0, 0) * 60 * 1000
  );

module.exports = {
  salonDateString,
  addDaysToDateString,
  toDateOnly,
  appointmentStartAt,
  appointmentEndAt,
};
