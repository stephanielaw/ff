import {
  detectDuplicates,
  detectMissingExpenses,
  generateForecast,
} from "@/lib/utils/expenses";
import type { JointExpense, JointCategory } from "@/types/database";

// ---- detectDuplicates ----

describe("detectDuplicates", () => {
  const existing: Pick<JointExpense, "id" | "description" | "expense_date" | "amount">[] = [
    {
      id: "exp-1",
      description: "WALMART GROCERY",
      expense_date: "2024-03-15",
      amount: 150.00,
    },
    {
      id: "exp-2",
      description: "NETFLIX",
      expense_date: "2024-03-01",
      amount: 18.99,
    },
  ];

  test("exact duplicate: same date, amount, merchant → flagged", () => {
    const incoming = [{ date: "2024-03-15", merchant: "WALMART GROCERY", amount: 150.00, raw: "" }];
    const results = detectDuplicates(incoming, existing);
    expect(results[0].isDuplicate).toBe(true);
  });

  test("near-duplicate: ±1 day date difference → flagged", () => {
    const incoming = [{ date: "2024-03-14", merchant: "WALMART", amount: 150.00, raw: "" }];
    const results = detectDuplicates(incoming, existing);
    expect(results[0].isDuplicate).toBe(true);
  });

  test("different merchant, same amount → NOT flagged", () => {
    const incoming = [{ date: "2024-03-15", merchant: "TARGET", amount: 150.00, raw: "" }];
    const results = detectDuplicates(incoming, existing);
    expect(results[0].isDuplicate).toBe(false);
  });

  test("same merchant, different amount → NOT flagged", () => {
    const incoming = [{ date: "2024-03-15", merchant: "WALMART GROCERY", amount: 200.00, raw: "" }];
    const results = detectDuplicates(incoming, existing);
    expect(results[0].isDuplicate).toBe(false);
  });
});

// ---- detectMissingExpenses ----

describe("detectMissingExpenses", () => {
  const requiredCategories: Pick<JointCategory, "id" | "name">[] = [
    { id: "cat-mortgage", name: "Mortgage" },
    { id: "cat-insurance", name: "Home Insurance" },
  ];

  test("all required expenses present → no alert", () => {
    const expenses = [
      { category_id: "cat-mortgage" },
      { category_id: "cat-insurance" },
    ];
    const missing = detectMissingExpenses("2024-03", requiredCategories, expenses);
    expect(missing).toHaveLength(0);
  });

  test("one missing required expense → correct name returned", () => {
    const expenses = [{ category_id: "cat-mortgage" }];
    const missing = detectMissingExpenses("2024-03", requiredCategories, expenses);
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe("Home Insurance");
  });

  test("multiple missing �� all names returned", () => {
    const expenses: { category_id: string | null }[] = [];
    const missing = detectMissingExpenses("2024-03", requiredCategories, expenses);
    expect(missing).toHaveLength(2);
    expect(missing.map((m) => m.name)).toContain("Mortgage");
    expect(missing.map((m) => m.name)).toContain("Home Insurance");
  });
});

// ---- generateForecast ----

describe("generateForecast", () => {
  const categories: Pick<JointCategory, "id" | "name">[] = [
    { id: "cat-grocery", name: "Other Groceries" },
    { id: "cat-gas", name: "Gas" },
  ];

  test("12 months of data: verify average calculated correctly", () => {
    const expenses: Pick<JointExpense, "category_id" | "amount" | "month_year">[] = [];

    // 12 months of grocery expenses: $200/month
    for (let m = 1; m <= 12; m++) {
      const my = `2024-${String(m).padStart(2, "0")}`;
      expenses.push({ category_id: "cat-grocery", amount: 200, month_year: my });
    }

    const forecast = generateForecast(expenses, categories, 12);
    const grocery = forecast.find((f) => f.categoryId === "cat-grocery");
    expect(grocery).toBeDefined();
    expect(grocery!.avgMonthly).toBeCloseTo(200, 2);
    expect(grocery!.annualForecast).toBeCloseTo(2400, 2);
  });

  test("less than 12 months of data: uses all available months", () => {
    const expenses: Pick<JointExpense, "category_id" | "amount" | "month_year">[] = [
      { category_id: "cat-gas", amount: 100, month_year: "2024-10" },
      { category_id: "cat-gas", amount: 100, month_year: "2024-11" },
      { category_id: "cat-gas", amount: 100, month_year: "2024-12" },
    ];

    const forecast = generateForecast(expenses, categories, 12);
    const gas = forecast.find((f) => f.categoryId === "cat-gas");
    expect(gas).toBeDefined();
    // 3 months total: $300 / 3 months available = $100/month
    expect(gas!.avgMonthly).toBeCloseTo(100, 2);
    expect(gas!.monthsOfData).toBe(3);
  });

  test("category with no historical data: excluded from forecast", () => {
    const expenses: Pick<JointExpense, "category_id" | "amount" | "month_year">[] = [
      { category_id: "cat-grocery", amount: 100, month_year: "2024-01" },
    ];

    const forecast = generateForecast(expenses, categories, 12);
    const gas = forecast.find((f) => f.categoryId === "cat-gas");
    expect(gas).toBeUndefined();
  });
});
