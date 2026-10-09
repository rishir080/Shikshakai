// app/api/ocr/route.ts
// ─────────────────────────────────────────────────────────────────
// Handles single image OCR via vision APIs.
// Fallback chain: Groq qwen3.8 → Groq qwen3.6 → Claude (Anthropic) → Gemini
// PDF pages are rendered client-side (browser canvas) before being sent here.
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY      = process.env.GROQ_API_KEY      || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || "";
const PYTHON_BACKEND    = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8080";

const GROQ_MODEL_A = "qwen/qwen3.8-27b";

// 3rd: Claude Haiku — excellent vision, reliable API access
const CLAUDE_MODEL = "claude-3-haiku-20240307";
// 4th: Gemini Vision — fallback models
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.1-pro-preview", "gemini-flash-latest"];

const OCR_PROMPT = `You are an expert OCR transcription system specialized in reading handwritten exam answer sheets.

Your task: Transcribe EVERY word, question header, number, mathematical formula, diagram label, and symbol accurately as written.

Rules:
1. QUESTION NUMBERS & HEADERS: Pay extreme attention to question identifiers (e.g., Q1, Ans 1, 1(a), Q.2b, Part B, Section A). Always transcribe them clearly on their own line.
2. MATHEMATICAL & SCIENTIFIC FORMULAS: Transcribe equations, fractions, square roots, integrals, matrices, chemical formulas, and units (m/s^2, kg, Ohm) precisely.
3. PRESERVE STRUCTURE: Keep original line breaks, bullet points, and step-by-step layout.
4. FAITHFULNESS: Do NOT summarize, skip, or rephrase anything. Mark completely illegible words as [illegible].
5. BLANK PAGES: If page has no writing, return: [blank page]

Return ONLY the transcribed text. No intro, no conversational remarks.`;


// ─── Strip <think> reasoning tags (including unclosed ones) ────────
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
}

// ─── Parse Retry-After header (seconds or HTTP date) ─────────────
function parseRetryAfter(header: string | null): number {
  if (!header) return 15; // default 15s if no header
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return Math.min(seconds + 2, 60); // cap at 60s
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.min(Math.ceil((date.getTime() - Date.now()) / 1000) + 2, 60);
  }
  return 15;
}

// ─── Sleep helper ─────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── 1. Groq Vision — with server-side retry on 429 ──────────────
// Tries both model A and model B before giving up on Groq.
async function groqOcrPage(imgBase64: string, mimeType = "image/jpeg"): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  const sizeKB = Math.round(imgBase64.length * 0.75 / 1024);
  if (sizeKB > 4000) throw new Error(`Image too large for Groq: ${sizeKB} KB`);

  const models = [GROQ_MODEL_A];

  for (const model of models) {
    console.log(`[OCR/Groq] ${sizeKB} KB → ${model}`);
    let lastError = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imgBase64}` } },
          ]}],
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = stripThinkTags(data.choices?.[0]?.message?.content?.trim() || "");
        console.log(`[OCR/Groq] ✓ ${model} succeeded (attempt ${attempt})`);
        return text;
      }

      if (res.status === 429) {
        // Rate limited — read exact wait time from header
        const retryAfter = parseRetryAfter(res.headers.get("retry-after") || res.headers.get("x-ratelimit-reset-requests"));
        console.warn(`[OCR/Groq] ${model} rate limited (attempt ${attempt}/${3}). Waiting ${retryAfter}s…`);

        if (attempt < 3) {
          await sleep(retryAfter * 1000);
          continue; // retry same model
        }
        // Exhausted retries for this model → try next model
        lastError = `429 rate limited after 3 attempts`;
        break;
      }

      // Non-rate-limit error (400, 404, 500, etc.) → don't retry this model
      const errText = await res.text();
      let parsed: any = {};
      try { parsed = JSON.parse(errText); } catch {}
      lastError = `Groq ${res.status}: ${parsed?.error?.message || errText.slice(0, 200)}`;
      console.warn(`[OCR/Groq] ${model} failed → ${lastError}`);
      break; // try next model
    }
  }

  throw new Error(`All Groq models exhausted. Last error: rate limited or unavailable`);
}


// ─── 2. Claude (Anthropic) Vision ────────────────────────────────
async function claudeOcrPage(imgBase64: string, mimeType = "image/jpeg"): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const sizeKB = Math.round(imgBase64.length * 0.75 / 1024);
  console.log(`[OCR/Claude] ${sizeKB} KB → ${CLAUDE_MODEL}`);

  // Claude accepts image/jpeg, image/png, image/gif, image/webp
  const supportedMime = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const safeMime = supportedMime.includes(mimeType) ? mimeType : "image/jpeg";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: safeMime, data: imgBase64 } },
        { type: "text", text: OCR_PROMPT },
      ]}],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch {}
    throw new Error(`Claude ${res.status}: ${parsed?.error?.message || errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}


// ─── 3. Gemini Vision ────────────────────────────────────────────
async function geminiOcrPage(imgBase64: string, mimeType = "image/jpeg"): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const sizeKB = Math.round(imgBase64.length * 0.75 / 1024);

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      console.log(`[OCR/Gemini] ${sizeKB} KB → ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: OCR_PROMPT },
            { inline_data: { mime_type: mimeType, data: imgBase64 } },
          ]}],
          generationConfig: { temperature: 0, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }
      const errText = await res.text();
      let parsed: any = {};
      try { parsed = JSON.parse(errText); } catch {}
      lastError = `Gemini ${res.status} [${model}]: ${parsed?.error?.message || errText.slice(0, 200)}`;
    } catch (e: any) {
      lastError = e.message;
    }
  }
  throw new Error(lastError || "All Gemini models failed");
}


// ─── Main handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!GROQ_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "No API keys configured. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    if (!imageBase64) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    const imgMime = mimeType || "image/jpeg";
    const errors: string[] = [];

    // ── 1. Try Groq (qwen3.6 → qwen3.8, server-side retry on 429) ──
    if (GROQ_API_KEY) {
      try {
        const text = await groqOcrPage(imageBase64, imgMime);
        console.log("[OCR] ✓ Groq succeeded");
        return NextResponse.json({ status: "success", text, confidence: 92, detections: [], engine: "groq" });
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`);
        console.warn("[OCR] Groq failed →", e.message);
      }
    }

    // ── 2. Try Claude ──
    if (ANTHROPIC_API_KEY) {
      try {
        const text = await claudeOcrPage(imageBase64, imgMime);
        console.log("[OCR] ✓ Claude succeeded");
        return NextResponse.json({ status: "success", text, confidence: 93, detections: [], engine: "claude" });
      } catch (e: any) {
        errors.push(`Claude: ${e.message}`);
        console.warn("[OCR] Claude failed →", e.message);
      }
    }

    // ── 3. Try Gemini ──
    if (GEMINI_API_KEY) {
      try {
        const text = await geminiOcrPage(imageBase64, imgMime);
        console.log("[OCR] ✓ Gemini succeeded");
        return NextResponse.json({ status: "success", text, confidence: 90, detections: [], engine: "gemini" });
      } catch (e: any) {
        errors.push(`Gemini: ${e.message}`);
        console.warn("[OCR] Gemini failed →", e.message);
      }
    }

    // ── 4. Try Local Python OCR (TrOCR + Tesseract fallback) ──
    try {
      console.log(`[OCR] Trying local Python backend fallback at ${PYTHON_BACKEND}/api/local-ocr ...`);
      const localRes = await fetch(`${PYTHON_BACKEND}/api/local-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, engine: "trocr" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (localRes.ok) {
        const localData = await localRes.json();
        if (localData.status === "success" && localData.text) {
          console.log("[OCR] ✓ Local Python OCR succeeded");
          return NextResponse.json({ status: "success", text: localData.text, confidence: localData.confidence || 88, detections: [], engine: "local-python" });
        }
      }
    } catch (e: any) {
      errors.push(`Local Python OCR: ${e.message}`);
      console.warn("[OCR] Local Python OCR fallback failed →", e.message);
    }

    // All failed — return all error details so client can show what went wrong
    return NextResponse.json(
      { error: "OCR Failed", detail: errors.join(" | ") },
      { status: 503 }
    );

  } catch (e: any) {
    console.error("[OCR] Unexpected error:", e.message);
    return NextResponse.json({ error: "OCR Failed", detail: e.message }, { status: 503 });
  }
}
