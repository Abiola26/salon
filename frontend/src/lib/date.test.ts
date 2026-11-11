import { describe, expect, it } from "vitest";
import { formatLocalDate, nextOpenDate, parseLocalDate } from "./date";

describe("parseLocalDate", () => {
  it("parses YYYY-MM-DD as a local calendar date", () => {
    const date = parseLocalDate("2026-06-29");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(29);
    expect(date.getHours()).toBe(0);
  });

  it("ignores a trailing time component", () => {
    const date = parseLocalDate("2026-01-01T23:30:00.000Z");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it("does not shift the day in negative-offset timezones", () => {
    const date = parseLocalDate("2026-12-31");
    expect(formatLocalDate(date)).toBe("2026-12-31");
  });
});

describe("formatLocalDate", () => {
  it("pads month and day", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips with parseLocalDate", () => {
    expect(formatLocalDate(parseLocalDate("2027-03-09"))).toBe("2027-03-09");
  });
});

describe("nextOpenDate", () => {
  const openDays = [1, 2, 3, 4, 5, 6];

  it("returns the same day when it is open", () => {
    const saturday = new Date(2026, 5, 27);
    expect(formatLocalDate(nextOpenDate(saturday, openDays))).toBe("2026-06-27");
  });

  it("skips Sunday to the next open day", () => {
    const sunday = new Date(2026, 5, 28);
    expect(formatLocalDate(nextOpenDate(sunday, openDays))).toBe("2026-06-29");
  });

  it("ignores the time component", () => {
    const sundayEvening = new Date(2026, 5, 28, 22, 30);
    const result = nextOpenDate(sundayEvening, openDays);
    expect(result.getHours()).toBe(0);
    expect(formatLocalDate(result)).toBe("2026-06-29");
  });
});
