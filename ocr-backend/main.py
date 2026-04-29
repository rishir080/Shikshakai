import os
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import io
import base64
import asyncio
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from fpdf import FPDF
from PIL import Image

from ocr_engine import OCRComparer

load_dotenv()

# ─────────────────────────────────────────────
# Startup / Shutdown
# ─────────────────────────────────────────────
comparer: Optional[OCRComparer] = None
is_ready = True
executor = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)

async def load_models_background():
    global comparer, is_ready
    print("⏳ Pre-loading TrOCR model in background thread…")
    try:
        await asyncio.to_thread(lambda: getattr(comparer, 'trocr'))
        print("✅ TrOCR Pre-loaded and ready.")

    except Exception as e:
        print(f"❌ Model loading failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global comparer
    comparer = OCRComparer()
    # ── Launch model loading in background ──
    asyncio.create_task(load_models_background())
    yield
    executor.shutdown(wait=False)

app = FastAPI(title="ShikshakAI OCR Backend", lifespan=lifespan)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"📥 [REQUEST] {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"📤 [RESPONSE] {request.method} {request.url.path} - Status: {response.status_code}")
    return response

@app.get("/api/health")
async def health_check():
    return {
        "status": "ready" if is_ready else "loading",
        "engines": ["tesseract", "paddleocr", "easyocr", "trocr"]
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PAGES = 50   # Safety cap — change freely


# ─────────────────────────────────────────────
# PDF → Images helper
# ─────────────────────────────────────────────
def _pdf_bytes_to_images(pdf_bytes: bytes) -> list:
    """Convert PDF bytes to a list of PIL Images (one per page)."""
    try:
        from pdf2image import convert_from_bytes  # type: ignore
        # Explicit path for Poppler on Windows (installed via winget)
        poppler_path = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\poppler-25.07.0\Library\bin"
        
        if not os.path.exists(poppler_path):
            # Fallback to system PATH if the specific winget path isn't found
            poppler_path = None
            
        images = convert_from_bytes(pdf_bytes, dpi=300, poppler_path=poppler_path)
        return images[:MAX_PAGES]
    except ImportError:
        raise RuntimeError("pdf2image not installed. Run: pip install pdf2image")
    except Exception as e:
        raise RuntimeError(f"PDF conversion failed: {e}")


# ─────────────────────────────────────────────
# ENDPOINT 1 — Single image OCR (existing)
# ─────────────────────────────────────────────
class CompareRequest(BaseModel):
    imageBase64: str
    target_model: str = None

@app.post("/api/compare-ocr")
async def compare_ocr(req: CompareRequest):
    try:
        if req.target_model == "gemini-vision":
            from PIL import Image
            import io
            contents = base64.b64decode(req.imageBase64)
            img_pil = Image.open(io.BytesIO(contents))
            res = await _ocr_page_gemini_vision(1, 1, img_pil)
            return {"status": "success", "results": {"gemini-vision": res}}
        
        contents = base64.b64decode(req.imageBase64)
        results = comparer.run_all(contents, req.target_model)
        return {"status": "success", "results": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 1b — PDF → Base64 Images (for Next.js Groq Vision)
# ─────────────────────────────────────────────
class PDFToImagesRequest(BaseModel):
    pdfBase64: str
    dpi: int = 200  # 200 DPI is good for handwriting, 300 for printed text

@app.post("/api/pdf-to-images")
async def pdf_to_images(req: PDFToImagesRequest):
    """
    Convert a base64 PDF to a list of base64 JPEG images (one per page).
    Used by Next.js to feed pages directly to Groq Vision API.
    """
    try:
        pdf_bytes = base64.b64decode(req.pdfBase64)
        images = _pdf_bytes_to_images(pdf_bytes)
        
        result_images = []
        for img_pil in images:
            # Resize if too large (Groq limit is 33MP)
            MAX_PIXELS = 20_000_000
            w, h = img_pil.size
            if w * h > MAX_PIXELS:
                scale = (MAX_PIXELS / (w * h)) ** 0.5
                img_pil = img_pil.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            
            buffered = io.BytesIO()
            img_pil.convert("RGB").save(buffered, format="JPEG", quality=85)
            img_b64 = base64.b64encode(buffered.getvalue()).decode()
            result_images.append(img_b64)
        
        print(f"✅ [PDF-TO-IMAGES] Converted {len(result_images)} pages")
        return {"status": "success", "images": result_images, "total_pages": len(result_images)}
    except Exception as e:
        print(f"❌ [PDF-TO-IMAGES] Error: {e}")
        return {"status": "error", "message": str(e)}




# ─────────────────────────────────────────────
# ENDPOINT 2 — Multi-page PDF OCR (NEW ⭐)
# ─────────────────────────────────────────────
class PDFOCRRequest(BaseModel):
    pdfBase64: str
    target_model: str = "trocr"   # Default to TrOCR (best for handwriting)

async def _ocr_page_groq_vision(page_num: int, total_pages: int, img_pil: Image.Image):
    """Run handwriting recognition on a single page using Groq's Vision model (Llama-3.2-11b)."""
    try:
        print(f"🚀 [TURBO] Starting Page {page_num}/{total_pages} (Cloud)...")
        # Resize if image is too large for Groq (limit is 33MP)
        MAX_PIXELS = 25_000_000 # Safety margin below 33MP
        w, h = img_pil.size
        if (w * h) > MAX_PIXELS:
            scale = (MAX_PIXELS / (w * h))**0.5
            new_w, new_h = int(w * scale), int(h * scale)
            print(f"⚠️ [TURBO] Resizing from {w}x{h} to {new_w}x{h} to stay under Groq limits")
            img_pil = img_pil.resize((new_w, new_h), Image.LANCZOS)

        # Convert PIL to base64
        buffered = io.BytesIO()
        img_pil.save(buffered, format="JPEG", quality=75) # Balanced quality
        img_b64 = base64.b64encode(buffered.getvalue()).decode()

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"page": page_num, "text": "Error: GROQ_API_KEY not found", "confidence": 0, "error": True}

        from groq import AsyncGroq
        client = AsyncGroq(api_key=api_key)
        
        response = await client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcribe the handwriting on this page exactly as it appears. Include only the text content, no commentary."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                ]
            }],
            max_tokens=2000,
            temperature=0,
        )
        text = response.choices[0].message.content.strip()
        print(f"✅ [TURBO] Completed Page {page_num}")
        return {
            "page": page_num,
            "text": text,
            "confidence": 95,
            "lines": [{"line": i + 1, "text": t} for i, t in enumerate(text.split("\n")) if t.strip()],
            "time_ms": 0, # API time not tracked here
        }
    except Exception as e:
        print(f"❌ [TURBO] Page {page_num} failed: {e}")
        return {"page": page_num, "text": f"Error: {str(e)}", "confidence": 0, "error": True}

async def _ocr_page_gemini_vision(page_num: int, total_pages: int, img_pil: Image.Image):
    """Run OCR on a single page using Gemini 1.5 Flash via REST API."""
    try:
        print(f"✨ [GEMINI] Starting Page {page_num}/{total_pages}...")
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"page": page_num, "text": "Error: GEMINI_API_KEY not set", "confidence": 0, "error": True}

        # Convert PIL image to base64
        buffered = io.BytesIO()
        img_pil.save(buffered, format="JPEG", quality=80)
        img_b64 = base64.b64encode(buffered.getvalue()).decode()

        import json, requests as req_lib
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": "Transcribe the handwriting on this page exactly as it appears. Return only the transcribed text."},
                    {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}}
                ]
            }]
        }
        resp = await asyncio.to_thread(lambda: req_lib.post(url, json=payload, timeout=60))
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

        print(f"✅ [GEMINI] Completed Page {page_num}")
        return {
            "page": page_num,
            "text": text,
            "confidence": 98,
            "lines": [{"line": i + 1, "text": t} for i, t in enumerate(text.split("\n")) if t.strip()],
        }
    except Exception as e:
        print(f"❌ [GEMINI] Page {page_num} failed: {e}")
        return {"page": page_num, "text": f"Error: {str(e)}", "confidence": 0, "error": True}

@app.post("/api/ocr-pdf")
async def ocr_pdf(req: PDFOCRRequest):
    """
    Accept a base64-encoded PDF.
    Extract all pages, run OCR based on target model, return structured results.
    """
    try:
        pdf_bytes = base64.b64decode(req.pdfBase64)
        images = _pdf_bytes_to_images(pdf_bytes)
        total_pages = len(images)

        if not images:
            return {"status": "error", "message": "No pages extracted from PDF"}

        # ─── TURBO MODE (Cloud Vision) ───
        if req.target_model == "groq-vision":
            tasks = [
                _ocr_page_groq_vision(i + 1, total_pages, img)
                for i, img in enumerate(images)
            ]
            pages = await asyncio.gather(*tasks)
        
        # ─── GEMINI MODE (High Speed Cloud) ───
        elif req.target_model == "gemini-vision":
            tasks = [
                _ocr_page_gemini_vision(i + 1, total_pages, img)
                for i, img in enumerate(images)
            ]
            pages = await asyncio.gather(*tasks)
        
        # ─── LOCAL MODE (TrOCR / Tesseract / Paddle) ───
        else:
            loop = asyncio.get_event_loop()
            def ocr_one_page(args):
                page_num, img_pil = args
                print(f"📄 [LOCAL] Starting Page {page_num}/{total_pages}...")
                page_results = comparer.run_page(img_pil, req.target_model)
                engine_result = page_results.get(req.target_model, {})
                print(f"✅ [LOCAL] Completed Page {page_num}")
                return {
                    "page": page_num,
                    "text": engine_result.get("text", ""),
                    "confidence": engine_result.get("confidence", 0),
                    "lines": [
                        {"line": i + 1, "text": t}
                        for i, t in enumerate(engine_result.get("text", "").split("\n"))
                        if t.strip()
                    ],
                    "time_ms": engine_result.get("time", 0),
                }

            tasks = [
                loop.run_in_executor(executor, ocr_one_page, (i + 1, img))
                for i, img in enumerate(images)
            ]
            pages = await asyncio.gather(*tasks)

        # Build merged full text
        merged_text = "\n\n".join(
            f"── Page {p['page']} of {total_pages} ──\n{p['text']}"
            for p in pages
            if p.get("text", "").strip()
        )

        return {
            "status": "success",
            "total_pages": total_pages,
            "engine": req.target_model,
            "pages": pages,
            "merged_text": merged_text,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 3 — AI Text Enhancement (Groq)
# ─────────────────────────────────────────────
class EnhanceRequest(BaseModel):
    ocr_text: str

@app.post("/api/enhance-text")
async def enhance_text(req: EnhanceRequest):
    prompt = f"""You are an expert document transcription corrector.
Clean up this noisy OCR text extracted from a handwritten answer sheet.
Rules:
- Fix clear OCR errors and spelling mistakes
- Preserve ALL page separators (── Page N of M ──)
- Preserve the line structure and paragraph breaks
- Do NOT add or remove content, only fix errors
- Return ONLY the corrected text, no commentary

OCR Text:
{req.ocr_text}"""
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"status": "error", "message": "GEMINI_API_KEY not set"}
            
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model_gemini = genai.GenerativeModel('gemini-flash-latest')
        
        response = model_gemini.generate_content(prompt)
        return {"status": "success", "enhanced_text": response.text}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 4 — Answer Sheet Evaluation (NEW ⭐)
# ─────────────────────────────────────────────
class EvaluateRequest(BaseModel):
    student_text: str          # OCR output from student answer sheet
    question_paper_text: str   # OCR/typed question paper
    model_answers_text: str = ""   # Optional
    syllabus_text: str = ""        # Optional
    total_marks: int = 0           # Optional hint for grading scale
    class_level: str = ""          # Optional e.g. "Grade 10", "1st Year"

@app.post("/api/evaluate")
async def evaluate_answers(req: EvaluateRequest):
    """
    Evaluate a student's answer sheet.
    Tries Groq first (fast, free). Auto-falls back to Gemini if Groq is rate-limited.
    """
    try:
        groq_key = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        # 1. Determine mode
        if req.model_answers_text.strip():
            mode = "Mode 1 (Model Answer provided — strict rubric-based marking)"
        elif req.syllabus_text.strip():
            mode = "Mode 2 (Syllabus provided — syllabus-scoped grading)"
        else:
            mode = "Mode 3 (General knowledge grading — academic correctness)"

        # 2. Chunk student text (by page or size)
        raw_chunks = req.student_text.split("── Page")
        chunks = []
        curr = ""
        for p in raw_chunks:
            if not p.strip(): continue
            p_text = "── Page" + p
            if len(curr) + len(p_text) > 4000:
                chunks.append(curr)
                curr = p_text
            else:
                curr += p_text
        if curr: chunks.append(curr)
        if not chunks: chunks = [req.student_text]

        all_qs = []
        total_aw = 0
        total_pos = 0
        used_engine = "groq"

        EVAL_PROMPT_TEMPLATE = """Evaluate ONLY the answers found in this PARTIAL text.
Mode: {mode}
TOTAL PAPER MARKS (MAX): {total_marks}

--- STRICT GRADING RULES ---
1. CHOICE/OR VIOLATION (First Choice Wins):
   - If questions are grouped as (Part A OR Part B), the FIRST question answered determines the choice.
   - Any subsequent answers for the other part must be marked INVALID (0 marks).
   - Mention this clearly in red_pen_comment.
2. EXTRA QUESTIONS: If student answers more questions than required, grade only the FIRST N encountered. Mark rest as 0.
3. LOCATION: Identify exactly which page the student is writing on.

--- QUESTION PAPER ---
{question_paper}

--- REFERENCE (Model Answers / Syllabus) ---
{reference}

--- STUDENT ANSWERS (PARTIAL) ---
{student_chunk}

---
Respond in JSON:
{{
  "questions": [
    {{
      "question_no": "1",
      "question": "text",
      "marks_awarded": 4,
      "marks_total": 5,
      "student_answer_summary": "summary",
      "feedback": "feedback",
      "status": "full",
      "page_no": "1",
      "red_pen_comment": ""
    }}
  ]
}}"""

        async def call_groq(prompt: str) -> dict:
            from groq import Groq
            client = Groq(api_key=groq_key)
            res = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            import json
            return json.loads(res.choices[0].message.content)

        async def call_gemini(prompt: str) -> dict:
            import json, requests as req_lib
            api_key = gemini_key
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt + "\n\nIMPORTANT: Respond with ONLY a valid JSON object, no markdown or code fences."}]}],
                "generationConfig": {"responseMimeType": "application/json"}
            }
            resp = await asyncio.to_thread(lambda: req_lib.post(url, json=payload, timeout=120))
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            return json.loads(text)

        # 3. Process each chunk with auto-fallback
        for i, chunk_text in enumerate(chunks):
            print(f"📦 [EVAL] Processing Chunk {i+1}/{len(chunks)} via {used_engine}...")
            prompt = EVAL_PROMPT_TEMPLATE.format(
                mode=mode,
                total_marks=req.total_marks,
                question_paper=req.question_paper_text[:2000],
                reference=req.model_answers_text[:2000] or req.syllabus_text[:2000] or "N/A",
                student_chunk=chunk_text
            )
            try:
                if groq_key and used_engine == "groq":
                    chunk_data = await asyncio.to_thread(lambda p=prompt: __import__('json').loads(
                        __import__('groq').Groq(api_key=groq_key).chat.completions.create(
                            model="llama-3.1-8b-instant",
                            messages=[{"role": "user", "content": p}],
                            response_format={"type": "json_object"}
                        ).choices[0].message.content
                    ))
                else:
                    raise Exception("Use Gemini")
            except Exception as groq_err:
                groq_err_str = str(groq_err)
                if gemini_key and ("429" in groq_err_str or "rate" in groq_err_str.lower() or "Use Gemini" in groq_err_str or "TPD" in groq_err_str or "tokens per day" in groq_err_str.lower()):
                    print(f"✨ [EVAL] Groq rate-limited. Switching to Gemini for remaining chunks...")
                    used_engine = "gemini"
                    try:
                        chunk_data = await call_gemini(prompt)
                    except Exception as gem_err:
                        print(f"❌ [EVAL] Gemini also failed on chunk {i+1}: {gem_err}")
                        continue
                else:
                    print(f"⚠️ Chunk {i+1} failed (no fallback): {groq_err}")
                    continue

            qs = chunk_data.get("questions", [])
            all_qs.extend(qs)
            for q in qs:
                total_aw += q.get("marks_awarded", 0)
                total_pos += q.get("marks_total", 0)

            if i < len(chunks) - 1:
                import time
                time.sleep(0.5 if used_engine == "gemini" else 1.5)

        # 4. Final aggregation
        if req.total_marks > 0:
            total_pos = min(total_pos, req.total_marks)

        pct = round((total_aw / total_pos * 100), 1) if total_pos > 0 else 0
        grade = "F"
        if pct >= 90: grade = "A+"
        elif pct >= 80: grade = "A"
        elif pct >= 70: grade = "B"
        elif pct >= 60: grade = "C"
        elif pct >= 50: grade = "D"

        engine_note = f"(via {used_engine.capitalize()})" if used_engine == "gemini" else ""
        evaluation = {
            "questions": all_qs,
            "total_awarded": total_aw,
            "total_possible": total_pos,
            "percentage": pct,
            "grade": grade,
            "overall_feedback": f"Evaluation complete {engine_note}. Total marks: {total_aw}/{total_pos}."
        }
        return {"status": "success", "evaluation": evaluation, "mode": mode}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 5 — Multi-page PDF Generation (Enhanced)
# ─────────────────────────────────────────────
class PDFRequest(BaseModel):
    text: str                         # For simple text PDF
    evaluation: dict = None           # For evaluation report PDF
    title: str = "ShikshakAI Document"
    mode: str = "text"                # "text" | "evaluation"

@app.post("/api/generate-pdf")
async def generate_pdf(req: PDFRequest):
    try:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)

        if req.mode == "evaluation" and req.evaluation:
            _build_evaluation_pdf(pdf, req.evaluation, req.title)
        else:
            _build_text_pdf(pdf, req.text, req.title)

        output_path = "output.pdf"
        pdf.output(output_path)
        return {"status": "success", "message": "PDF generated", "file": output_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _safe(text: str) -> str:
    """Encode text safely for fpdf latin-1."""
    return (text or "").encode("latin-1", "replace").decode("latin-1")


def _build_text_pdf(pdf: FPDF, text: str, title: str):
    """Build a structured multi-page transcription PDF."""
    pdf.add_page()
    # Title
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 12, _safe(title), ln=True, align="C")
    pdf.ln(4)

    # Process page separators
    pages = text.split("── Page ")
    if len(pages) <= 1:
        # No page separators — just a single block
        pdf.set_font("Arial", size=11)
        pdf.multi_cell(0, 7, _safe(text))
        return

    for segment in pages:
        if not segment.strip():
            continue
        # Parse "N of M ──\n<text>"
        lines = segment.split("\n", 1)
        header = lines[0].strip().replace(" ──", "").strip()
        body = lines[1].strip() if len(lines) > 1 else ""

        # Page header bar
        pdf.set_fill_color(30, 30, 60)
        pdf.set_text_color(200, 190, 255)
        pdf.set_font("Arial", "B", 10)
        pdf.cell(0, 9, _safe(f"  Page {header}"), ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(3)

        # Page body
        pdf.set_font("Arial", size=11)
        pdf.multi_cell(0, 7, _safe(body))
        pdf.ln(6)


def _build_evaluation_pdf(pdf: FPDF, evaluation: dict, title: str):
    """Build a graded evaluation report PDF."""
    pdf.add_page()
    # Title
    pdf.set_font("Arial", "B", 18)
    pdf.set_text_color(50, 50, 120)
    pdf.cell(0, 14, _safe(title), ln=True, align="C")
    pdf.set_text_color(0, 0, 0)

    # Score summary
    total_aw  = evaluation.get("total_awarded", 0)
    total_pos = evaluation.get("total_possible", 0)
    pct       = evaluation.get("percentage", 0)
    grade     = evaluation.get("grade", "—")
    feedback  = evaluation.get("overall_feedback", "")

    pdf.set_font("Arial", "B", 13)
    pdf.ln(4)
    pdf.cell(0, 10, _safe(f"Total Score: {total_aw} / {total_pos}  ({pct}%)  |  Grade: {grade}"), ln=True)
    pdf.set_font("Arial", size=11)
    pdf.multi_cell(0, 7, _safe(f"Overall Feedback: {feedback}"))
    pdf.ln(6)

    # Per-question table
    pdf.set_font("Arial", "B", 10)
    pdf.set_fill_color(220, 220, 240)
    col_w = [12, 70, 22, 22, 70]
    headers = ["Q#", "Question", "Marks", "Status", "Feedback"]
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 8, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Arial", size=9)
    status_colors = {
        "full":    (200, 240, 200),
        "partial": (255, 240, 190),
        "wrong":   (255, 210, 210),
        "blank":   (230, 230, 230),
    }
    for q in evaluation.get("questions", []):
        color = status_colors.get(q.get("status", "blank"), (255, 255, 255))
        pdf.set_fill_color(*color)
        row = [
            str(q.get("question_no", "")),
            q.get("question", "")[:60],
            f"{q.get('marks_awarded',0)}/{q.get('marks_total',0)}",
            q.get("status", ""),
            q.get("feedback", "")[:70],
        ]
        for i, cell in enumerate(row):
            pdf.cell(col_w[i], 8, _safe(cell), border=1, fill=True)
        pdf.ln()


# ─────────────────────────────────────────────
# Serve generated PDF
# ─────────────────────────────────────────────
@app.get("/api/download-pdf")
async def download_pdf():
    if os.path.exists("output.pdf"):
        return FileResponse("output.pdf", media_type="application/pdf", filename="shikshak_report.pdf")
    return {"status": "error", "message": "No PDF generated yet"}


# ─────────────────────────────────────────────
# ENDPOINT 6 — Autonomous Evaluator (Pro Mode)
# ─────────────────────────────────────────────
class EvaluateProRequest(BaseModel):
    pdfBase64: str
    question_paper_text: str
    model_answers_text: str = ""
    total_marks: int = 100
    target_model: str = "tesseract" # Local engine for bounding boxes

@app.post("/api/evaluate-pro")
async def evaluate_pro(req: EvaluateProRequest):
    """
    1. Extracts images from PDF.
    2. Runs local OCR to get text + bounding boxes.
    3. Calls LLM with strict Prompt.
    4. Annotates images with Red Pen.
    5. Generates Pro Report PDF.
    """
    try:
        from evaluator_pro import ProEvaluator
        import uuid
        
        pdf_bytes = base64.b64decode(req.pdfBase64)
        images = _pdf_bytes_to_images(pdf_bytes)
        
        if not images:
            return {"status": "error", "message": "No pages in PDF"}
            
        pro_eval = ProEvaluator()
        
        # --- 1. OCR Stage (Parallelized) ---
        print(f"🔍 [PRO-MODE] Starting Parallel OCR Extraction for {len(images)} pages...")
        loop = asyncio.get_event_loop()
        
        async def process_page(idx, img_obj):
            engine_to_use = req.target_model if req.target_model in ["tesseract", "paddleocr", "easyocr"] else "tesseract"
            def _ocr(img):
                return comparer.run_page(img, engine_to_use).get(engine_to_use, {})
            
            res = await loop.run_in_executor(executor, _ocr, img_obj)
            return idx, res.get("text", ""), res.get("detections", [])

        # Launch all pages in parallel
        tasks = [process_page(i, img) for i, img in enumerate(images)]
        results = await asyncio.gather(*tasks)
        
        # Sort results by index to preserve order
        results.sort(key=lambda x: x[0])
        
        full_text_chunks = []
        page_detections_map = {}
        for idx, text, detections in results:
            page_detections_map[idx] = detections
            full_text_chunks.append(f"── Page {idx+1} ──\n{text}")
            
        # --- 2. Two-Stage LLM Evaluation ---
        print("🧠 [PRO-MODE] Starting LLM Evaluation...")
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            return {"status": "error", "message": "GEMINI_API_KEY missing for Pro Mode"}
            
        student_text = "\n\n".join(full_text_chunks)
        
        PROMPT = f"""You are a strict University Examiner.
Evaluate this student answer sheet.
Question Paper: {req.question_paper_text}
Reference Scheme: {req.model_answers_text}
Total Max Marks: {req.total_marks}

STUDENT ANSWERS:
{student_text}

Rules:
1. Module-wise selection: If student attempts multiple OR questions in a module, grade both but select ONLY the highest-scoring one.
2. Max marks cap.
3. Be precise with mistakes.

JSON FORMAT REQUIRED:
{{
  "questions": [
    {{
      "question_no": "1a",
      "marks_awarded": 2,
      "marks_total": 5,
      "status": "partial",
      "mistakes": [
        {{"text": "wrong concept mentioned here", "marks_deducted": 2, "comment": "Incorrect formula"}}
      ],
      "correct_parts": [
        {{"text": "correct definition text", "marks_awarded": 2}}
      ],
      "red_pen_comment": "Missing diagram",
      "page_no": 1
    }}
  ],
  "total_awarded": 2,
  "total_possible": 5,
  "percentage": 40,
  "grade": "D",
  "overall_feedback": "Needs improvement.",
  "mark_loss_analysis": [
    "Formula incorrect (-2)"
  ]
}}"""
        
        import json, requests as req_lib
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": PROMPT}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        resp = await asyncio.to_thread(lambda: req_lib.post(url, json=payload, timeout=120))
        resp.raise_for_status()
        text_resp = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        
        if text_resp.startswith("```"):
            text_resp = text_resp.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            
        eval_data = json.loads(text_resp)
        print("✅ [PRO-MODE] Evaluation Complete.")
        
        # --- 3. Annotation Stage ---
        print("🖌️ [PRO-MODE] Drawing Red Pen annotations...")
        annotated_images = []
        
        # Group questions by page
        page_to_qs = {}
        for q in eval_data.get("questions", []):
            p = int(q.get("page_no", 1)) - 1
            if p not in page_to_qs:
                page_to_qs[p] = []
            page_to_qs[p].append(q)
            
        for i, img in enumerate(images):
            # Annotate only if there are evaluations for this page
            if i in page_to_qs:
                page_eval = {"questions": page_to_qs[i]}
                ann_img = pro_eval.annotate_page(img, page_eval, page_detections_map[i])
                annotated_images.append(ann_img)
            else:
                annotated_images.append(img) # Unchanged
                
        # --- 4. Report Generation ---
        report_path = pro_eval.generate_professional_report(annotated_images, eval_data)
        
        # Generate unique filename
        filename = f"pro_report_{uuid.uuid4().hex[:6]}.pdf"
        os.rename(report_path, filename)
        
        print(f"📄 [PRO-MODE] Report ready: {filename}")
        
        return {
            "status": "success", 
            "evaluation": eval_data, 
            "pdf_url": f"/api/download-report/{filename}"
        }
        
    except Exception as e:
        print(f"❌ [PRO-MODE] Error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/download-report/{filename}")
async def download_pro_report(filename: str):
    if os.path.exists(filename):
        return FileResponse(filename, media_type="application/pdf", filename="ShikshakAI_Pro_Report.pdf")
    return {"status": "error", "message": "Report not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8080)
