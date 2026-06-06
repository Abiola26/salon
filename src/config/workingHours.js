'use strict';

/**
 * Business Hours Configuration
 * Single source of truth for all booking time/day logic.
 *
 * - openDays: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * - openTime / closeTime: 24-hour "HH:MM" strings
 * - slotIntervalMinutes: granularity of available slots
 */
const WORKING_HOURS = {
  openDays: [1, 2, 3, 4, 5, 6], // Monday–Saturday (closed Sunday)
  openTime: '09:00',
  closeTime: '18:00',
  slotIntervalMinutes: 30,
};

/**
 * Convert "HH:MM" to total minutes since midnight.
 * @param {string} timeStr
 * @returns {number}
 */
const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Convert total minutes since midnight to "HH:MM".
 * @param {number} minutes
 * @returns {string}
 */
const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

/**
 * Check whether a given date (JS Date) is an open business day.
 * @param {Date} date
 * @returns {boolean}
 */
const isOpenDay = (date) => WORKING_HOURS.openDays.includes(date.getDay());

/**
 * Check whether a time slot (HH:MM) is within business hours
 * given a service duration so the appointment ends before close.
 * @param {string} time         - "HH:MM"
 * @param {number} durationMin  - service duration in minutes (default 0)
 * @returns {boolean}
 */
const isWithinBusinessHours = (time, durationMin = 0) => {
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + durationMin;
  const open = timeToMinutes(WORKING_HOURS.openTime);
  const close = timeToMinutes(WORKING_HOURS.closeTime);
  return slotStart >= open && slotEnd <= close;
};

/**
 * Generate all theoretically possible slot times for a given service duration.
 * @param {number} durationMin - service duration in minutes
 * @returns {string[]} - array of "HH:MM" strings
 */
const generateSlots = (durationMin = 0) => {
  const slots = [];
  const open = timeToMinutes(WORKING_HOURS.openTime);
  const close = timeToMinutes(WORKING_HOURS.closeTime);
  const interval = WORKING_HOURS.slotIntervalMinutes;

  for (let t = open; t + durationMin <= close; t += interval) {
    slots.push(minutesToTime(t));
  }
  return slots;
};

module.exports = {
  WORKING_HOURS,
  timeToMinutes,
  minutesToTime,
  isOpenDay,
  isWithinBusinessHours,
  generateSlots,
};
