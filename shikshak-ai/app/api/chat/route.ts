// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_CHAT_MODELS = [
  "groq/compound-mini",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "openai/gpt-oss-120b",
];

function cleanResponse(text: string): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    let lastError: any = null;

    for (const model of GROQ_CHAT_MODELS) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(45_000),
        });

        if (response.ok) {
          const data = await response.json();
          const raw = data.choices?.[0]?.message?.content || "";
          return NextResponse.json({ text: cleanResponse(raw), model });
        }

        const errData = await response.json().catch(() => ({}));
        lastError = errData;
      } catch (err: any) {
        lastError = { message: err.message };
      }
    }

    return NextResponse.json({ error: lastError || "All chat models failed" }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}