// app/api/glossary/route.ts
// Proxy to Python backend /api/glossary
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const response = await fetch(`${PYTHON_BACKEND}/api/glossary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[GLOSSARY] Backend error:", detail);
      return NextResponse.json({ error: "Glossary generation failed", detail }, { status: 500 });
    }
    return NextResponse.json(await response.json());
  } catch (e: any) {
    const isConnRefused = e.message?.includes("ECONNREFUSED") || e.message?.includes("fetch failed");
    return NextResponse.json(
      {
        error: isConnRefused
          ? "Python backend is not running. Start it with: .\\venv\\Scripts\\python.exe main.py"
          : "Glossary generation failed",
        detail: `[${e.name}] ${e.message}`,
      },
      { status: 503 }
    );
  }
}
