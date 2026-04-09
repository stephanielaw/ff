import {
  calculateBalance,
  applyRatioToExpense,
  getRatioForDate,
  formatBalanceText,
  getEffectiveShares,
  getCategoryRatioForDate,
  enrichExpensesWithCategoryRatios,
  type BalanceExpense,
} from "@/lib/utils/balance";
import type { Payment, SplitRatio, CategoryRatioHistory } from "@/types/database";

const USER1_ID = "user1-uuid-1234"; // household owner (was "Sarah")
const USER2_ID = "user2-uuid-5678"; // invited partner (was "David")

const ratio5050: SplitRatio = {
  id: "ratio-1",
  effective_date: "2020-01-01",
  user1_pct: 50,
  user2_pct: 50,
  created_by: null,
  created_at: "2020-01-01",
};

const ratio6040: SplitRatio = {
  id: "ratio-2",
  effective_date: "2024-07-01",
  user1_pct: 60,
  user2_pct: 40,
  created_by: null,
  created_at: "2024-07-01",
};

// ---- calculateBalance tests ----

describe("calculateBalance", () => {
  test("simple case: one expense, one payment → settled", () => {
    const expenses: BalanceExpense[] = [
      { amount: 200, paid_by: USER1_ID, expense_date: "2024-01-15" },
    ];
    const payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [
      { paid_by: USER2_ID, paid_to: USER1_ID, amount: 100 },
    ];
    const ratios = [ratio5050];

    // user1 paid $200, user2 owes 50% = $100. user2 paid $100 → balance = 0
    const result = calculateBalance(expenses, payments, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("settled");
    expect(result.amount.toNumber()).toBeCloseTo(0, 2);
  });

  test("positive balance: user2 owes user1", () => {
    const expenses: BalanceExpense[] = [
      { amount: 1000, paid_by: USER1_ID, expense_date: "2024-02-01" },
    ];
    const payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [];
    const ratios = [ratio5050];

    // user2 owes 50% of $1000 = $500
    const result = calculateBalance(expenses, payments, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(500, 2);
  });

  test("negative balance: user1 owes user2", () => {
    const expenses: BalanceExpense[] = [
      { amount: 800, paid_by: USER2_ID, expense_date: "2024-03-01" },
    ];
    const payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [];
    const ratios = [ratio5050];

    // user1 owes 50% of $800 = $400
    const result = calculateBalance(expenses, payments, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user1_owes_user2");
    expect(result.amount.toNumber()).toBeCloseTo(400, 2);
  });

  test("mid-year ratio change: uses correct ratio per expense date", () => {
    // Before July 2024: 50/50. From July 2024: 60/40
    const ratios = [ratio5050, ratio6040];

    const expenses: BalanceExpense[] = [
      // Before ratio change: user2 owes 50% of $100 = $50
      { amount: 100, paid_by: USER1_ID, expense_date: "2024-06-15" },
      // After ratio change: user2 owes 40% of $200 = $80
      { amount: 200, paid_by: USER1_ID, expense_date: "2024-08-01" },
    ];
    const payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [];

    // Total user2 owes: $50 + $80 = $130
    const result = calculateBalance(expenses, payments, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(130, 2);
  });

  test("partial payment: remainder carries forward correctly", () => {
    const ratios = [ratio5050];
    const expenses: BalanceExpense[] = [
      { amount: 1000, paid_by: USER1_ID, expense_date: "2024-01-01" },
    ];
    const payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [
      { paid_by: USER2_ID, paid_to: USER1_ID, amount: 300 },
    ];

    // user2 owes $500, paid $300 → still owes $200
    const result = calculateBalance(expenses, payments, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(200, 2);
  });

  test("category split_ratio overrides global ratio", () => {
    // Global ratio is 50/50, but this category is 70/30
    const expenses: BalanceExpense[] = [
      {
        amount: 1000,
        paid_by: USER1_ID,
        expense_date: "2024-01-01",
        category_split_ratio: 0.7, // user1 pays 70%, user2 pays 30%
      },
    ];
    const ratios = [ratio5050];

    // user2 owes 30% of $1000 = $300 (not 50%)
    const result = calculateBalance(expenses, payments_none, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(300, 2);
  });

  test("null category_split_ratio falls back to global ratio", () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 1000,
        paid_by: USER1_ID,
        expense_date: "2024-01-01",
        category_split_ratio: null,
      },
    ];
    const ratios = [ratio5050];

    // Should use global 50/50 → user2 owes $500
    const result = calculateBalance(expenses, payments_none, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(500, 2);
  });

  test("mix of category overrides and global ratio in same balance", () => {
    const ratios = [ratio5050];
    const expenses: BalanceExpense[] = [
      // Has a category override: user1 pays 80%, user2 pays 20%
      { amount: 500, paid_by: USER1_ID, expense_date: "2024-01-01", category_split_ratio: 0.8 },
      // No override: falls back to global 50/50
      { amount: 500, paid_by: USER1_ID, expense_date: "2024-01-01" },
    ];

    // user2 owes 20% of $500 + 50% of $500 = $100 + $250 = $350
    const result = calculateBalance(expenses, payments_none, ratios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(350, 2);
  });
});

const payments_none: Pick<Payment, "paid_by" | "paid_to" | "amount">[] = [];

// ---- applyRatioToExpense tests ----

describe("applyRatioToExpense", () => {
  test("correct ratio row selected based on expense date", () => {
    const ratios = [ratio5050, ratio6040];

    // Expense before ratio change: user2 owes 50%
    const earlyExpense: BalanceExpense = {
      amount: 100,
      paid_by: USER1_ID,
      expense_date: "2024-06-01",
    };
    const earlyResult = applyRatioToExpense(earlyExpense, ratios, USER1_ID);
    expect(earlyResult.user2Owes.toNumber()).toBeCloseTo(50, 2);
    expect(earlyResult.user1Owes.toNumber()).toBeCloseTo(0, 2);

    // Expense after ratio change: user2 owes 40%
    const lateExpense: BalanceExpense = {
      amount: 100,
      paid_by: USER1_ID,
      expense_date: "2024-07-15",
    };
    const lateResult = applyRatioToExpense(lateExpense, ratios, USER1_ID);
    expect(lateResult.user2Owes.toNumber()).toBeCloseTo(40, 2);
  });

  test("category split_ratio overrides global ratio in applyRatioToExpense", () => {
    const ratios = [ratio5050];
    const expense: BalanceExpense = {
      amount: 200,
      paid_by: USER1_ID,
      expense_date: "2024-01-01",
      category_split_ratio: 0.6, // user1 60%, user2 40%
    };
    const result = applyRatioToExpense(expense, ratios, USER1_ID);
    expect(result.user2Owes.toNumber()).toBeCloseTo(80, 2); // 40% of 200
    expect(result.user1Owes.toNumber()).toBeCloseTo(0, 2);
  });
});

// ---- getEffectiveShares tests ----

describe("getEffectiveShares", () => {
  test("uses category ratio when provided", () => {
    const expense: BalanceExpense = {
      amount: 100,
      paid_by: USER1_ID,
      expense_date: "2024-01-01",
      category_split_ratio: 0.7,
    };
    const { user1Share, user2Share } = getEffectiveShares(expense, [ratio5050]);
    expect(user1Share.toNumber()).toBeCloseTo(70, 2);
    expect(user2Share.toNumber()).toBeCloseTo(30, 2);
  });

  test("falls back to global ratio when category ratio is null", () => {
    const expense: BalanceExpense = {
      amount: 100,
      paid_by: USER1_ID,
      expense_date: "2024-01-01",
      category_split_ratio: null,
    };
    const { user1Share, user2Share } = getEffectiveShares(expense, [ratio6040]);
    expect(user1Share.toNumber()).toBeCloseTo(60, 2);
    expect(user2Share.toNumber()).toBeCloseTo(40, 2);
  });
});

// ---- getCategoryRatioForDate tests ----

const CAT_A = "cat-uuid-aaaa";
const CAT_B = "cat-uuid-bbbb";

const historyEntry = (
  categoryId: string,
  ratio: number,
  effectiveDate: string
): CategoryRatioHistory => ({
  id: `hist-${effectiveDate}`,
  category_id: categoryId,
  category_type: "joint",
  ratio,
  effective_date: effectiveDate,
  created_at: effectiveDate,
});

describe("getCategoryRatioForDate", () => {
  test("returns null when history is empty", () => {
    expect(getCategoryRatioForDate(CAT_A, "2025-06-01", [])).toBeNull();
  });

  test("returns null when categoryId is null or undefined", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-01-01")];
    expect(getCategoryRatioForDate(null, "2025-06-01", history)).toBeNull();
    expect(getCategoryRatioForDate(undefined, "2025-06-01", history)).toBeNull();
  });

  test("returns null when no entry exists on or before expense date", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-06-01")];
    // Expense is before the only history entry
    expect(getCategoryRatioForDate(CAT_A, "2025-01-01", history)).toBeNull();
  });

  test("returns the ratio when expense date exactly matches effective_date", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-01-01")];
    expect(getCategoryRatioForDate(CAT_A, "2025-01-01", history)).toBeCloseTo(0.6, 4);
  });

  test("returns the ratio for an expense after the effective_date", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-01-01")];
    expect(getCategoryRatioForDate(CAT_A, "2025-06-15", history)).toBeCloseTo(0.6, 4);
  });

  test("returns the most recent entry when multiple entries exist", () => {
    const history = [
      historyEntry(CAT_A, 0.6, "2025-01-01"),
      historyEntry(CAT_A, 0.5, "2025-09-01"),
    ];
    // Expense after Sep: should use 0.5
    expect(getCategoryRatioForDate(CAT_A, "2025-10-01", history)).toBeCloseTo(0.5, 4);
    // Expense between Jan and Sep: should use 0.6
    expect(getCategoryRatioForDate(CAT_A, "2025-05-01", history)).toBeCloseTo(0.6, 4);
    // Expense before Jan: no match
    expect(getCategoryRatioForDate(CAT_A, "2024-12-31", history)).toBeNull();
  });

  test("does not bleed across different categories", () => {
    const history = [
      historyEntry(CAT_A, 0.6, "2025-01-01"),
      historyEntry(CAT_B, 0.7, "2025-01-01"),
    ];
    expect(getCategoryRatioForDate(CAT_A, "2025-06-01", history)).toBeCloseTo(0.6, 4);
    expect(getCategoryRatioForDate(CAT_B, "2025-06-01", history)).toBeCloseTo(0.7, 4);
  });
});

// ---- enrichExpensesWithCategoryRatios tests ----

describe("enrichExpensesWithCategoryRatios", () => {
  const globalRatios = [ratio5050];

  test("returns expenses unchanged when history is empty", () => {
    const expenses: BalanceExpense[] = [
      { amount: 100, paid_by: USER1_ID, expense_date: "2025-06-01", category_id: CAT_A },
    ];
    const result = enrichExpensesWithCategoryRatios(expenses, []);
    expect(result).toBe(expenses); // same reference when no enrichment
  });

  test("category with no history entry → category_split_ratio is null → falls back to global ratio", () => {
    const history = [historyEntry(CAT_B, 0.7, "2025-01-01")]; // only CAT_B has history
    const expenses: BalanceExpense[] = [
      { amount: 1000, paid_by: USER1_ID, expense_date: "2025-06-01", category_id: CAT_A },
    ];
    const enriched = enrichExpensesWithCategoryRatios(expenses, history);
    // CAT_A has no history → ratio should be null → falls back to global 50/50
    const result = calculateBalance(enriched, [], globalRatios, USER1_ID, USER2_ID);
    expect(result.amount.toNumber()).toBeCloseTo(500, 2); // 50% of 1000
  });

  test("category with history entry on 2025-01-01 applies 60/40 on or after that date", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-01-01")];
    const expenses: BalanceExpense[] = [
      { amount: 1000, paid_by: USER1_ID, expense_date: "2025-03-01", category_id: CAT_A },
    ];
    const enriched = enrichExpensesWithCategoryRatios(expenses, history);
    const result = calculateBalance(enriched, [], globalRatios, USER1_ID, USER2_ID);
    // user1 pays 60%, user2 owes 40% of 1000 = $400
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(400, 2);
  });

  test("expense before history entry falls back to global split ratio", () => {
    const history = [historyEntry(CAT_A, 0.6, "2025-01-01")];
    const expenses: BalanceExpense[] = [
      { amount: 1000, paid_by: USER1_ID, expense_date: "2024-12-31", category_id: CAT_A },
    ];
    const enriched = enrichExpensesWithCategoryRatios(expenses, history);
    const result = calculateBalance(enriched, [], globalRatios, USER1_ID, USER2_ID);
    // No history match → global 50/50 → user2 owes $500
    expect(result.amount.toNumber()).toBeCloseTo(500, 2);
  });

  test("two history entries: 60/40 Jan–Aug, 50/50 from Sep onward", () => {
    const history = [
      historyEntry(CAT_A, 0.6, "2025-01-01"),
      historyEntry(CAT_A, 0.5, "2025-09-01"),
    ];
    const expenses: BalanceExpense[] = [
      // Between Jan and Sep → 60/40, user2 owes 40% of $500 = $200
      { amount: 500, paid_by: USER1_ID, expense_date: "2025-05-01", category_id: CAT_A },
      // After Sep → 50/50, user2 owes 50% of $400 = $200
      { amount: 400, paid_by: USER1_ID, expense_date: "2025-10-01", category_id: CAT_A },
    ];
    const enriched = enrichExpensesWithCategoryRatios(expenses, history);
    const result = calculateBalance(enriched, [], globalRatios, USER1_ID, USER2_ID);
    expect(result.direction).toBe("user2_owes_user1");
    expect(result.amount.toNumber()).toBeCloseTo(400, 2); // $200 + $200
  });
});

// ---- formatBalanceText tests ----

describe("formatBalanceText", () => {
  test("shows correct debtor name when user2 owes user1", () => {
    const result = calculateBalance(
      [{ amount: 1000, paid_by: USER1_ID, expense_date: "2024-01-01" }],
      [],
      [ratio5050],
      USER1_ID,
      USER2_ID
    );
    const text = formatBalanceText(result, "Alice", "Bob");
    expect(text).toBe("Bob owes Alice $500.00");
  });

  test("shows correct debtor name when user1 owes user2", () => {
    const result = calculateBalance(
      [{ amount: 1000, paid_by: USER2_ID, expense_date: "2024-01-01" }],
      [],
      [ratio5050],
      USER1_ID,
      USER2_ID
    );
    const text = formatBalanceText(result, "Alice", "Bob");
    expect(text).toBe("Alice owes Bob $500.00");
  });

  test("shows 'All settled up' when balanced", () => {
    const result = calculateBalance(
      [{ amount: 200, paid_by: USER1_ID, expense_date: "2024-01-01" }],
      [{ paid_by: USER2_ID, paid_to: USER1_ID, amount: 100 }],
      [ratio5050],
      USER1_ID,
      USER2_ID
    );
    const text = formatBalanceText(result, "Alice", "Bob");
    expect(text).toBe("All settled up");
  });
});
