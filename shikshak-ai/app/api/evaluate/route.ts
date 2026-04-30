// app/api/evaluate/route.ts
// Proxy to Python backend evaluation endpoint
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${PYTHON_BACKEND}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Evaluation backend failed", detail: await response.text() },
        { status: 500 }
      );
    }
    return NextResponse.json(await response.json());
  } catch (e: any) {
    console.error("── [API/EVALUATE] CRITICAL BACKEND ERROR ──");
    require('fs').appendFileSync('ocr_debug.log', new Date().toISOString() + ' EVALUATE ERROR: ' + e.message + '\\n');
    console.error("Target URL:", `${PYTHON_BACKEND}/api/evaluate`);
    console.error("Name:", e.name);
    console.error("Message:", e.message);
    if (e.cause) console.error("Cause:", e.cause);

    return NextResponse.json(
      {
        error: "Python Backend Unreachable",
        detail: `[${e.name}] ${e.message}. URL: ${PYTHON_BACKEND}. Cause: ${e.cause || 'Unknown'}`,
      },
      { status: 503 }
    );
  }
}
