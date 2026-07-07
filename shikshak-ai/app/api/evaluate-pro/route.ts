// app/api/evaluate-pro/route.ts
// Proxy to Python backend evaluate-pro endpoint
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = "http://127.0.0.1:8080";

// Allow up to 10 minutes for this route (Next.js default is 10s on some hosts)
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[EVALUATE-PRO] Forwarding request to Python backend...");
    const response = await fetch(`${PYTHON_BACKEND}/api/evaluate-pro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000), // 10 minutes
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`[EVALUATE-PRO] Backend returned ${response.status}:`, detail);
      return NextResponse.json(
        { error: "Evaluation backend failed", detail },
        { status: 500 }
      );
    }
    const data = await response.json();
    console.log("[EVALUATE-PRO] Success:", data?.status);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("── [API/EVALUATE-PRO] CRITICAL BACKEND ERROR ──");
    console.error("Target URL:", `${PYTHON_BACKEND}/api/evaluate-pro`);
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);

    // Distinguish connection refused from timeout
    const isTimeout = e.name === "TimeoutError" || e.message?.includes("timed out");
    const isConnRefused = e.message?.includes("ECONNREFUSED") || e.message?.includes("fetch failed");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Evaluation timed out (>10 min). Try with fewer pages."
          : isConnRefused
          ? "Python backend is not running. Start it with: python main.py"
          : "Python Backend Error",
        detail: `[${e.name}] ${e.message}`,
      },
      { status: 503 }
    );
  }
}
