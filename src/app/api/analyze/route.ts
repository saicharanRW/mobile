import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type AnalyzeResponse = {
  product: string;
  expiryDate: string; // YYYY-MM-DD or ""
};

function coerceIsoDate(text: string): string {
  const normalized = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const m1 = normalized.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m1) {
    const [_, d, m, y] = m1;
    return `${y}-${m}-${d}`;
  }
  const m2 = normalized.match(/(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/);
  if (m2) {
    const [_, y, m, d] = m2;
    return `${y}-${m}-${d}`;
  }
  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const manualDate = form.get("manualDate");
    const manualProduct = form.get("manualProduct");
    if (!(file instanceof File)) {
      return Response.json({ error: "image required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.2 },
    });

    const prompt = `Task: Read the product label in the image and return concise, reliable metadata.

Return ONLY a JSON object with keys: product, expiryDate

Rules for product:
- Output the human-friendly product title found on the front label (e.g., "Olive Oil", "Instant Noodles Chicken", "Laundry Detergent").
- If a brand name is prominent next to the product name, include it only if it helps identification (e.g., "Brand X Basmati Rice"). Keep it short.
- If the text is in non‑Latin script, transliterate to English where obvious.
- Never return generic words like "ingredients", "nutrition facts", lot numbers, barcodes, or regulatory text.
- If multiple candidates exist, choose the one that best represents what the item is.
- If you truly cannot infer a product title, set product to an empty string.

Rules for expiryDate:
- If there is an explicit expiry/best before/BB/EXP/Use By date, return it in YYYY-MM-DD.
- If multiple dates appear, prefer the one labeled as expiry/best before. Do NOT return manufacture/production dates as expiry.
- If unreadable or absent, return an empty string.`;

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType: (file as any).type || "image/png" } },
        ]},
      ],
    });

    const text = result.response.text();
    let extracted: AnalyzeResponse = { product: "", expiryDate: "" };
    try {
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
      const parsed = JSON.parse(raw);
      extracted.product = String(parsed.product || "").slice(0, 120);
      if (parsed.expiryDate) extracted.expiryDate = coerceIsoDate(String(parsed.expiryDate));
    } catch {
      const m = text.match(/\"expiryDate\"\s*:\s*\"([^\"]+)\"/);
      if (m) extracted.expiryDate = coerceIsoDate(m[1]);
      const p = text.match(/\"product\"\s*:\s*\"([^\"]+)\"/);
      if (p) extracted.product = p[1];
    }

    if (typeof manualProduct === "string" && manualProduct.trim()) {
      extracted.product = manualProduct.trim();
    }
    if (typeof manualDate === "string" && manualDate.trim()) {
      extracted.expiryDate = coerceIsoDate(manualDate);
    }

    if (!extracted.product) extracted.product = "";
    if (!extracted.expiryDate) extracted.expiryDate = "";
    return Response.json(extracted satisfies AnalyzeResponse);
  } catch (err: any) {
    console.error("/api/analyze error", err?.message || err);
    return Response.json({ error: "analysis_failed", message: String(err?.message || err) }, { status: 500 });
  }
}


