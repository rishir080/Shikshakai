// app/api/ocr/compare/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const modelsStr = formData.get("models") as string;
    const selectedModels = modelsStr ? JSON.parse(modelsStr) : ["groq", "paddleocr"];

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const groqKey = process.env.GROQ_API_KEY;

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    // Backend expects JSON with base64-encoded image
    const pythonPayload = {
      imageBase64: base64,
      target_model: null, // null = run all engines
    };

    const fetchSafe = async (id: string, fetcher: () => Promise<Response>) => {
      try {
        const res = await fetcher();
        if (!res.ok) {
          const text = await res.text();
          let errorMsg = `Error ${res.status}`;
          try {
            const errJson = JSON.parse(text);
            errorMsg = errJson.error?.message || errJson.message || text.slice(0, 100);
          } catch (e) {
            errorMsg = text.slice(0, 100);
          }
          if (res.status === 429) errorMsg = "Rate Limit Exceeded (Free Tier)";
          return { id, error: errorMsg };
        }
        return { id, res };
      } catch (err: any) {
        console.error(`── [API/COMPARE] FETCH ERROR [ID:${id}] ──`);
        console.error(`Name: ${err.name}`);
        console.error(`Message: ${err.message}`);
        if (err.cause) console.error(`Cause:`, err.cause);

        const isBackend = id === "python";
        return { 
          id, 
          error: isBackend ? `Backend Unreachable: ${err.message}` : "Network error or timeout" 
        };
      }
    };

    const extractJson = (str: string) => {
      try {
        const match = str.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : JSON.parse(str);
      } catch (e) {
        throw new Error("Invalid JSON extraction");
      }
    };

    const ocrPrompt = 'You are an professional document transcriber. Accurately transcribe all text, signatures, and handwritten marks from this document. Maintain the exact sequence and layout as a spatial map. Your output MUST be a valid JSON object. Do not include any conversational preamble or markdown code blocks outside of the JSON. Schema: { "text": "full transcription here", "confidence": 95, "detections": [{"text": "word/phrase", "box": [top, left, width, height]}] }. If certain parts are illegible, use "[illegible]".';

    const geminiKey = process.env.GEMINI_API_KEY;

    const aiRunners: any = {
      groq: () => fetchSafe("groq", () => fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }, { type: "text", text: ocrPrompt }] }],
          temperature: 0,
        }),
      })),
      "gemini-1.5-pro": () => fetchSafe("gemini-1.5-pro", () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
          contents: [{
            parts: [
              { text: ocrPrompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }]
        }),
      })),
    };

    let results: any = {};
    
    const pythonBackend = "http://127.0.0.1:8080";

    // 1. Process Python Local Engines (Can stay parallel as they don't hit Groq rate limits)
    if (selectedModels.some((m:string) => ["paddleocr", "tesseract"].includes(m))) {
       // Check health first
       const healthCheck = await fetch(`${pythonBackend}/api/health`).then(r => r.json()).catch(() => ({ status: "down" }));
       
       if (healthCheck.status === "loading") {
          selectedModels.filter((m:string) => ["paddleocr", "tesseract"].includes(m))
            .forEach((m:string) => { results[m] = { text: "AI Engines are still initializing. Please wait...", confidence: 0, detections: [], error: true }; });
       } else {
          const pythonRes = await fetchSafe("python", () => fetch(`${pythonBackend}/api/compare-ocr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pythonPayload),
          }));
          if (pythonRes.error) {
             selectedModels.filter((m:string) => ["paddleocr", "tesseract"].includes(m))
               .forEach((m:string) => { results[m] = { text: pythonRes.error, confidence: 0, detections: [], error: true }; });
          } else {
             const p = await pythonRes.res!.json();
             selectedModels.filter((m:string) => ["paddleocr", "tesseract"].includes(m))
               .forEach((m:string) => { if (p.results[m]) results[m] = p.results[m]; });
          }
       }
    }

    // 2. Process AI Cloud Engines SEQUENTIALLY to avoid Rate Limits
    const aiToRun = ["groq", "gemini-1.5-pro"].filter(m => selectedModels.includes(m));
    
    for (const modelId of aiToRun) {
      const start = Date.now();
      const outcome = await aiRunners[modelId]();
      const elapsed = Date.now() - start;

      if (outcome.error) {
        results[modelId] = { text: outcome.error, confidence: 0, detections: [], error: true, time: elapsed };
      } else {
        const g = await outcome.res!.json();
        try { 
          // Gemini parsing vs OpenAI parsing
          const msgContent = modelId === "gemini-1.5-pro" ? g.candidates?.[0]?.content?.parts?.[0]?.text : g.choices[0].message.content;
          const content = extractJson(msgContent || "{}");
          results[modelId] = { ...content, time: elapsed }; 
        } catch (e) {
          results[modelId] = { text: "JSON Parse Error from AI", error: true, time: elapsed };
        }
      }
      // Small jitter to prevent back-to-back rate limit hits
      if (aiToRun.indexOf(modelId) < aiToRun.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    return NextResponse.json({ results });

  } catch (err: any) {
    console.error("Critical Comparison Failure:", err);
    return NextResponse.json({ error: "Major processing error", detail: err.message }, { status: 500 });
  }
}