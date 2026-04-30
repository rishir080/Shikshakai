// app/api/ocr/enhance/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { ocr_text } = await req.json();

    if (!ocr_text) {
      return NextResponse.json(
        { status: "error", message: "No text provided" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { status: "error", message: "GROQ_API_KEY not set" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are an expert at correcting OCR-extracted text from handwritten answer sheets. 
Fix spelling errors, reconstruction issues, and garbled characters while preserving the original meaning and structure exactly.
Do not add, remove, or change any content — only correct OCR errors.
Return only the corrected text with no preamble.

OCR Text:
${ocr_text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { status: "error", message: "Groq API failed", detail: err },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      status: "success",
      enhanced_text: data.choices?.[0]?.message?.content || ocr_text,
    });

  } catch (err: any) {
    console.error("OCR Enhance error:", err);
    return NextResponse.json(
      { status: "error", message: err.message || "Enhancement failed" },
      { status: 500 }
    );
  }
}