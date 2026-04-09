import { format, parseISO } from "date-fns";

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatMonthYear(monthYear: string): string {
  // Input: "2026-04" → "April 2026"
  const [year, month] = monthYear.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return format(date, "MMMM yyyy");
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "MMM d, yyyy");
}

export function toMonthYear(date: Date): string {
  return format(date, "yyyy-MM");
}

export function currentMonthYear(): string {
  return format(new Date(), "yyyy-MM");
}

export function prevMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return format(date, "yyyy-MM");
}

export function nextMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split("-").map(Number);
  const date = new Date(year, month, 1);
  return format(date, "yyyy-MM");
}
