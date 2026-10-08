// app/api/ocr/enhance/route.ts
import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY      = process.env.GROQ_API_KEY      || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || "";

// Prioritize fast, high-quality models with separate token buckets
const GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "groq/compound-mini",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-120b",
];

const CLAUDE_MODELS = [
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
];

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "gemini-1.5-flash",
];

const ENHANCE_SYSTEM_PROMPT = `You are an expert OCR post-processing and text enhancement engine specialized in handwritten exam answer sheets.
Your task: Fix spelling mistakes, OCR character confusion (e.g., 'rn' -> 'm', '0' -> 'O', '1' -> 'l', missing accents/symbols), broken mathematical equations, and line-split words while strictly preserving the author's original meaning, question labels (Q1, 2(a), Section B, etc.), formatting, and structure.

Rules:
1. Do NOT add conversational remarks, introductory preambles, or markdown headings (like "**Corrected Text**").
2. Do NOT summarize, remove, or hallucinate new content.
3. Return ONLY the raw corrected text with original formatting.`;

function cleanEnhancedText(text: string): string {
  if (!text) return "";
  // Strip <think> reasoning blocks
  let clean = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
  // Strip intro preambles
  clean = clean.replace(/^(?:Here is the corrected text:?|Here's the corrected text:?|\*\*Corrected Text:?\*\*|\*\*Corrected Version:?\*\*|Corrected Text:?)\s*/i, "").trim();
  // Strip enclosing markdown code fences if entire output is wrapped in ```
  clean = clean.replace(/^```(?:markdown|text)?\s*([\s\S]*?)\s*```$/i, "$1").trim();
  return clean;
}

// Split large document into chunks that fit well under Groq's 8,000 TPM limit
function splitIntoChunks(text: string, maxChars = 2000): string[] {
  const pageRegex = /(──\s*Page\s+\d+\s+of\s+\d+\s*──|---\s*Page\s+\d+\s*---|===+\s*Page\s+\d+\s*===+)/i;
  
  if (pageRegex.test(text)) {
    const parts = text.split(/(?=──\s*Page\s+\d+\s+of\s+\d+\s*──|---\s*Page\s+\d+\s*---|===+\s*Page\s+\d+\s*===+)/i);
    const result: string[] = [];
    for (const part of parts) {
      if (!part.trim()) continue;
      if (part.length <= maxChars) {
        result.push(part.trim());
      } else {
        result.push(...splitByParagraphs(part, maxChars));
      }
    }
    return result.length > 0 ? result : [text];
  }

  return splitByParagraphs(text, maxChars);
}

function splitByParagraphs(text: string, maxChars = 2000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

async function enhanceSingleChunk(chunk: string): Promise<string> {
  if (!chunk.trim()) return chunk;

  // Preserve page header if present (e.g. ── Page 1 of 5 ──)
  let header = "";
  let body = chunk;
  const headerMatch = chunk.match(/^(──\s*Page\s+\d+\s+of\s+\d+\s*──|---\s*Page\s+\d+\s*---|===+\s*Page\s+\d+\s*===+)\n*/i);
  if (headerMatch) {
    header = headerMatch[1] + "\n\n";
    body = chunk.slice(headerMatch[0].length).trim();
  }

  if (!body) return chunk;

  // Safe max_tokens: bounded between 400 and 1600 so (prompt_tokens + max_tokens) < 3000 (well under 8000 TPM limit)
  const safeTokens = Math.min(Math.max(Math.ceil(body.length * 1.1 / 3), 400), 1600);

  // 1. Try Groq models
  if (GROQ_API_KEY) {
    for (const model of GROQ_MODELS) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: safeTokens,
            temperature: 0.1,
            messages: [
              { role: "system", content: ENHANCE_SYSTEM_PROMPT },
              { role: "user", content: `OCR Text:\n${body}` },
            ],
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawContent = data.choices?.[0]?.message?.content;
          if (rawContent && rawContent.trim()) {
            return header + cleanEnhancedText(rawContent);
          }
        }
      } catch (err: any) {
        console.warn(`[OCR/Enhance] Groq ${model} error on chunk: ${err.message}`);
      }
    }
  }

  // 2. Claude Fallback
  if (ANTHROPIC_API_KEY) {
    for (const model of CLAUDE_MODELS) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: safeTokens,
            system: ENHANCE_SYSTEM_PROMPT,
            messages: [{ role: "user", content: `OCR Text:\n${body}` }],
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawText = data.content?.[0]?.text;
          if (rawText && rawText.trim()) {
            return header + cleanEnhancedText(rawText);
          }
        }
      } catch {}
    }
  }

  // 3. Gemini Fallback
  if (GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${ENHANCE_SYSTEM_PROMPT}\n\nOCR Text:\n${body}` }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: safeTokens,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText && rawText.trim()) {
            return header + cleanEnhancedText(rawText);
          }
        }
      } catch {}
    }
  }

  // Graceful fallback to original chunk text if all AI models fail
  console.warn("[OCR/Enhance] All models failed for chunk, preserving original chunk text.");
  return chunk;
}

export async function POST(req: NextRequest) {
  try {
    const { ocr_text } = await req.json();

    if (!ocr_text || typeof ocr_text !== "string" || !ocr_text.trim()) {
      return NextResponse.json(
        { status: "error", message: "No text provided for enhancement." },
        { status: 400 }
      );
    }

    if (!GROQ_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
      return NextResponse.json(
        { status: "error", message: "No AI API keys configured. Please configure GROQ_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Split document into safe-sized chunks
    const chunks = splitIntoChunks(ocr_text, 2000);
    console.log(`[OCR/Enhance] Processing ${chunks.length} chunk(s) (total ${ocr_text.length} chars)`);

    const enhancedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const enhanced = await enhanceSingleChunk(chunks[i]);
      enhancedChunks.push(enhanced);

      // Brief spacing between chunks to prevent burst TPM spikes
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    const finalEnhancedText = enhancedChunks.join("\n\n");
    return NextResponse.json({
      status: "success",
      enhanced_text: finalEnhancedText,
      chunks_processed: chunks.length,
    });

  } catch (err: any) {
    console.error("[OCR/Enhance] Unexpected error:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Enhancement failed unexpectedly" },
      { status: 500 }
    );
  }
}