import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BookingCalendar from "@/components/BookingCalendar";
import { formatLocalDate } from "@/lib/date";

const OPEN_DAYS = [1, 2, 3, 4, 5, 6];

describe("BookingCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday, November 11 2026
    vi.setSystemTime(new Date(2026, 10, 11, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables past and closed days", () => {
    render(
      <BookingCalendar
        selectedDate={new Date(2026, 10, 11)}
        onSelectDate={vi.fn()}
        openDays={OPEN_DAYS}
      />
    );

    expect(
      screen.getByLabelText("Tuesday, November 10, 2026 (past date)")
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Sunday, November 15, 2026 (closed)")
    ).toBeDisabled();
    expect(screen.getByLabelText("Friday, November 13, 2026")).toBeEnabled();
  });

  it("selects an open day", () => {
    const onSelectDate = vi.fn();
    render(
      <BookingCalendar
        selectedDate={new Date(2026, 10, 11)}
        onSelectDate={onSelectDate}
        openDays={OPEN_DAYS}
      />
    );

    fireEvent.click(screen.getByLabelText("Friday, November 13, 2026"));

    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(formatLocalDate(onSelectDate.mock.calls[0][0] as Date)).toBe(
      "2026-11-13"
    );
  });

  it("navigates months but cannot go before the current month", () => {
    render(
      <BookingCalendar
        selectedDate={new Date(2026, 10, 11)}
        onSelectDate={vi.fn()}
        openDays={OPEN_DAYS}
      />
    );

    const previous = screen.getByRole("button", { name: "Previous month" });
    expect(previous).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("December 2026")).toBeInTheDocument();
    expect(previous).toBeEnabled();
  });
});
