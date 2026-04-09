"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import Link from "next/link";
import MonthSelector from "@/components/layout/MonthSelector";
import { formatCurrency, currentMonthYear, formatMonthYear } from "@/lib/utils/format";
import type { JointExpense, JointCategory, Profile } from "@/types/database";

interface ExpenseRow extends Partial<JointExpense> {
  id: string;
  amount: number;
  paid_by: string;
  expense_date: string;
  month_year: string;
  category_id: string | null;
  joint_categories: { id: string; name: string } | null;
}

interface ReportsClientProps {
  currentUserId: string;
  expenses: ExpenseRow[];
  categories: Pick<JointCategory, "id" | "name">[];
  profiles: Pick<Profile, "id" | "display_name">[];
}

type TabType = "monthly" | "annual" | "yoy";

export default function ReportsClient({
  currentUserId,
  expenses,
  categories,
  profiles,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>("monthly");
  const [monthYear, setMonthYear] = useState(currentMonthYear());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [compareYears, setCompareYears] = useState<number[]>([
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
  ]);

  const currentYear = new Date().getFullYear();

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set(expenses.map((e) => parseInt(e.month_year.split("-")[0])));
    return [...years].sort((a, b) => b - a);
  }, [expenses]);

  // --- Monthly tab data ---
  const monthlyData = useMemo(() => {
    const monthExpenses = expenses.filter((e) => e.month_year === monthYear);
    const prevMonth = (() => {
      const [y, m] = monthYear.split("-").map(Number);
      const d = new Date(y, m - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const prevMonthExpenses = expenses.filter((e) => e.month_year === prevMonth);
    const [year, month] = monthYear.split("-").map(Number);
    const sameMonthLastYear = `${year - 1}-${String(month).padStart(2, "0")}`;
    const lastYearSameMonthExpenses = expenses.filter((e) => e.month_year === sameMonthLastYear);

    const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const prevTotal = prevMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const lastYearTotal = lastYearSameMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);

    // Category breakdown
    const catMap = new Map<string, number>();
    for (const exp of monthExpenses) {
      const name = exp.joint_categories?.name ?? "Uncategorized";
      catMap.set(name, (catMap.get(name) ?? 0) + Number(exp.amount));
    }
    const categoryData = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    // Who paid
    const user1Paid = monthExpenses
      .filter((e) => profiles.find((p) => p.id === e.paid_by) === profiles[0])
      .reduce((s, e) => s + Number(e.amount), 0);
    const user2Paid = monthExpenses
      .filter((e) => profiles.find((p) => p.id === e.paid_by) === profiles[1])
      .reduce((s, e) => s + Number(e.amount), 0);

    return {
      total,
      prevTotal,
      lastYearTotal,
      categoryData,
      user1Paid,
      user2Paid,
      hasLastYear: lastYearSameMonthExpenses.length > 0,
    };
  }, [expenses, monthYear, profiles]);

  // --- Annual tab data ---
  const annualData = useMemo(() => {
    const yearExpenses = expenses.filter(
      (e) => e.month_year.startsWith(String(selectedYear))
    );

    // Monthly spend for line chart
    const monthlySpend: { month: string; amount: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const my = `${selectedYear}-${String(m).padStart(2, "0")}`;
      const total = yearExpenses
        .filter((e) => e.month_year === my)
        .reduce((s, e) => s + Number(e.amount), 0);
      monthlySpend.push({
        month: new Date(selectedYear, m - 1, 1).toLocaleString("en", { month: "short" }),
        amount: total,
      });
    }

    // Category breakdown
    const catMap = new Map<string, number>();
    for (const exp of yearExpenses) {
      const name = exp.joint_categories?.name ?? "Uncategorized";
      catMap.set(name, (catMap.get(name) ?? 0) + Number(exp.amount));
    }
    const categoryData = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    const total = yearExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const user1Paid = yearExpenses
      .filter((e) => profiles[0] && e.paid_by === profiles[0]?.id)
      .reduce((s, e) => s + Number(e.amount), 0);
    const user2Paid = yearExpenses
      .filter((e) => profiles[1] && e.paid_by === profiles[1]?.id)
      .reduce((s, e) => s + Number(e.amount), 0);

    return { monthlySpend, categoryData, total, user1Paid, user2Paid };
  }, [expenses, selectedYear, profiles]);

  // --- Year-over-year data ---
  const yoyData = useMemo(() => {
    const colors: Record<number, string> = {};
    compareYears.forEach((y, i) => {
      colors[y] = i === 0 ? "#1D9E75" : i === 1 ? "#5DCAA5" : "#9FE1CB";
    });

    const months = Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleString("en", { month: "short" })
    );

    const chartData = months.map((month, i) => {
      const dataPoint: Record<string, string | number> = { month };
      for (const year of compareYears) {
        const my = `${year}-${String(i + 1).padStart(2, "0")}`;
        const total = expenses
          .filter((e) => e.month_year === my)
          .reduce((s, e) => s + Number(e.amount), 0);
        dataPoint[String(year)] = total;
      }
      return dataPoint;
    });

    // Category comparison
    const catMap = new Map<string, Record<number, number>>();
    for (const exp of expenses) {
      const expYear = parseInt(exp.month_year.split("-")[0]);
      if (!compareYears.includes(expYear)) continue;
      const name = exp.joint_categories?.name ?? "Uncategorized";
      if (!catMap.has(name)) catMap.set(name, {});
      const existing = catMap.get(name)!;
      existing[expYear] = (existing[expYear] ?? 0) + Number(exp.amount);
    }

    const categoryComparison = [...catMap.entries()]
      .map(([name, yearTotals]) => ({ name, yearTotals }))
      .sort(
        (a, b) =>
          (b.yearTotals[compareYears[0]] ?? 0) -
          (a.yearTotals[compareYears[0]] ?? 0)
      );

    return { chartData, categoryComparison, colors };
  }, [expenses, compareYears]);

  const hasData = expenses.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="px-4 py-3">
          <h1 className="text-lg font-medium text-text-primary">Reports</h1>
        </div>
        {/* Tab bar */}
        <div className="flex px-4 gap-1 pb-0">
          {(["monthly", "annual", "yoy"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-t-lg transition-colors min-h-[44px] ${
                activeTab === tab
                  ? "bg-background text-primary border-b-2 border-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab === "monthly" ? "Monthly" : tab === "annual" ? "Annual" : "Year vs Year"}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Monthly tab */}
        {activeTab === "monthly" && (
          <>
            <MonthSelector monthYear={monthYear} onChange={setMonthYear} />

            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-3">
                <p className="text-text-muted text-xs">Total</p>
                <p className="text-text-primary font-bold text-base mt-0.5">
                  {formatCurrency(monthlyData.total)}
                </p>
              </div>
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-3">
                <p className="text-text-muted text-xs">vs last month</p>
                <p
                  className={`font-bold text-base mt-0.5 ${
                    monthlyData.total > monthlyData.prevTotal
                      ? "text-danger"
                      : "text-success"
                  }`}
                >
                  {monthlyData.prevTotal === 0
                    ? "—"
                    : `${monthlyData.total > monthlyData.prevTotal ? "+" : ""}${formatCurrency(monthlyData.total - monthlyData.prevTotal)}`}
                </p>
              </div>
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-3">
                <p className="text-text-muted text-xs">vs last year</p>
                <p
                  className={`font-bold text-base mt-0.5 ${
                    !monthlyData.hasLastYear
                      ? "text-text-muted"
                      : monthlyData.total > monthlyData.lastYearTotal
                      ? "text-danger"
                      : "text-success"
                  }`}
                >
                  {!monthlyData.hasLastYear
                    ? "—"
                    : `${monthlyData.total > monthlyData.lastYearTotal ? "+" : ""}${formatCurrency(monthlyData.total - monthlyData.lastYearTotal)}`}
                </p>
              </div>
            </div>

            {/* Category bar chart */}
            {monthlyData.categoryData.length > 0 ? (
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                <h3 className="text-text-primary font-semibold text-sm mb-3">By category</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthlyData.categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4A4F58" }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10, fill: "#4A4F58" }} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="amount" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
                <p className="text-text-muted text-sm">No expenses for this month</p>
              </div>
            )}

            {/* Category table */}
            {monthlyData.categoryData.length > 0 && (
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
                  <h3 className="text-text-primary font-semibold text-sm">Category breakdown</h3>
                </div>
                {monthlyData.categoryData.map((cat, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-[rgba(255,255,255,0.08)]">
                    <span className="flex-1 text-text-primary text-sm">{cat.name}</span>
                    <div className="w-20 h-1.5 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(cat.amount / monthlyData.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-text-secondary text-sm w-20 text-right">
                      {formatCurrency(cat.amount)}
                    </span>
                    <span className="text-text-muted text-xs w-10 text-right">
                      {((cat.amount / monthlyData.total) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Who paid */}
            <div className="grid grid-cols-2 gap-3">
              {profiles.map((profile, i) => {
                const paid = i === 0 ? monthlyData.user1Paid : monthlyData.user2Paid;
                return (
                  <div key={profile.id} className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                    <p className="text-text-muted text-xs">{profile.display_name} paid</p>
                    <p className="text-text-primary font-bold text-base mt-1">
                      {formatCurrency(paid)}
                    </p>
                    <p className="text-text-muted text-xs">
                      {monthlyData.total > 0
                        ? `${((paid / monthlyData.total) * 100).toFixed(0)}% of total`
                        : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Annual tab */}
        {activeTab === "annual" && (
          <>
            {/* Year selector chips */}
            <div className="flex gap-2 flex-wrap">
              {availableYears.length === 0
                ? [currentYear].map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`px-4 py-2 rounded-full text-sm font-medium min-h-[36px] ${
                        selectedYear === year
                          ? "bg-primary text-white"
                          : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                      }`}
                    >
                      {year}
                    </button>
                  ))
                : availableYears.map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`px-4 py-2 rounded-full text-sm font-medium min-h-[36px] ${
                        selectedYear === year
                          ? "bg-primary text-white"
                          : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
            </div>

            {/* Monthly line chart */}
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
              <h3 className="text-text-primary font-semibold text-sm mb-3">
                Monthly spend {selectedYear}
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={annualData.monthlySpend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#4A4F58" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#4A4F58" }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Line type="monotone" dataKey="amount" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Annual total */}
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
              <p className="text-text-muted text-sm">Total {selectedYear}</p>
              <p className="text-text-primary font-bold text-2xl mt-1">
                {formatCurrency(annualData.total)}
              </p>
            </div>

            {/* Category bar chart */}
            {annualData.categoryData.length > 0 && (
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                <h3 className="text-text-primary font-semibold text-sm mb-3">By category</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={annualData.categoryData} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#4A4F58" }} interval={0} angle={-30} textAnchor="end" height={55} />
                    <YAxis tick={{ fontSize: 10, fill: "#4A4F58" }} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="amount" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Who paid */}
            <div className="grid grid-cols-2 gap-3">
              {profiles.map((profile, i) => {
                const paid = i === 0 ? annualData.user1Paid : annualData.user2Paid;
                return (
                  <div key={profile.id} className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                    <p className="text-text-muted text-xs">{profile.display_name} paid</p>
                    <p className="text-text-primary font-bold text-base mt-1">
                      {formatCurrency(paid)}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Year-over-year tab */}
        {activeTab === "yoy" && (
          <>
            {availableYears.length < 2 ? (
              <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
                <p className="text-text-secondary text-sm">
                  Import historical data to enable year-over-year comparisons.
                </p>
                <Link href="/upload" className="text-primary text-sm font-medium mt-2 block">
                  Import historical data →
                </Link>
              </div>
            ) : (
              <>
                {/* Year selectors */}
                <div>
                  <p className="text-text-secondary text-xs font-medium mb-2">Compare years (up to 3):</p>
                  <div className="flex gap-2 flex-wrap">
                    {availableYears.map((year) => {
                      const selected = compareYears.includes(year);
                      return (
                        <button
                          key={year}
                          onClick={() => {
                            if (selected) {
                              if (compareYears.length > 1) {
                                setCompareYears(compareYears.filter((y) => y !== year));
                              }
                            } else if (compareYears.length < 3) {
                              setCompareYears([...compareYears, year].sort((a, b) => b - a));
                            }
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-medium min-h-[36px] ${
                            selected
                              ? "bg-primary text-white"
                              : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                          }`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grouped bar chart */}
                <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4">
                  <h3 className="text-text-primary font-semibold text-sm mb-3">Monthly spend comparison</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={yoyData.chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#4A4F58" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#4A4F58" }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      {compareYears.map((year) => (
                        <Bar
                          key={year}
                          dataKey={String(year)}
                          fill={yoyData.colors[year]}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Category comparison table */}
                <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
                  <div className="grid px-4 py-2 border-b border-[rgba(255,255,255,0.08)]"
                    style={{ gridTemplateColumns: `1fr ${compareYears.map(() => "80px").join(" ")} 60px` }}
                  >
                    <span className="text-text-muted text-xs font-medium">Category</span>
                    {compareYears.map((y) => (
                      <span key={y} className="text-text-muted text-xs font-medium text-right">{y}</span>
                    ))}
                    <span className="text-text-muted text-xs font-medium text-right">Change</span>
                  </div>
                  {yoyData.categoryComparison.map((row, i) => {
                    const y1 = row.yearTotals[compareYears[0]] ?? 0;
                    const y2 = row.yearTotals[compareYears[1]] ?? 0;
                    const pctChange = y2 > 0 ? ((y1 - y2) / y2) * 100 : null;
                    return (
                      <div
                        key={i}
                        className="grid px-4 py-3 border-b last:border-b-0 border-[rgba(255,255,255,0.08)] items-center"
                        style={{ gridTemplateColumns: `1fr ${compareYears.map(() => "80px").join(" ")} 60px` }}
                      >
                        <span className="text-text-primary text-sm truncate">{row.name}</span>
                        {compareYears.map((y) => (
                          <span key={y} className="text-text-secondary text-sm text-right">
                            {formatCurrency(row.yearTotals[y] ?? 0)}
                          </span>
                        ))}
                        <span
                          className={`text-xs font-medium text-right ${
                            pctChange === null
                              ? "text-text-muted"
                              : pctChange > 0
                              ? "text-danger"
                              : "text-success"
                          }`}
                        >
                          {pctChange === null ? "—" : `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(0)}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {compareYears.includes(currentYear) && (
                  <p className="text-text-muted text-xs text-center">
                    * {currentYear} figures are year-to-date only
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
