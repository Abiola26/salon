'use strict';

const {
  escapeText,
  formatUtc,
  zonedToUtc,
  buildIcsEvent,
  buildAppointmentIcs,
} = require('../../src/utils/ics');

describe('ics utils', () => {
  describe('escapeText', () => {
    it('escapes backslash, semicolon, comma and newlines', () => {
      expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    });

    it('escapes backslashes before other characters', () => {
      expect(escapeText('\\,')).toBe('\\\\\\,');
    });
  });

  describe('formatUtc', () => {
    it('formats a date as YYYYMMDDTHHMMSSZ', () => {
      expect(formatUtc(new Date('2026-06-25T14:05:07.000Z'))).toBe('20260625T140507Z');
    });
  });

  describe('zonedToUtc', () => {
    it('converts EDT wall time to UTC (summer)', () => {
      // 2026-06-29 10:00 America/New_York (EDT, UTC-4) → 14:00Z
      expect(zonedToUtc('2026-06-29', '10:00', 'America/New_York').toISOString()).toBe(
        '2026-06-29T14:00:00.000Z'
      );
    });

    it('converts EST wall time to UTC (winter)', () => {
      // 2026-12-14 10:00 America/New_York (EST, UTC-5) → 15:00Z
      expect(zonedToUtc('2026-12-14', '10:00', 'America/New_York').toISOString()).toBe(
        '2026-12-14T15:00:00.000Z'
      );
    });

    it('tolerates minutes missing from the time string', () => {
      expect(zonedToUtc('2026-06-29', '10', 'America/New_York').toISOString()).toBe(
        '2026-06-29T14:00:00.000Z'
      );
    });
  });

  describe('buildIcsEvent', () => {
    it('emits a CRLF-joined VEVENT with the given fields', () => {
      const ics = buildIcsEvent({
        uid: 'evt-1@salon',
        start: new Date('2026-06-25T14:00:00Z'),
        end: new Date('2026-06-25T14:30:00Z'),
        summary: 'Cut & Color',
        description: 'Line one\nLine two',
        location: 'Salon; Main St, Floor 2',
        dtstamp: new Date('2026-06-01T12:00:00Z'),
      });

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('METHOD:PUBLISH\r\n');
      expect(ics).toContain('UID:evt-1@salon\r\n');
      expect(ics).toContain('DTSTAMP:20260601T120000Z\r\n');
      expect(ics).toContain('DTSTART:20260625T140000Z\r\n');
      expect(ics).toContain('DTEND:20260625T143000Z\r\n');
      expect(ics).toContain('SUMMARY:Cut & Color\r\n');
      expect(ics).toContain('DESCRIPTION:Line one\\nLine two\r\n');
      expect(ics).toContain('LOCATION:Salon\\; Main St\\, Floor 2\r\n');
      expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR')).toBe(true);
    });

    it('omits optional fields when not provided', () => {
      const ics = buildIcsEvent({
        uid: 'evt-2@salon',
        start: new Date('2026-06-25T14:00:00Z'),
        end: new Date('2026-06-25T14:30:00Z'),
        summary: 'Cut',
        dtstamp: new Date('2026-06-01T12:00:00Z'),
      });

      expect(ics).not.toContain('DESCRIPTION:');
      expect(ics).not.toContain('LOCATION:');
    });
  });

  describe('buildAppointmentIcs', () => {
    it('builds the event with a stable UID and duration-aware end time', () => {
      const ics = buildAppointmentIcs(
        { id: 'a1', appointmentDate: '2026-06-25', appointmentTime: '10:00' },
        { name: 'Cut, Signature', duration: 45 }
      );

      expect(ics).toContain('UID:appointment-a1@salon-bookings\r\n');
      // 2026-06-25 10:00 EDT → 14:00Z, +45 min → 14:45Z
      expect(ics).toContain('DTSTART:20260625T140000Z\r\n');
      expect(ics).toContain('DTEND:20260625T144500Z\r\n');
      expect(ics).toContain('SUMMARY:Cut\\, Signature @ Salon Bookings\r\n');
      expect(ics).toContain('/dashboard');
    });

    it('defaults the end time to the start when duration is missing', () => {
      const ics = buildAppointmentIcs(
        { id: 'a2', appointmentDate: '2026-06-25', appointmentTime: '10:00' },
        { name: 'Cut' }
      );

      expect(ics).toContain('DTSTART:20260625T140000Z\r\n');
      expect(ics).toContain('DTEND:20260625T140000Z\r\n');
    });
  });
});
