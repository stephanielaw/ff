import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";
import { detectDuplicates } from "@/lib/utils/expenses";
import { format, parseISO, isValid } from "date-fns";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["text/csv", "text/plain"];

interface ParsedRow {
  date: string;
  merchant: string;
  amount: number;
  raw: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseStatementContent(content: string): ParsedRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Skip header-like lines
    if (/^(date|transaction|description|amount)/i.test(line)) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;

    // Try to detect which column is date, description, amount
    let date = "";
    let merchant = "";
    let amount = 0;

    // Try standard format: date, description, amount
    const possibleDate = cols[0].replace(/"/g, "").trim();
    const parsedDate = parseISO(possibleDate);
    if (isValid(parsedDate)) {
      date = format(parsedDate, "yyyy-MM-dd");
      merchant = sanitizeText(cols[1]?.replace(/"/g, "").trim() ?? "");
      const rawAmount = cols[2]?.replace(/[^0-9.-]/g, "") ?? "";
      amount = Math.abs(parseFloat(rawAmount));
    } else {
      // Try date in second column
      const possibleDate2 = cols[1]?.replace(/"/g, "").trim() ?? "";
      const parsedDate2 = parseISO(possibleDate2);
      if (isValid(parsedDate2)) {
        date = format(parsedDate2, "yyyy-MM-dd");
        merchant = sanitizeText(cols[0]?.replace(/"/g, "").trim() ?? "");
        const rawAmount = cols[2]?.replace(/[^0-9.-]/g, "") ?? "";
        amount = Math.abs(parseFloat(rawAmount));
      }
    }

    if (!date || !merchant || !amount || isNaN(amount)) continue;

    rows.push({ date, merchant, amount, raw: line });
  }

  return rows;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") ?? "";

    let content = "";
    let fileName = "pasted_text";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File too large. Maximum size is 5MB." },
          { status: 400 }
        );
      }

      // Validate file type
      const fileType = file.type || "text/plain";
      if (!ALLOWED_TYPES.includes(fileType)) {
        return NextResponse.json(
          {
            error:
              "Invalid file type. Please upload a CSV or plain text file.",
          },
          { status: 400 }
        );
      }

      content = await file.text();
      fileName = file.name;
    } else {
      const body = await request.json();
      if (!body.text || typeof body.text !== "string") {
        return NextResponse.json({ error: "No text provided" }, { status: 400 });
      }
      // Sanitize pasted text — strip HTML
      content = sanitizeText(body.text);
    }

    const rows = parseStatementContent(content);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in file. Please check the format." },
        { status: 400 }
      );
    }

    // Get existing expenses for duplicate detection (last 90 days)
    const ninetyDaysAgo = format(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );
    const { data: existingExpenses } = await supabase
      .from("joint_expenses")
      .select("id, description, expense_date, amount")
      .gte("expense_date", ninetyDaysAgo);

    const duplicateResults = detectDuplicates(rows, existingExpenses ?? []);

    return NextResponse.json({
      rows: duplicateResults,
      fileName,
      rowCount: rows.length,
    });
  } catch (err) {
    console.error("POST /api/upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
