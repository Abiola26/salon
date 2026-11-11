"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatLocalDate } from "@/lib/date";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BookingCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDays: number[];
}

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export default function BookingCalendar({
  selectedDate,
  onSelectDate,
  openDays,
}: BookingCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate));

  const today = startOfToday();
  const todayKey = formatLocalDate(today);
  const selectedKey = formatLocalDate(selectedDate);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const canGoBack = startOfMonth(viewMonth) > startOfMonth(today);
  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          className="h-8 w-8 rounded-lg border border-zinc-800 text-zinc-300 flex items-center justify-center transition hover:border-primary/50 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-white" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          className="h-8 w-8 rounded-lg border border-zinc-800 text-zinc-300 flex items-center justify-center transition hover:border-primary/50 hover:text-primary cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 py-1"
          >
            {label}
          </div>
        ))}

        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`blank-${idx}`} aria-hidden="true" />;
          }

          const dateKey = formatLocalDate(date);
          const isPast = date.getTime() < today.getTime();
          const isClosed = !openDays.includes(date.getDay());
          const isDisabled = isPast || isClosed;
          const isSelected = dateKey === selectedKey;
          const isToday = dateKey === todayKey;
          const label = date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          const disabledReason = isPast ? "past date" : "closed";

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-label={
                isDisabled ? `${label} (${disabledReason})` : label
              }
              title={
                isDisabled
                  ? `This date is ${disabledReason}`
                  : `Book ${label}`
              }
              onClick={() => onSelectDate(date)}
              className={`h-10 sm:h-11 rounded-xl border text-xs sm:text-sm font-bold transition text-center cursor-pointer ${
                isSelected
                  ? "bg-primary text-black border-primary shadow-md shadow-primary/20"
                  : isDisabled
                  ? "bg-zinc-950/60 text-zinc-700 border-transparent cursor-not-allowed opacity-60"
                  : `bg-zinc-950/30 text-zinc-200 border-zinc-900 hover:border-primary/50 ${
                      isToday ? "ring-1 ring-primary/40" : ""
                    }`
              }`}
            >
              <span className="block leading-none">{date.getDate()}</span>
              {isToday && (
                <span
                  className={`block text-[8px] font-extrabold uppercase tracking-wider mt-0.5 ${
                    isSelected ? "text-black/70" : "text-primary"
                  }`}
                >
                  Today
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-zinc-600 text-center">
        Past and closed days are unavailable.
      </p>
    </div>
  );
}
