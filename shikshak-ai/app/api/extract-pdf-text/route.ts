// app/api/extract-pdf-text/route.ts
// Proxy to Python backend /api/extract-pdf-text (PyMuPDF direct text extraction)
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${PYTHON_BACKEND}/api/extract-pdf-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: "PDF extraction failed", detail }, { status: 500 });
    }
    return NextResponse.json(await response.json());
  } catch (e: any) {
    const isConnRefused = e.message?.includes("ECONNREFUSED") || e.message?.includes("fetch failed");
    return NextResponse.json(
      {
        error: isConnRefused
          ? "Python backend is not running. Start with: .\\venv\\Scripts\\python.exe main.py"
          : "PDF extraction failed",
        detail: `[${e.name}] ${e.message}`,
      },
      { status: 503 }
    );
  }
}
