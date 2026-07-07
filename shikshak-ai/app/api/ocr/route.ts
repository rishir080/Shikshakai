// app/api/ocr/route.ts
// ─────────────────────────────────────────────────────────────────
// ARCHITECTURE:
//   groq-vision (PDF)  → Converts PDF pages to images, calls Groq API directly
//   groq / llama (IMG) → Calls Groq API directly
//   trocr / tesseract  → Forwards to Python backend (optional, local)
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";
const GROQ_API_KEY   = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const OCR_PROMPT = `You are an expert OCR system specialized in reading handwritten answer sheets and printed documents.

Your task: Transcribe EVERY word, number, symbol, and mark exactly as it appears on this page.

Rules:
- Copy text EXACTLY as written — same spelling, same punctuation, same line breaks
- Preserve the structure: if answers are numbered (1, 2, 3...), keep that numbering
- Do NOT correct grammar or spelling — transcribe what is actually written
- Do NOT summarize or paraphrase
- Mark truly unreadable words as [illegible]
- If the page is blank, write: [blank page]

Return ONLY the transcribed text. No explanations, no JSON, no comments.`;


// ─── Helper: call Groq Vision for one base64 image ───────────────
async function groqOcrPage(imgBase64: string, mimeType = "image/jpeg"): Promise<string> {
  const sizeKB = Math.round(imgBase64.length * 0.75 / 1024);
  console.log(`[OCR] Sending image to Groq: ${sizeKB} KB`);
  if (sizeKB > 4000) {
    throw new Error(`[SIZE_LIMIT_EXCEEDED] Image size ${sizeKB} KB exceeds Groq limit of 4000 KB.`);
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 8192,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imgBase64}` } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsed: any = {};
    try { parsed = JSON.parse(errText); } catch {}
    const msg = parsed?.error?.message || errText.slice(0, 300);
    console.error(`[Groq API Error ${res.status}]`, msg);
    throw new Error(`Groq ${res.status}: ${msg}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  return text;
}

// ─── Helper: call Gemini Vision REST API for one base64 image (with retry) ────
async function geminiOcrPage(imgBase64: string, maxRetries = 3): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set in .env.local");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [
      { text: "Transcribe the handwriting on this page exactly as it appears. Preserve line breaks and numbering. Return only the transcribed text." },
      { inline_data: { mime_type: "image/jpeg", data: imgBase64 } }
    ]}]
  };

  let lastErr: Error = new Error("Gemini OCR failed");
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        const isRateLimit = res.status === 429 || res.status === 503;
        lastErr = new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
        if (isRateLimit && attempt < maxRetries - 1) {
          const waitMs = (2 ** attempt) * 5000; // 5s, 10s, 20s
          console.warn(`[OCR] Gemini rate-limited (attempt ${attempt + 1}). Retrying in ${waitMs / 1000}s...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw lastErr;
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    } catch (e: any) {
      lastErr = e;
      const isTransient = /429|503|UNAVAILABLE/i.test(e.message || "");
      if (isTransient && attempt < maxRetries - 1) {
        const waitMs = (2 ** attempt) * 5000;
        console.warn(`[OCR] Gemini transient error (attempt ${attempt + 1}): ${e.message}. Retrying in ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (attempt === maxRetries - 1) throw e;
    }
  }
  throw lastErr;
}


// ─── Helper: decode PDF pages to JPEG base64 via pdfjs (server-side) ────
async function pdfToPageImages(pdfBase64: string): Promise<string[]> {
  // We use the Python backend's PDF-to-image conversion endpoint
  // which uses poppler (much faster and more reliable than pdfjs server-side)
  const res = await fetch(`${PYTHON_BACKEND}/api/pdf-to-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`PDF conversion failed: ${res.status}`);
  const data = await res.json();
  return data.images as string[]; // array of base64 JPEG strings
}

// ─── Main handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, pdfBase64, mimeType, model = "groq-vision" } = body;

    // ══════════════════════════════════════════════
    // ROUTE 1: PDF + groq-vision / gemini-vision → Page-by-page cloud OCR
    // ══════════════════════════════════════════════
    if ((pdfBase64 || mimeType === "application/pdf") && (model === "groq-vision" || model === "gemini-vision")) {
      const isGemini = model === "gemini-vision";
      if (!isGemini && !GROQ_API_KEY) {
        return NextResponse.json({ error: "GROQ_API_KEY not set in .env.local" }, { status: 500 });
      }
      if (isGemini && !GEMINI_API_KEY) {
        return NextResponse.json({ error: "GEMINI_API_KEY not set in .env.local" }, { status: 500 });
      }

      // Step 1: Convert PDF to page images via Python backend
      let pageImages: string[] = [];
      try {
        pageImages = await pdfToPageImages(pdfBase64 || imageBase64);
      } catch (e: any) {
        return NextResponse.json({
          error: "PDF Conversion Failed",
          detail: `Could not convert PDF to images. Make sure the Python backend is running.\nError: ${e.message}`,
        }, { status: 503 });
      }

      if (!pageImages || pageImages.length === 0) {
        return NextResponse.json({ error: "No pages extracted from PDF" }, { status: 400 });
      }

      const totalPages = pageImages.length;
      console.log(`[OCR] Processing ${totalPages} pages with ${model}...`);

      // Step 2: Process pages — Gemini parallel (10 at once), Groq batches of 5
      const BATCH_SIZE = isGemini ? 10 : 5;
      const pages: any[] = [];

      for (let batchStart = 0; batchStart < totalPages; batchStart += BATCH_SIZE) {
        const batch = pageImages.slice(batchStart, batchStart + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async (img, idx) => {
            const pageNum = batchStart + idx + 1;
            try {
              let text = "";
              let confidence = 92;
              if (isGemini) {
                text = await geminiOcrPage(img);
                confidence = 98;
              } else {
                try {
                  text = await groqOcrPage(img, "image/jpeg");
                  confidence = 92;
                } catch (groqErr: any) {
                  console.warn(`[OCR] Groq failed on page ${pageNum}: ${groqErr.message}. Trying Gemini fallback...`);
                  if (GEMINI_API_KEY) {
                    text = await geminiOcrPage(img);
                    confidence = 98;
                  } else {
                    throw groqErr;
                  }
                }
              }
              console.log(`[OCR] ✅ Page ${pageNum}/${totalPages} done (${model})`);
              return { page: pageNum, text, confidence, error: false };
            } catch (e: any) {
              console.error(`[OCR] ❌ Page ${pageNum} failed completely: ${e.message}`);
              return { page: pageNum, text: `[Error on page ${pageNum}: ${e.message}]`, confidence: 0, error: true };
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") pages.push(result.value);
        }

        // Groq: delay between batches; Gemini has higher limits so no delay needed
        if (!isGemini && batchStart + BATCH_SIZE < totalPages) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      pages.sort((a, b) => a.page - b.page);

      const merged_text = pages
        .map(p => `── Page ${p.page} of ${totalPages} ──\n${p.text}`)
        .join("\n\n");

      return NextResponse.json({
        status: "success",
        total_pages: totalPages,
        engine: model,
        pages: pages.map(p => ({
          page: p.page,
          text: p.text,
          confidence: p.confidence,
          lines: p.text.split("\n").filter(Boolean).map((t: string, i: number) => ({ line: i + 1, text: t })),
          error: p.error,
        })),
        merged_text,
      });
    }

    // ══════════════════════════════════════════════
    // ROUTE 2: PDF + local engine → Python backend
    // ══════════════════════════════════════════════
    if (pdfBase64 || mimeType === "application/pdf") {
      try {
        const response = await fetch(`${PYTHON_BACKEND}/api/ocr-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfBase64: pdfBase64 || imageBase64,
            target_model: model,
          }),
          signal: AbortSignal.timeout(600_000),
        });
        if (!response.ok) {
          return NextResponse.json({ error: "PDF OCR Failed", detail: await response.text() }, { status: 500 });
        }
        return NextResponse.json(await response.json());
      } catch (e: any) {
        console.error("── [API/OCR] ROUTE 2 FETCH ERROR ──", e);
        require('fs').appendFileSync('ocr_debug.log', new Date().toISOString() + ' ROUTE 2 ERROR: ' + e.message + '\\n');
        return NextResponse.json({
          error: "Python OCR Backend Unreachable",
          detail: `Local OCR requires the Python backend to be running.\nStart it with: .\\venv\\Scripts\\python.exe main.py\nError: ${e.message}`,
        }, { status: 503 });
      }
    }

    // ══════════════════════════════════════════════
    // ROUTE 3: Single image + Groq Vision
    // ══════════════════════════════════════════════
    if ((model === "groq-vision" || model === "groq" || model.startsWith("llama")) && model !== "gemini-vision") {
      try {
        if (!imageBase64) return NextResponse.json({ error: "No image data provided" }, { status: 400 });
        // Check base64 size — Groq limit is ~4MB per image
        const sizeKB = Math.round(imageBase64.length * 0.75 / 1024);
        console.log(`[OCR] Image size: ${sizeKB} KB`);
        if (sizeKB > 4000) {
          if (GEMINI_API_KEY) {
            console.log("[OCR] Image too large for Groq, falling back to Gemini...");
            const text = await geminiOcrPage(imageBase64);
            return NextResponse.json({ status: "success", text, confidence: 98, detections: [] });
          }
          return NextResponse.json({ error: "Groq OCR Failed", detail: `Image too large (${sizeKB} KB). Max is ~4MB. Reduce PDF scale or use lower DPI.` }, { status: 413 });
        }

        let text = "";
        let confidence = 92;
        try {
          if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
          text = await groqOcrPage(imageBase64, mimeType || "image/jpeg");
        } catch (groqErr: any) {
          console.warn(`[OCR] Groq failed, falling back to Gemini... Error: ${groqErr.message}`);
          if (GEMINI_API_KEY) {
            text = await geminiOcrPage(imageBase64);
            confidence = 98;
          } else {
            throw groqErr;
          }
        }
        return NextResponse.json({ status: "success", text, confidence, detections: [] });
      } catch (e: any) {
        console.error("[OCR] Groq/Gemini fallback failed:", e.message);
        return NextResponse.json({ error: "OCR Failed", detail: e.message }, { status: 503 });
      }
    }

    // ══════════════════════════════════════════════
    // ROUTE 4: Single image + local engines (tesseract/paddleocr/trocr)
    // ══════════════════════════════════════════════
    try {
      const response = await fetch(`${PYTHON_BACKEND}/api/compare-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, target_model: model }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) return NextResponse.json({ error: "Backend Failed", detail: await response.text() }, { status: 500 });
      const pData = await response.json();
      
      // Handle both nested and direct results from backend
      const m = pData.results?.[model] || pData.results?.["gemini-vision"] || (pData.text ? pData : null);
      
      if (m) {
        return NextResponse.json({ 
          status: "success",
          text: m.text || "", 
          confidence: m.confidence || 0, 
          detections: m.detections || [] 
        });
      }
      return NextResponse.json({ error: "Model not found in results", detail: JSON.stringify(pData) }, { status: 404 });
    } catch (e: any) {
      return NextResponse.json({
        error: "Python OCR Backend Unreachable",
        detail: `Local engines require the Python backend.\nStart: .\\venv\\Scripts\\python.exe main.py\nError: ${e.message}`,
      }, { status: 503 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "Internal Server Error", detail: e.message }, { status: 500 });
  }
}