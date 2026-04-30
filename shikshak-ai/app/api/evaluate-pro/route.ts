// app/api/evaluate-pro/route.ts
// Proxy to Python backend evaluate-pro endpoint
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${PYTHON_BACKEND}/api/evaluate-pro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000), // 5 minutes timeout for 12+ pages
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Evaluation backend failed", detail: await response.text() },
        { status: 500 }
      );
    }
    return NextResponse.json(await response.json());
  } catch (e: any) {
    console.error("── [API/EVALUATE-PRO] CRITICAL BACKEND ERROR ──");
    console.error("Target URL:", `${PYTHON_BACKEND}/api/evaluate-pro`);
    console.error("Name:", e.name);
    console.error("Message:", e.message);

    return NextResponse.json(
      {
        error: "Python Backend Unreachable",
        detail: `[${e.name}] ${e.message}. URL: ${PYTHON_BACKEND}.`,
      },
      { status: 503 }
    );
  }
}
