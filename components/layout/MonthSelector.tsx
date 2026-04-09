"use client";

import { formatMonthYear, prevMonthYear, nextMonthYear } from "@/lib/utils/format";

interface MonthSelectorProps {
  monthYear: string;
  onChange: (monthYear: string) => void;
}

export default function MonthSelector({ monthYear, onChange }: MonthSelectorProps) {
  return (
    <div className="flex items-center justify-between bg-card-bg border-b border-[rgba(255,255,255,0.08)] px-4 py-2">
      <button
        onClick={() => onChange(prevMonthYear(monthYear))}
        className="flex items-center justify-center w-10 h-10 rounded-xl text-text-secondary hover:bg-elevated active:bg-elevated/80 transition-colors"
        aria-label="Previous month"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-text-primary font-medium text-base">
        {formatMonthYear(monthYear)}
      </span>
      <button
        onClick={() => onChange(nextMonthYear(monthYear))}
        className="flex items-center justify-center w-10 h-10 rounded-xl text-text-secondary hover:bg-elevated active:bg-elevated/80 transition-colors"
        aria-label="Next month"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
