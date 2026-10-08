// app/api/evaluate-single/route.ts
// Proxy to Python backend single-question evaluation endpoint
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${PYTHON_BACKEND}/api/evaluate-single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 minutes max for single question
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "Single question evaluation failed", detail },
        { status: 500 }
      );
    }

    return NextResponse.json(await response.json());
  } catch (e: any) {
    const isTimeout = e.name === "TimeoutError" || e.message?.includes("timeout");
    const isRefused = e.cause?.code === "ECONNREFUSED";
    const friendlyMsg = isTimeout
      ? "Evaluation timed out. Please try again."
      : isRefused
      ? "Cannot reach Python backend. Please start it with: python main.py"
      : `[${e.name}] ${e.message}`;

    return NextResponse.json(
      { error: "Single Question Evaluation Failed", detail: friendlyMsg },
      { status: 503 }
    );
  }
}
