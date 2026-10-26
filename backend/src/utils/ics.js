'use strict';

const { SALON_TIMEZONE, CLIENT_URL } = require('../config/env');

// ─── RFC 5545 primitives ──────────────────────────────────────────────────────

// Escape TEXT values (RFC 5545 §3.3.11): backslash, semicolon, comma, newline
const escapeText = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Date → "YYYYMMDDTHHMMSSZ" (UTC)
const formatUtc = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Convert a salon-local wall time ("YYYY-MM-DD" + "HH:mm" in an IANA zone)
 * to a UTC instant. Two-pass offset correction: sample the zone's offset at
 * the instant that corresponds to the wall time treated as UTC. Exact across
 * DST transitions for the zones we care about (SALON_TIMEZONE).
 */
const zonedToUtc = (dateStr, timeStr, timeZone = SALON_TIMEZONE) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm || 0, 0);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(asIfUtc));

  const get = (type) => Number(parts.find((p) => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const observed = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));

  return new Date(asIfUtc - (observed - asIfUtc));
};

/**
 * Build a single-event VCALENDAR (METHOD:PUBLISH) as a CRLF-joined string.
 * Deliberately no line folding: every field we emit is far below the
 * 75-octet limit for salon-sized values.
 */
const buildIcsEvent = ({ uid, start, end, summary, description, location, dtstamp = new Date() }) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Salon Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(dtstamp)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
};

// ─── Domain helper ────────────────────────────────────────────────────────────

/**
 * Calendar event for an appointment. The same UID is used for confirmation
 * and reminder emails so calendar clients treat them as one event.
 */
const buildAppointmentIcs = (appointment, service) => {
  const dateStr = new Date(appointment.appointmentDate).toISOString().slice(0, 10);
  const start = zonedToUtc(dateStr, appointment.appointmentTime);
  const end = new Date(start.getTime() + (service.duration || 0) * 60 * 1000);

  return buildIcsEvent({
    uid: `appointment-${appointment.id}@salon-bookings`,
    start,
    end,
    summary: `${service.name} @ Salon Bookings`,
    description: `Your ${service.name} appointment. Manage or cancel: ${CLIENT_URL}/dashboard`,
  });
};

module.exports = { escapeText, formatUtc, zonedToUtc, buildIcsEvent, buildAppointmentIcs };
