"use client";

import React from "react";

interface CalendarProps {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  days?: number; // how many days ahead to show
  className?: string;
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function Calendar({ selectedDate, onSelectDate, days = 14, className = "" }: CalendarProps) {
  const getDays = () => {
    const list: Date[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      list.push(d);
    }
    return list;
  };

  const daysList = getDays();

  const handleKeyDown = (e: React.KeyboardEvent, date: Date) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectDate(date);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {daysList.map((date, idx) => {
          const isSelected = formatLocalDate(date) === formatLocalDate(selectedDate);
          return (
            <button
              key={idx}
              onClick={() => onSelectDate(date)}
              onKeyDown={(e) => handleKeyDown(e, date)}
              aria-pressed={isSelected}
              aria-label={`Select ${date.toDateString()}`}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border shrink-0 w-16 transition duration-200 cursor-pointer ${
                isSelected
                  ? "bg-primary text-black border-primary font-bold shadow-md shadow-primary/10"
                  : "bg-zinc-950/20 text-zinc-400 border-zinc-900 hover:border-zinc-800"
              }`}
            >
              <span className="text-[10px] tracking-wider uppercase font-semibold">
                {date.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-base font-extrabold mt-0.5">{date.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
