"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import MonthSelector from "@/components/layout/MonthSelector";
import { calculateBalance, enrichExpensesWithCategoryRatios, getEffectiveShares } from "@/lib/utils/balance";
import { detectMissingExpenses } from "@/lib/utils/expenses";
import { formatCurrency, formatMonthYear, currentMonthYear, formatDate, prevMonthYear } from "@/lib/utils/format";
import type { Profile, SplitRatio, JointExpense, Payment, JointCategory, CategoryRatioHistory } from "@/types/database";
import type { HouseholdMembers } from "@/types/database";
import Decimal from "decimal.js";

interface HomeClientProps {
  currentUserId: string;
  householdMembers: HouseholdMembers | null;
  splitRatios: SplitRatio[];
  allExpenses: (JointExpense & { joint_categories: { id: string; name: string } | null })[];
  allPayments: Payment[];
  requiredCategories: Pick<JointCategory, "id" | "name">[];
  recurringCount: number;
  categoryRatioHistory: CategoryRatioHistory[];
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function offsetMonthYear(base: string, offsetMonths: number): string {
  const [year, month] = base.split("-").map(Number);
  const d = new Date(year, month - 1 - offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shortMonthLabel(my: string): string {
  const month = parseInt(my.split("-")[1], 10);
  return SHORT_MONTHS[month - 1];
}

function DeltaStat({ label, delta }: { label: string; delta: Decimal }) {
  const isUp = delta.greaterThan(0.005);
  const isDown = delta.lessThan(-0.005);
  const color = isUp ? "#E05252" : isDown ? "#1D9E75" : "#4A4F58";
  const arrow = isUp ? "↑" : isDown ? "↓" : "";
  return (
    <div style={{ textAlign: "right" }}>
      <p style={{ fontSize: 10, color: "#4A4F58", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 500, color, fontVariantNumeric: "tabular-nums" }}>
        {arrow}{arrow ? " " : ""}{formatCurrency(delta.abs().toNumber())}
      </p>
    </div>
  );
}

function PersonCard({
  name,
  share,
  paid,
  net,
}: {
  name: string;
  share: Decimal;
  paid: Decimal;
  net: Decimal;
}) {
  const isOwed = net.greaterThan(0.005);
  const owes = net.lessThan(-0.005);
  const netColor = isOwed ? "#1D9E75" : owes ? "#E05252" : "#4A4F58";
  const netLabel = isOwed
    ? `owed ${formatCurrency(net.toNumber())}`
    : owes
    ? `owes ${formatCurrency(net.abs().toNumber())}`
    : "settled";

  return (
    <div style={{ background: "#131618", borderRadius: 10, padding: 12 }}>
      <p
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#4A4F58",
          marginBottom: 6,
        }}
      >
        {name}
      </p>
      <p
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: "#F0F0F0",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatCurrency(share.toNumber())}
      </p>
      <p style={{ fontSize: 11, color: "#4A4F58", marginTop: 2 }}>
        paid {formatCurrency(paid.toNumber())}
      </p>
      <p style={{ fontSize: 11, color: netColor, marginTop: 4, fontWeight: 500 }}>
        {netLabel}
      </p>
    </div>
  );
}

export default function HomeClient({
  currentUserId,
  householdMembers,
  splitRatios,
  allExpenses,
  allPayments,
  requiredCategories,
  categoryRatioHistory,
}: HomeClientProps) {
  const [monthYear, setMonthYear] = useState(currentMonthYear());

  const user1 = householdMembers?.user1 ?? null;
  const user2 = householdMembers?.user2 ?? null;
  const allProfiles: Profile[] = [user1, user2].filter(Boolean) as Profile[];
  const currentProfile = allProfiles.find((p) => p.id === currentUserId);

  const enrichedExpenses = useMemo(
    () => enrichExpensesWithCategoryRatios(allExpenses, categoryRatioHistory),
    [allExpenses, categoryRatioHistory]
  );

  const balance = useMemo(() => {
    if (!user1 || !user2) return null;
    return calculateBalance(enrichedExpenses, allPayments, splitRatios, user1.id, user2.id);
  }, [enrichedExpenses, allPayments, splitRatios, user1, user2]);

  const monthExpenses = useMemo(
    () => enrichedExpenses.filter((e) => e.month_year === monthYear),
    [enrichedExpenses, monthYear]
  );

  const monthlySummary = useMemo(() => {
    if (!user1 || !user2) return null;

    let totalSpend = new Decimal(0);
    let user1Share = new Decimal(0);
    let user2Share = new Decimal(0);
    let user1Paid = new Decimal(0);
    let user2Paid = new Decimal(0);

    for (const expense of monthExpenses) {
      const amount = new Decimal(expense.amount);
      totalSpend = totalSpend.plus(amount);

      if (expense.paid_by === user1.id) {
        user1Paid = user1Paid.plus(amount);
      } else if (expense.paid_by === user2.id) {
        user2Paid = user2Paid.plus(amount);
      }

      const { user1Share: u1, user2Share: u2 } = getEffectiveShares(expense, splitRatios);
      user1Share = user1Share.plus(u1);
      user2Share = user2Share.plus(u2);
    }

    return { totalSpend, user1Share, user2Share, user1Paid, user2Paid };
  }, [monthExpenses, user1, user2, splitRatios]);

  const missingExpenses = useMemo(
    () => detectMissingExpenses(monthYear, requiredCategories, monthExpenses),
    [monthYear, requiredCategories, monthExpenses]
  );

  // YTD: sum all expenses from Jan 1 of the selected month's year through the selected month
  const ytdTotal = useMemo(() => {
    const [year] = monthYear.split("-");
    const startOfYear = `${year}-01`;
    return enrichedExpenses
      .filter((e) => e.month_year >= startOfYear && e.month_year <= monthYear)
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0));
  }, [enrichedExpenses, monthYear]);

  // Prior 5 months + current month for bar chart
  const sixMonthHistory = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const my = offsetMonthYear(monthYear, 5 - i);
      const total = enrichedExpenses
        .filter((e) => e.month_year === my)
        .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0));
      return { monthYear: my, label: shortMonthLabel(my), total, isCurrent: i === 5 };
    });
  }, [enrichedExpenses, monthYear]);

  const maxBarValue = Math.max(...sixMonthHistory.map((m) => m.total.toNumber()), 1);

  // Deltas
  const prevMonthTotal = useMemo(() => {
    const prev = prevMonthYear(monthYear);
    return enrichedExpenses
      .filter((e) => e.month_year === prev)
      .reduce((sum, e) => sum.plus(new Decimal(e.amount)), new Decimal(0));
  }, [enrichedExpenses, monthYear]);

  const threeMonthAvg = useMemo(() => {
    const total = [1, 2, 3].reduce((sum, i) => {
      const my = offsetMonthYear(monthYear, i);
      return sum.plus(
        enrichedExpenses
          .filter((e) => e.month_year === my)
          .reduce((s, e) => s.plus(new Decimal(e.amount)), new Decimal(0))
      );
    }, new Decimal(0));
    return total.dividedBy(3);
  }, [enrichedExpenses, monthYear]);

  const deltaVsLastMonth = (monthlySummary?.totalSpend ?? new Decimal(0)).minus(prevMonthTotal);
  const deltaVs3MonthAvg = (monthlySummary?.totalSpend ?? new Decimal(0)).minus(threeMonthAvg);

  // Per-person monthly net (paid - share)
  const user1Net = (monthlySummary?.user1Paid ?? new Decimal(0)).minus(
    monthlySummary?.user1Share ?? new Decimal(0)
  );
  const user2Net = (monthlySummary?.user2Paid ?? new Decimal(0)).minus(
    monthlySummary?.user2Share ?? new Decimal(0)
  );

  // Settle up card text based on who is the current user
  const settleUpText = useMemo(() => {
    if (!balance || balance.direction === "settled") return "All settled up";
    const amount = formatCurrency(balance.amount.toNumber());
    if (balance.direction === "user2_owes_user1") {
      return currentUserId === user1?.id
        ? `${user2?.display_name ?? "Partner"} owes you ${amount}`
        : `You owe ${user1?.display_name ?? "Partner"} ${amount}`;
    } else {
      return currentUserId === user2?.id
        ? `${user1?.display_name ?? "Partner"} owes you ${amount}`
        : `You owe ${user2?.display_name ?? "Partner"} ${amount}`;
    }
  }, [balance, currentUserId, user1, user2]);

  const hasBalance = balance && balance.direction !== "settled";
  const currentUserName = currentProfile?.display_name ?? "You";
  const recentExpenses = monthExpenses.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-text-muted text-xs">Welcome back</p>
            <h1 className="text-lg font-medium text-text-primary">Family Finances</h1>
          </div>
          <Link
            href="/settings"
            className="w-10 h-10 rounded-full bg-primary-dark border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-sm font-bold text-primary"
          >
            {currentUserName.charAt(0).toUpperCase()}
          </Link>
        </div>
        <MonthSelector monthYear={monthYear} onChange={setMonthYear} />
      </header>

      <div className="px-4 py-4 space-y-3">
        {/* Alert banner */}
        {missingExpenses.length > 0 && (
          <div
            style={{
              background: "rgba(186,117,23,0.12)",
              border: "1px solid rgba(186,117,23,0.25)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#EF9F27",
                  flexShrink: 0,
                }}
              />
              <p className="flex-1 text-sm text-text-primary">
                {missingExpenses.length} required expense
                {missingExpenses.length > 1 ? "s" : ""} missing —{" "}
                <span style={{ color: "#8A8F98", fontSize: 12 }}>
                  {missingExpenses.map((e) => e.name).join(", ")}
                </span>
              </p>
              <Link
                href="/missing-expenses"
                style={{
                  color: "#EF9F27",
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Review →
              </Link>
            </div>
          </div>
        )}

        {/* Main spend card */}
        <div
          style={{
            background: "#131618",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            {/* Left: totals */}
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#4A4F58",
                }}
              >
                {formatMonthYear(monthYear)}
              </p>
              <p
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: "#F0F0F0",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.15,
                  marginTop: 4,
                }}
              >
                {formatCurrency(monthlySummary?.totalSpend.toNumber() ?? 0)}
              </p>
              <p style={{ fontSize: 12, color: "#4A4F58", marginTop: 2 }}>total family spend</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#4A4F58",
                  }}
                >
                  YTD
                </span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#8A8F98",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrency(ytdTotal.toNumber())}
                </span>
              </div>
            </div>

            {/* Right: delta stats */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
              <DeltaStat label="vs last month" delta={deltaVsLastMonth} />
              <DeltaStat label="vs 3-month avg" delta={deltaVs3MonthAvg} />
            </div>
          </div>

          {/* Mini bar chart */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 5,
                height: 40,
              }}
            >
              {sixMonthHistory.map((bar) => {
                const barH = Math.max((bar.total.toNumber() / maxBarValue) * 40, 3);
                return (
                  <div
                    key={bar.monthYear}
                    style={{ flex: 1, height: barH, flexShrink: 0 }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: bar.isCurrent ? "#1D9E75" : "rgba(29,158,117,0.3)",
                        borderRadius: "2px 2px 0 0",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
              {sixMonthHistory.map((bar) => (
                <div
                  key={bar.monthYear}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 10,
                    color: "#4A4F58",
                  }}
                >
                  {bar.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Per-person grid */}
        {user1 && user2 && monthlySummary && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <PersonCard
              name={user1.display_name}
              share={monthlySummary.user1Share}
              paid={monthlySummary.user1Paid}
              net={user1Net}
            />
            <PersonCard
              name={user2.display_name}
              share={monthlySummary.user2Share}
              paid={monthlySummary.user2Paid}
              net={user2Net}
            />
          </div>
        )}

        {/* Settle up card */}
        <div
          style={{
            background: "rgba(29,158,117,0.12)",
            border: "1px solid rgba(29,158,117,0.25)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p
              style={{
                color: "#1D9E75",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {settleUpText}
            </p>
            {hasBalance && (
              <Link
                href="/settle-up"
                style={{
                  background: "#1D9E75",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: 8,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Settle up
              </Link>
            )}
          </div>
        </div>

        {/* Add expense button */}
        <Link
          href="/expenses/add"
          className="flex items-center justify-center gap-2 w-full bg-primary text-white font-medium rounded-xl min-h-[52px] text-base"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </Link>

        {/* Recent expenses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary font-medium">Recent expenses</h2>
            <Link
              href={`/expenses?month=${monthYear}`}
              className="text-primary text-sm font-medium min-h-[44px] flex items-center"
            >
              View all
            </Link>
          </div>

          {recentExpenses.length === 0 && missingExpenses.length === 0 ? (
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
              <p className="text-text-muted text-sm">No expenses for this month yet</p>
              <Link href="/expenses/add" className="text-primary text-sm font-medium mt-2 block">
                Add your first expense →
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Missing required expense placeholders */}
              {missingExpenses.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-danger-surface border border-danger/20 rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{cat.name}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-danger bg-danger/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        required
                      </span>
                    </div>
                    <p className="text-text-muted text-xs mt-0.5">Not entered</p>
                  </div>
                  <Link
                    href={`/expenses/add?category=${cat.id}`}
                    className="text-primary text-xs font-medium min-h-[44px] flex items-center"
                  >
                    + Add
                  </Link>
                </div>
              ))}

              {/* Real expense rows */}
              {recentExpenses.map((expense) => {
                const payer = allProfiles.find((p) => p.id === expense.paid_by);
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="bg-card-bg hover:bg-elevated rounded-xl px-4 py-3 flex items-center gap-3 block"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {expense.description}
                        </span>
                        {expense.is_recurring && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-primary bg-primary-light px-1.5 py-0.5 rounded flex-shrink-0">
                            recurring
                          </span>
                        )}
                      </div>
                      <p className="text-text-muted text-xs mt-0.5">
                        {expense.joint_categories?.name ?? "Uncategorized"} ·{" "}
                        {payer?.display_name ?? "Unknown"} · {formatDate(expense.expense_date)}
                      </p>
                    </div>
                    <span className="text-text-primary font-medium text-sm flex-shrink-0 tabular-nums">
                      {formatCurrency(expense.amount)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
