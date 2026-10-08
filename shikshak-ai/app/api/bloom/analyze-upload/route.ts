// app/api/bloom/analyze-upload/route.ts
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8080";

export const maxDuration = 120; // 2 minutes

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const subject = (formData.get("subject") as string) || "";
    const level = (formData.get("level") as string) || "";

    if (!file) {
      return NextResponse.json(
        { status: "error", message: "No file provided for analysis." },
        { status: 400 }
      );
    }

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = "";

    // 1. Text files (.txt, .md, .csv)
    if (filename.endsWith(".txt") || filename.endsWith(".md") || filename.endsWith(".csv")) {
      extractedText = buffer.toString("utf-8");
    }
    // 2. PDF files (.pdf)
    else if (filename.endsWith(".pdf")) {
      const base64Data = buffer.toString("base64");
      let extracted = false;

      // Try PyMuPDF extraction on Python backend
      try {
        const extResp = await fetch(`${PYTHON_BACKEND}/api/extract-pdf-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64Data }),
          signal: AbortSignal.timeout(30_000),
        });

        if (extResp.ok) {
          const extData = await extResp.json();
          if (extData.status === "success" && extData.text && extData.text.trim()) {
            extractedText = extData.text.trim();
            extracted = true;
          }
        }
      } catch (err) {
        console.warn("[API/BLOOM/UPLOAD] PDF text extraction error:", err);
      }

      // If PyMuPDF returned no text, it might be scanned. Try OCR endpoint
      if (!extracted) {
        try {
          const ocrFormData = new FormData();
          const blob = new Blob([buffer], { type: "application/pdf" });
          ocrFormData.append("file", blob, file.name);

          const ocrResp = await fetch(`${PYTHON_BACKEND}/api/ocr-pdf`, {
            method: "POST",
            body: ocrFormData,
            signal: AbortSignal.timeout(90_000),
          });

          if (ocrResp.ok) {
            const ocrData = await ocrResp.json();
            if (ocrData.full_text && ocrData.full_text.trim()) {
              extractedText = ocrData.full_text.trim();
              extracted = true;
            }
          }
        } catch (ocrErr) {
          console.warn("[API/BLOOM/UPLOAD] PDF OCR error:", ocrErr);
        }
      }

      if (!extracted) {
        return NextResponse.json(
          {
            status: "error",
            message: "Could not extract text from the PDF. Ensure it contains typed text or legible scans.",
          },
          { status: 422 }
        );
      }
    }
    // 3. Image files (.png, .jpg, .jpeg, .webp)
    else if (
      filename.endsWith(".png") ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg") ||
      filename.endsWith(".webp")
    ) {
      try {
        const imgFormData = new FormData();
        const blob = new Blob([buffer], { type: file.type || "image/jpeg" });
        imgFormData.append("file", blob, file.name);

        const imgResp = await fetch(`${PYTHON_BACKEND}/api/local-ocr`, {
          method: "POST",
          body: imgFormData,
          signal: AbortSignal.timeout(60_000),
        });

        if (imgResp.ok) {
          const imgData = await imgResp.json();
          extractedText = imgData.raw_text || imgData.text || "";
        }
      } catch (imgErr) {
        console.warn("[API/BLOOM/UPLOAD] Image OCR error:", imgErr);
      }

      if (!extractedText.trim()) {
        return NextResponse.json(
          {
            status: "error",
            message: "Could not read text from the image. Ensure the image is clear and well-lit.",
          },
          { status: 422 }
        );
      }
    } else {
      return NextResponse.json(
        { status: "error", message: "Unsupported file type. Please upload a PDF, TXT, or Image file." },
        { status: 400 }
      );
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { status: "error", message: "No readable text could be extracted from the uploaded document." },
        { status: 422 }
      );
    }

    // Now send the extracted text into our Bloom Analysis endpoint
    const bloomResp = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"}/api/bloom/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: extractedText,
        subject,
        level,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!bloomResp.ok) {
      const errData = await bloomResp.json().catch(() => ({}));
      return NextResponse.json(
        { status: "error", message: errData.message || "Bloom analysis of extracted text failed." },
        { status: bloomResp.status }
      );
    }

    const bloomData = await bloomResp.json();
    return NextResponse.json({
      status: "success",
      extracted_text: extractedText,
      filename: file.name,
      ...bloomData,
    });
  } catch (error: any) {
    console.error("[API/BLOOM/ANALYZE-UPLOAD] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message || "Failed to process question paper upload." },
      { status: 500 }
    );
  }
}
