import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// IMPORTANT: ANTHROPIC_API_KEY is server-side only — never pass to client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { merchantName } = body;

    if (!merchantName || typeof merchantName !== "string") {
      return NextResponse.json({ error: "Invalid merchantName" }, { status: 400 });
    }

    // Fetch categories
    const [{ data: jointCategories }, { data: individualCategories }, { data: aiMemory }] =
      await Promise.all([
        supabase.from("joint_categories").select("id, name").eq("is_active", true),
        supabase.from("individual_categories").select("id, name").eq("is_active", true),
        supabase
          .from("ai_category_memory")
          .select("merchant_pattern, suggested_category_id, suggested_type, correction_count")
          .ilike("merchant_pattern", normalizeForStorage(merchantName)),
      ]);

    const jointNames = (jointCategories ?? []).map((c) => c.name);
    const individualNames = (individualCategories ?? []).map((c) => c.name);
    const memoryContext =
      aiMemory && aiMemory.length > 0
        ? `Past corrections for similar merchants: ${JSON.stringify(aiMemory)}`
        : "";

    const systemPrompt = `You are a household expense categorizer. Given a merchant name from a credit card statement, categorize it into one of the provided categories and determine if it is a joint household expense or an individual personal expense.

You have access to past corrections for known merchants. Use these to improve accuracy.

Return JSON only in this format:
{
  "category": "category name here",
  "type": "joint" or "individual",
  "confidence": 0.0 to 1.0,
  "reasoning": "one sentence"
}`;

    const userMessage = `Merchant: ${merchantName}

Joint categories: ${jointNames.join(", ")}
Individual categories: ${individualNames.join(", ")}

${memoryContext}

Categorize this merchant.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsed: {
      category: string;
      type: string;
      confidence: number;
      reasoning: string;
    };

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({
        category: null,
        type: "joint",
        confidence: 0,
        reasoning: "Could not parse AI response",
        error: "parse_error",
      });
    }

    // Find category ID
    const allCategories = [
      ...(jointCategories ?? []).map((c) => ({ ...c, type: "joint" })),
      ...(individualCategories ?? []).map((c) => ({ ...c, type: "individual" })),
    ];
    const matchedCategory = allCategories.find(
      (c) => c.name.toLowerCase() === parsed.category?.toLowerCase()
    );

    return NextResponse.json({
      category: parsed.category,
      categoryId: matchedCategory?.id ?? null,
      type: parsed.type,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    });
  } catch (err) {
    console.error("POST /api/categorize error:", err);
    // AI failure is non-blocking
    return NextResponse.json(
      {
        category: null,
        categoryId: null,
        type: "joint",
        confidence: 0,
        reasoning: "AI categorization unavailable",
        error: "ai_unavailable",
      },
      { status: 200 }
    );
  }
}

function normalizeForStorage(merchant: string): string {
  return merchant.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
}

// Save a correction to AI memory
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { merchantName, categoryId, type } = body;

    if (!merchantName || !categoryId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const pattern = normalizeForStorage(merchantName);

    const { error } = await supabase.from("ai_category_memory").upsert(
      {
        merchant_pattern: pattern,
        suggested_category_id: categoryId,
        suggested_type: type ?? "joint",
        correction_count: 1,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "merchant_pattern" }
    );

    if (error) {
      console.error("Upsert ai_category_memory error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/categorize error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
