import sys
import os
import subprocess

# Auto-re-execute using the virtual environment python interpreter if it exists and we are not using it
if os.name == 'nt':
    venv_python = os.path.abspath(os.path.join(os.path.dirname(__file__), "venv", "Scripts", "python.exe"))
else:
    venv_python = os.path.abspath(os.path.join(os.path.dirname(__file__), "venv", "bin", "python"))

if os.path.exists(venv_python) and sys.executable.lower() != venv_python.lower():
    args = [venv_python] + sys.argv
    sys.exit(subprocess.call(args))


# Intercept stdout and stderr to prevent crash on Windows when printing unicode characters to non-UTF8 consoles/files
class SafeStreamWrapper:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, data):
        try:
            self.original_stream.write(data)
        except UnicodeEncodeError:
            encoding = getattr(self.original_stream, 'encoding', 'utf-8') or 'utf-8'
            safe_data = data.encode(encoding, errors='replace').decode(encoding, errors='replace')
            self.original_stream.write(safe_data)

    def flush(self):
        self.original_stream.flush()

    def __getattr__(self, name):
        return getattr(self.original_stream, name)

sys.stdout = SafeStreamWrapper(sys.stdout)
sys.stderr = SafeStreamWrapper(sys.stderr)

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
from openai import OpenAI  # type: ignore
from fpdf import FPDF
from PIL import Image
import fitz            # PyMuPDF
import json
import requests as http_requests
try:
    import google.generativeai as genai  # type: ignore
except ImportError:
    genai = None  # type: ignore
try:
    from groq import Groq  # type: ignore
except ImportError:
    Groq = None  # type: ignore

from ocr_engine import OCRComparer

load_dotenv()

def _call_groq_api_direct(
    api_key: str,
    model: str,
    messages: list,
    temperature: float = 0.1,
    max_tokens: int = 4096,
    response_format: dict = None,
    timeout: float = 120.0
):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    if response_format:
        payload["response_format"] = response_format

    resp = http_requests.post(url, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    resp_json = resp.json()
    
    content = resp_json["choices"][0]["message"]["content"]
    
    class MessageObj:
        def __init__(self, c):
            self.content = c
            
    class ChoiceObj:
        def __init__(self, c):
            self.message = MessageObj(c)
            
    class ResponseObj:
        def __init__(self, c):
            self.choices = [ChoiceObj(c)]
            
    return ResponseObj(content)


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
# Increase PIL decompression bomb limit to handle large exam PDFs safely
# Default is 178M pixels — we raise it to 500M to handle high-DPI multi-page exam scans
Image.MAX_IMAGE_PIXELS = 500_000_000

# DPI used for PDF rendering:
#   150 DPI = fast, safe for cloud vision OCR and annotation (images ~5-10 MP per page)
#   200 DPI = better quality, still within safe bounds
#   Use 150 for speed and memory safety; bump to 200 if OCR quality is poor
_PDF_RENDER_DPI = 150
_PDF_RENDER_ZOOM = _PDF_RENDER_DPI / 72.0  # fitz uses zoom factor (72 DPI base)

def _pdf_bytes_to_images(pdf_bytes: bytes, dpi: int = None) -> list:
    """
    Convert PDF bytes to a list of PIL Images (one per page).
    Uses PyMuPDF (fitz) for speed and to avoid external subprocess overhead.
    DPI is capped to avoid DecompressionBomb crashes with PIL.
    """
    render_dpi = min(dpi or _PDF_RENDER_DPI, 200)  # Hard cap at 200 DPI for safety
    zoom = render_dpi / 72.0
    try:
        import fitz
        from PIL import Image
        import io
        
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        mat = fitz.Matrix(zoom, zoom)
        
        for i in range(min(len(doc), MAX_PAGES)):
            page = doc[i]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            # Convert to PIL Image directly from buffer
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            # Safety check: if image is still too large (e.g., A0 paper), downsample
            MAX_SAFE_PIXELS = 25_000_000  # 25 MP per page is more than enough
            if img.width * img.height > MAX_SAFE_PIXELS:
                scale = (MAX_SAFE_PIXELS / (img.width * img.height)) ** 0.5
                new_w, new_h = int(img.width * scale), int(img.height * scale)
                img = img.resize((new_w, new_h), Image.LANCZOS)
                print(f"⚠️ [PDF-TO-IMAGES] Page {i+1} downsampled to {new_w}x{new_h} for memory safety")
            images.append(img)
            
        doc.close()
        print(f"✅ [PDF-TO-IMAGES] Converted {len(images)} pages using PyMuPDF at {render_dpi} DPI")
        return images
    except Exception as e:
        print(f"⚠️ [PDF-TO-IMAGES] PyMuPDF failed: {e}. Falling back to pdf2image.")
        try:
            from pdf2image import convert_from_bytes
            poppler_path = r"C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\poppler-25.07.0\Library\bin"
            if not os.path.exists(poppler_path): poppler_path = None
            images = convert_from_bytes(pdf_bytes, dpi=render_dpi, poppler_path=poppler_path)
            return images[:MAX_PAGES]
        except Exception as e2:
            raise RuntimeError(f"PDF conversion failed: {e2}")


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

        response = await asyncio.to_thread(
            _call_groq_api_direct,
            api_key=api_key,
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
            timeout=120.0
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
        if genai is None:
            return {"status": "error", "message": "google-generativeai not installed"}
        genai.configure(api_key=api_key)
        model_gemini = genai.GenerativeModel("gemini-2.5-flash")
        response = model_gemini.generate_content(prompt)
        return {"status": "success", "enhanced_text": response.text}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 3b — PDF Text Extractor (typed PDFs)
# ─────────────────────────────────────────────
class ExtractPDFTextRequest(BaseModel):
    pdfBase64: str

@app.post("/api/extract-pdf-text")
async def extract_pdf_text(req: ExtractPDFTextRequest):
    """
    Extracts embedded text from a computer-typed PDF using PyMuPDF.
    No OCR needed — reads the text layer directly. Instant and 100% accurate.
    """
    try:
        pdf_bytes = base64.b64decode(req.pdfBase64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        pages_text = []
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                pages_text.append(f"── Page {i+1} of {len(doc)} ──\n{text}")

        total_pages = len(doc)
        doc.close()

        if not pages_text:
            return {
                "status": "error",
                "message": "No embedded text found. This PDF may contain scanned images — use the Document AI OCR feature instead."
            }

        merged = "\n\n".join(pages_text)
        print(f"✅ [PDF-EXTRACT] {len(pages_text)}/{total_pages} pages extracted ({len(merged)} chars)")
        return {
            "status": "success",
            "text": merged,
            "total_pages": total_pages,
            "pages_with_text": len(pages_text),
        }
    except Exception as e:
        print(f"❌ [PDF-EXTRACT] Error: {e}")
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────
# ENDPOINT 3c — Smart Glossary Creator ⭐
# ─────────────────────────────────────────────
class GlossaryRequest(BaseModel):
    text: str           # Raw text (chapter, notes, syllabus, etc.)
    subject: str = ""   # Optional: e.g. "Biology", "Economics"
    level: str = ""     # Optional: e.g. "Grade 10", "1st Year"

@app.post("/api/glossary")
async def create_glossary(req: GlossaryRequest):
    """
    Scans the provided academic text and extracts all difficult/important terms.
    Returns structured JSON with contextual definitions, difficulty, category,
    and an example sentence — all tailored to the student's level.
    Uses Groq (fast) → Gemini fallback.
    """
    groq_key   = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not groq_key and not gemini_key:
        return {"status": "error", "message": "No API key configured. Set GROQ_API_KEY or GEMINI_API_KEY."}

    subject_hint = f"Subject: {req.subject}." if req.subject else ""
    level_hint   = f"Student level: {req.level}." if req.level else ""

    PROMPT = f"""You are an expert academic curriculum designer and lexicographer.
Your task is to scan the provided text and extract ALL important, difficult, or domain-specific terms.
{subject_hint} {level_hint}

RULES:
1. Extract ONLY terms that are genuinely academic, technical, or difficult — not common everyday words.
2. Provide definitions that are simple, contextual (based on how the word is used in THIS text), and age-appropriate.
3. Do NOT use the word itself in its definition.
4. Provide a real-world analogy or example sentence that makes the concept click instantly.
5. Assign a difficulty level: "easy", "medium", or "hard".
6. Assign a category such as "Biology", "Physics", "Economics", "Grammar", "History", "Mathematics", etc.
7. Extract between 5 and 20 terms. Prioritize the most important ones.

TEXT TO ANALYSE:
\"\"\"
{req.text[:6000]}
\"\"\"

Respond ONLY with a valid JSON object in this exact format, no markdown, no code fences:
{{
  "terms": [
    {{
      "term": "Photosynthesis",
      "definition": "The process by which green plants use sunlight, water, and carbon dioxide to produce their own food and release oxygen.",
      "example": "A leaf on a sunny day is like a tiny solar-powered factory — it takes in sunlight and CO2, and outputs sugar and oxygen.",
      "difficulty": "medium",
      "category": "Biology"
    }}
  ],
  "total_terms": 1,
  "subject_detected": "Biology"
}}"""

    # ── Try Groq first ──
    if groq_key:
        try:
            def _call():
                res = _call_groq_api_direct(
                    api_key=groq_key,
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": "You are an expert academic lexicographer. Respond with valid JSON only."},
                        {"role": "user", "content": PROMPT}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=4096,
                    timeout=120.0
                )
                return json.loads(res.choices[0].message.content)
            data = await asyncio.to_thread(_call)

            print(f"✅ [GLOSSARY] Groq extracted {data.get('total_terms', '?')} terms")
            return {"status": "success", **data}
        except Exception as e:
            print(f"⚠️ [GLOSSARY] Groq failed: {e} — falling back to Gemini")

    # ── Gemini fallback ──
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": PROMPT}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}
            }
            resp = await asyncio.to_thread(lambda: http_requests.post(url, json=payload, timeout=60))
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            data = json.loads(text)
            print(f"✅ [GLOSSARY] Gemini extracted {data.get('total_terms', '?')} terms")
            return {"status": "success", **data}
        except Exception as e:
            print(f"❌ [GLOSSARY] Gemini also failed: {e}")
            return {"status": "error", "message": str(e)}

    return {"status": "error", "message": "All LLM providers failed."}


# ─────────────────────────────────────────────
# ENDPOINT 4 — Answer Sheet Evaluation (NEW ⭐)
# ─────────────────────────────────────────────
# ─── Strictness level descriptions (used in both evaluate & evaluate-pro) ───────
_STRICTNESS_INSTRUCTIONS = {
    1: """GRADING STYLE: VERY LENIENT — School Teacher (Kind & Encouraging)
  - Give full marks if the student clearly understood the concept, even if wording is informal or imprecise.
  - Award marks for correct final answers even if working steps are missing.
  - Overlook minor spelling/grammar mistakes — do NOT deduct for them.
  - If the student's answer shows the right idea but uses different words than the model answer, give full marks.
  - Round UP partial scores when in doubt (e.g., 3.5 → 4).
  - Write warm, encouraging feedback. Focus on what the student did right.""",
    2: """GRADING STYLE: LENIENT — Supportive Teacher
  - Award full marks for answers that are mostly correct with minor gaps.
  - Accept correct final answers with minimal working — do NOT strictly require every step.
  - Small factual errors that don't affect the core answer: deduct at most 0.5 marks.
  - Round UP when the student clearly understood the concept.
  - Feedback should highlight strengths before pointing out weaknesses.""",
    3: """GRADING STYLE: BALANCED — Standard School Examiner (Default)
  - Grade fairly: reward correct understanding but deduct for clearly wrong or missing key points.
  - Require some working for calculation questions, but do not strictly penalise every missing step.
  - Award partial marks generously when the core concept is correct.
  - Feedback should be balanced — mention both strengths and improvements needed.""",
    4: """GRADING STYLE: STRICT — Senior Examiner
  - Require clear, complete answers. Missing key terms or steps = deduction.
  - Correct final answer without working shown: award a maximum of 75% of marks for that question.
  - Vague answers or restated questions: partial marks only.
  - Do NOT round up. Award exactly what is deserved based on content.
  - Feedback should be professional and point out every gap.""",
    5: """GRADING STYLE: VERY STRICT — University / Board Examiner
  - Apply the strictest academic standards. Every required key term, formula, step, and unit must be present.
  - Correct final answer without full working shown = maximum 50% of marks.
  - Vague or incomplete explanations = 0 marks even if partially correct.
  - Any deviation from the expected answer structure is penalised.
  - No rounding up. No sympathy marks. Feedback is precise and technical."""
}

class EvaluateRequest(BaseModel):
    student_text: str          # OCR output from student answer sheet
    question_paper_text: str   # OCR/typed question paper
    model_answers_text: str = ""   # Optional
    syllabus_text: str = ""        # Optional
    total_marks: int = 0           # Authoritative total marks for the paper
    class_level: str = ""          # Optional e.g. "Grade 10", "1st Year"
    strictness_level: int = 3      # 1=Very Lenient, 3=Balanced (default), 5=Very Strict

@app.post("/api/evaluate")
async def evaluate_answers(req: EvaluateRequest):
    """
    Evaluate a student's answer sheet like a strict, professional teacher.
    Phase 1: Parse paper structure (sections, choice questions, marks per question).
    Phase 2: Evaluate each answered question against rules.
    Tries Groq first (fast, free). Auto-falls back to Gemini if Groq is rate-limited.
    """
    try:
        groq_key = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        if not groq_key and not gemini_key:
            return {"status": "error", "message": "No API key configured. Set GROQ_API_KEY or GEMINI_API_KEY."}

        # 1. Determine mode
        if req.model_answers_text.strip():
            mode = "Mode 1 — Model Answers Provided (strict rubric-based marking)"
        elif req.syllabus_text.strip():
            mode = "Mode 2 — Syllabus Provided (syllabus-scoped grading)"
        else:
            mode = "Mode 3 — General Academic Grading (knowledge correctness)"

        # 2. Use the entire student text (no chunking) for better context
        chunks = [req.student_text]

        all_qs = []
        total_aw = 0.0
        used_engine = "groq"

        # ══════════════════════════════════════════════════════════════════
        # PHASE 1 PROMPT — Parse question paper structure
        # This tells the AI EXACTLY what sections exist, which questions
        # are mandatory vs choice, and how many marks each carries.
        # ══════════════════════════════════════════════════════════════════
        STRUCTURE_PROMPT = """\
You are a senior examiner. Carefully read this question paper and extract its complete structure.

QUESTION PAPER:
{question_paper}

Total marks stated on paper OR provided by teacher: {total_marks}

Your task — produce a JSON object describing EVERY question in the paper:

{{
  "sections": [
    {{
      "section_name": "Section A",
      "section_instructions": "Attempt ALL questions",
      "is_choice_section": false,
      "attempt_count": null,
      "questions": [
        {{
          "question_no": "1",
          "sub_questions": ["1a", "1b"],
          "marks": 10,
          "is_or_question": false,
          "or_alternative": null,
          "question_text": "Full question text"
        }}
      ]
    }},
    {{
      "section_name": "Section B",
      "section_instructions": "Attempt ANY 2 out of 4 questions",
      "is_choice_section": true,
      "attempt_count": 2,
      "questions": [
        {{
          "question_no": "3",
          "sub_questions": ["3a", "3b"],
          "marks": 15,
          "is_or_question": true,
          "or_alternative": "4",
          "question_text": "Full question text"
        }}
      ]
    }}
  ],
  "total_marks": {total_marks},
  "mandatory_marks": 0,
  "choice_marks": 0
}}

Rules:
- Detect OR questions ("Q3 OR Q4") and set is_or_question = true, or_alternative = the other question number.
- Detect "Attempt any X" instructions and set attempt_count = X.
- Set marks accurately from the paper. If marks are written in brackets like [5] or (5M), use those.
- If no question paper is provided, return {{"sections": [], "total_marks": {total_marks}, "no_paper": true}}
- Respond ONLY with valid JSON, no markdown, no extra text."""

        # ══════════════════════════════════════════════════════════════════
        # PHASE 2 PROMPT — Evaluate student answers using parsed structure
        # ══════════════════════════════════════════════════════════════════
        # Clamp strictness level to valid range
        strictness = max(1, min(5, req.strictness_level))
        strictness_instruction = _STRICTNESS_INSTRUCTIONS[strictness]

        EVAL_PROMPT_TEMPLATE = """\
You are an experienced teacher who has corrected thousands of exam papers.
You are now correcting ONE student's answer sheet.

GRADING MODE: {mode}
PAPER TOTAL MARKS: {total_marks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICTNESS INSTRUCTION — THIS OVERRIDES ALL DEFAULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{strictness_instruction}

PAPER STRUCTURE (sections, mandatory vs choice, marks per question):
{paper_structure}

REFERENCE / MODEL ANSWERS / SYLLABUS:
{reference}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRADING RULES — FOLLOW THESE (adjusted by the STRICTNESS INSTRUCTION above)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — READ THE PAPER STRUCTURE FIRST
  Before grading anything, identify:
  a) Which questions are MANDATORY (must answer).
  b) Which sections have CHOICE ("attempt any X out of Y").
  c) Which individual questions are OR questions (student picks one from two).
  Use the paper_structure JSON above to determine this.

RULE 2 — IDENTIFY WHICH QUESTIONS THE STUDENT ANSWERED
  Look at the student's answer sheet carefully:
  a) Note which question numbers they have written at the top of each answer.
  b) If no number is written, match by content to the question paper.
  c) Group sub-questions (1a, 1b, 1c) under the parent question.
  d) Note the page number(s) where each answer appears.

RULE 3 — HANDLE CHOICE / OPTIONAL QUESTIONS CORRECTLY
  a) If a section says "Attempt any 2 out of 4": grade ONLY the first 2 answers
     the student wrote. Additional answers beyond the required count = 0 marks each,
     with red_pen_comment = "Extra answer — not counted as per exam rules."
  b) If a question is an OR question (Q3 OR Q4): grade whichever ONE the student
     attempted. If they attempted BOTH, grade the FIRST one written; the second
     gets 0 marks with red_pen_comment = "Both options attempted — only first is graded."
  c) If a student SKIPS a mandatory question entirely: include it with marks_awarded = 0,
     student_answer_summary = "Not attempted", status = "zero".

RULE 4 — MARKS ALLOCATION
  * marks_total for each question MUST match the question paper exactly.
  * Full marks → answer is complete, accurate, contains ALL required key points.
  * Partial marks → core idea correct but: explanation incomplete, formula right but
    calculation wrong, key term missing, diagram absent, units wrong.
  * Zero marks → wrong answer, completely blank, or answer repeats question only.
  * NEVER award more than marks_total for any question.
  * NEVER round up: 3/5 correct points = 3/5 marks, not 4/5.
  * No sympathy marks. "I think the answer is X" = 0 unless X is actually correct.

RULE 5 — STEP-BY-STEP MARKING (maths / science / calculations)
  * Award method marks even when the final answer is wrong.
  * Deduct for wrong formula, wrong substitution, or wrong units.
  * Correct final answer with NO working shown = 50% of marks maximum.

RULE 6 — THEORY / DEFINITION / ESSAY QUESTIONS
  * Check: key terms used correctly, logical structure, completeness.
  * Vague or incomplete bullet points = partial marks only.
  * Copied definition with no explanation = 50% of marks maximum.
  * Missing diagram when diagram was required = deduct specified marks.

RULE 7 — SPECIFIC, PROFESSIONAL FEEDBACK
  * Be precise: "You wrote X but the correct answer is Y because Z."
  * State exactly what was missing: "Key term 'osmosis' absent — deducted 1 mark."
  * Give ONE specific, actionable improvement tip per question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDENT ANSWER SHEET (EVALUATE THIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{student_chunk}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — respond ONLY in this exact JSON format, no extra text:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{
  "questions": [
    {{
      "question_no": "1a",
      "question": "Full question text exactly as it appears in the paper",
      "section": "Section A",
      "marks_awarded": 3,
      "marks_total": 5,
      "student_answer_summary": "Brief, accurate summary of what the student actually wrote",
      "status": "full",
      "feedback": "Specific teacher feedback — what was right, what was wrong, what was missing",
      "improvement": "One specific, actionable improvement tip",
      "red_pen_comment": "Violation note (choice rule broken, extra answer, etc.) or empty string",
      "page_no": "1",
      "is_counted": true
    }}
  ]
}}

IMPORTANT: "is_counted" = false for answers that are NOT graded (extra answers beyond
choice limit, second OR option, etc.). These still appear in the list but marks_awarded = 0."""

        # ── AI CALLER FUNCTIONS ─────────────────────────────────────────────────

        def _call_groq_sync(prompt: str, system_msg: str = "You are a strict academic examiner. Respond with valid JSON only. No markdown, no code fences.") -> dict:
            import json
            import time as _time
            # Retry once on transient 429/503 errors
            for attempt in range(2):
                try:
                    res = _call_groq_api_direct(
                        api_key=groq_key,
                        model="llama-3.3-70b-versatile",
                        messages=[
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": prompt}
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.1,
                        max_tokens=4096,
                        timeout=120.0
                    )
                    return json.loads(res.choices[0].message.content)

                except Exception as e:
                    err_str = str(e).lower()
                    is_rate_limit = any(x in err_str for x in ("429", "rate limit", "quota", "503"))
                    if attempt == 0 and is_rate_limit:
                        print(f"⏳ [EVAL] Groq rate-limited (attempt {attempt+1}). Waiting 8s...")
                        _time.sleep(8)
                        continue
                    raise  # Re-raise on second attempt or non-transient error

        async def call_gemini(prompt: str, max_retries: int = 3) -> dict:
            import json
            import requests as req_lib
            import time as _time
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt + "\n\nIMPORTANT: Respond with ONLY a valid JSON object. No markdown, no code fences."}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.1,
                }
            }
            last_err = None
            for attempt in range(max_retries):
                try:
                    resp = await asyncio.to_thread(lambda: req_lib.post(url, json=payload, timeout=180))
                    resp.raise_for_status()
                    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    if text.startswith("```"):
                        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                    return json.loads(text)
                except Exception as gem_err:
                    last_err = gem_err
                    err_str = str(gem_err).lower()
                    is_rate_limit = any(x in err_str for x in ("429", "quota", "resource", "503"))
                    wait = (2 ** attempt) * 5  # 5s, 10s, 20s
                    if is_rate_limit and attempt < max_retries - 1:
                        print(f"⏳ [EVAL] Gemini rate-limited (attempt {attempt+1}). Waiting {wait}s...")
                        await asyncio.sleep(wait)
                    elif attempt < max_retries - 1:
                        print(f"⚠️ [EVAL] Gemini error (attempt {attempt+1}): {gem_err}. Retrying in {wait}s...")
                        await asyncio.sleep(wait)
                    else:
                        raise
            raise last_err

        async def _call_ai(prompt: str, system_msg: str = "You are a strict academic examiner. Respond with valid JSON only. No markdown, no code fences.") -> dict | None:
            """Call Groq first (with retry), permanently fall back to Gemini on failure.
            Never returns None silently — logs every failure so no chunk is skipped without notice."""
            nonlocal used_engine
            result = None

            # ── Try Groq (only if we haven't permanently switched away) ──
            if groq_key and used_engine == "groq":
                try:
                    result = await asyncio.to_thread(_call_groq_sync, prompt, system_msg)
                    print(f"✅ [EVAL] Groq answered successfully.")
                except Exception as groq_err:
                    print(f"⚠️ [EVAL] Groq failed permanently: {groq_err}. Switching to Gemini for ALL remaining requests.")
                    if gemini_key:
                        used_engine = "gemini"  # Permanent switch for rest of evaluation
                    else:
                        print("❌ [EVAL] No GEMINI_API_KEY available — this chunk will be skipped!")
                        return None

            # ── Try Gemini (either as fallback or if already the active engine) ──
            if result is None and gemini_key and (used_engine == "gemini" or not groq_key):
                try:
                    result = await call_gemini(prompt)
                    print(f"✅ [EVAL] Gemini answered successfully.")
                except Exception as gem_err:
                    print(f"❌ [EVAL] Gemini also failed after retries: {gem_err}. This chunk WILL be skipped.")
                    return None

            if result is None and not gemini_key and not groq_key:
                print("❌ [EVAL] No AI provider available. Chunk skipped.")
            return result

        # ── PHASE 1: Parse the question paper structure ──────────────────────────
        paper_structure_json = "{\"sections\": [], \"total_marks\": " + str(req.total_marks) + ", \"no_paper\": true}"
        if req.question_paper_text.strip():
            print("📋 [EVAL] Phase 1: Parsing question paper structure...")
            structure_prompt = STRUCTURE_PROMPT.format(
                question_paper=req.question_paper_text[:4000],
                total_marks=req.total_marks or "as stated in paper",
            )
            structure_data = await _call_ai(structure_prompt, "You are a senior examiner parsing an exam paper. Respond with valid JSON only.")
            if structure_data:
                paper_structure_json = json.dumps(structure_data, indent=2)
                print(f"✅ [EVAL] Paper structure parsed: {len(structure_data.get('sections', []))} sections")
            else:
                print("⚠️ [EVAL] Could not parse paper structure — proceeding without it")

        # ── PHASE 2: Evaluate student answers (Single Pass) ─────────────────────
        print(f"📦 [EVAL] Evaluating student text via {used_engine} — {len(req.student_text)} chars (strictness={strictness})")
        prompt = EVAL_PROMPT_TEMPLATE.format(
            mode=mode,
            total_marks=req.total_marks or "as stated in the paper",
            strictness_instruction=strictness_instruction,
            paper_structure=paper_structure_json[:3000],
            reference=(req.model_answers_text[:3000] if req.model_answers_text.strip()
                       else req.syllabus_text[:3000] if req.syllabus_text.strip()
                       else "Not provided — grade based on academic correctness."),
            student_chunk=req.student_text,
        )

        chunk_data = await _call_ai(prompt)
        
        if chunk_data:
            qs = chunk_data.get("questions", [])
            all_qs.extend(qs)
            # Only count marks for questions that are actually graded (is_counted != false)
            for q in qs:
                if q.get("is_counted", True):  # default True for backward compat
                    total_aw += float(q.get("marks_awarded", 0))

        # ── AGGREGATION ─────────────────────────────────────────────────────────
        # CRITICAL FIX: total_possible is ALWAYS the paper's declared total marks.
        # Never sum up marks_total from AI responses — the AI may miss questions
        # or invent wrong totals. The teacher entered the correct total_marks.
        if req.total_marks > 0:
            total_pos = float(req.total_marks)
        else:
            # Fallback: sum marks_total only from counted questions
            total_pos = sum(
                float(q.get("marks_total", 0))
                for q in all_qs
                if q.get("is_counted", True)
            )

        # Clamp awarded marks — can never exceed total possible
        total_aw = min(total_aw, total_pos)

        pct = round((total_aw / total_pos * 100), 1) if total_pos > 0 else 0
        grade = "F"
        if pct >= 90:   grade = "A+"
        elif pct >= 80: grade = "A"
        elif pct >= 70: grade = "B"
        elif pct >= 60: grade = "C"
        elif pct >= 50: grade = "D"

        counted_qs = [q for q in all_qs if q.get("is_counted", True)]
        full_qs    = [q for q in counted_qs if q.get("status") == "full"]
        partial_qs = [q for q in counted_qs if q.get("status") == "partial"]
        zero_qs    = [q for q in counted_qs if q.get("status") in ("zero", "invalid")]
        uncounted_qs = [q for q in all_qs if not q.get("is_counted", True)]

        if pct >= 80:
            tone = "Excellent performance overall."
        elif pct >= 60:
            tone = "Good attempt with some gaps."
        elif pct >= 40:
            tone = "Average performance. Significant improvement needed."
        else:
            tone = "Weak performance. Serious revision required across all topics."

        overall = (
            f"{tone} "
            f"Student scored {total_aw}/{total_pos} ({pct}%) — Grade {grade}. "
            f"{len(full_qs)} question(s) answered fully, "
            f"{len(partial_qs)} partially, "
            f"{len(zero_qs)} with zero or no marks. "
            f"{f'{len(uncounted_qs)} extra answer(s) not counted (exam rules). ' if uncounted_qs else ''}"
            f"{'Focus on completing explanations and including key terms. ' if partial_qs else ''}"
            f"{'Revise fundamentals for topics where 0 was scored.' if zero_qs else ''}"
            f" (Evaluated via {used_engine.capitalize()})"
        )

        evaluation = {
            "questions": all_qs,
            "total_awarded": total_aw,
            "total_possible": total_pos,
            "percentage": pct,
            "grade": grade,
            "overall_feedback": overall,
        }
        return {"status": "success", "evaluation": evaluation, "mode": mode}

    except Exception as e:
        import traceback
        print(f"❌ [EVALUATE] Unhandled error: {e}\n{traceback.format_exc()}")
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
    strictness_level: int = 3      # 1=Very Lenient, 3=Balanced (default), 5=Very Strict

@app.post("/api/evaluate-pro")
async def evaluate_pro(req: EvaluateProRequest):
    """
    1. Extracts images from PDF.
    2. Runs Groq Vision OCR (cloud, parallel) — fast, no local model hang.
    3. Calls LLM (Groq → Gemini fallback) with strict grading prompt.
    4. Annotates images with Red Pen.
    5. Generates Pro Report PDF.
    """
    try:
        from evaluator_pro import ProEvaluator
        import uuid

        groq_key   = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        pdf_bytes = base64.b64decode(req.pdfBase64)
        images = _pdf_bytes_to_images(pdf_bytes)

        if not images:
            return {"status": "error", "message": "No pages in PDF"}

        pro_eval = ProEvaluator()
        total_pages = len(images)

        # ── 1. OCR Stage — Groq Vision (parallel, cloud) ─────────────────────
        print(f"🔍 [PRO-MODE] Cloud OCR via Groq Vision for {total_pages} pages...")

        # Improved OCR prompt that preserves question structure and numbering
        OCR_PROMPT = """You are a professional document transcriber specializing in handwritten exam answer sheets.

Transcribe this handwritten answer sheet page EXACTLY as written. Follow these rules:
1. PRESERVE all question numbers exactly as written (e.g., "Q1", "1.", "1a)", "Ans 3b", "Q.3 OR Q.4")
2. PRESERVE all section headings (e.g., "Section A", "Part B")
3. PRESERVE blank lines between answers to indicate question boundaries
4. DO NOT correct spelling or grammar — transcribe exactly what is written
5. If a number or label appears before a paragraph, keep it on its own line
6. For mathematical expressions, transcribe as best as possible
7. Return ONLY the transcribed text, no commentary or explanation

IMPORTANT: Question numbers written by the student (like "1.", "Q2", "Ans 3b") are CRITICAL markers — never skip or merge them."""

        async def _ocr_page_with_retry(idx: int, img_pil, attempt_delay: float = 0.0) -> tuple:
            """Transcribe one page via Groq Vision (with rate-limit retry), fallback to Gemini."""
            if attempt_delay > 0:
                await asyncio.sleep(attempt_delay)
            try:
                # Resize if image is too large for cloud vision APIs (limit ~20MP)
                MAX_PIXELS = 18_000_000
                w, h = img_pil.size
                if (w * h) > MAX_PIXELS:
                    scale = (MAX_PIXELS / (w * h)) ** 0.5
                    new_w, new_h = int(w * scale), int(h * scale)
                    img_pil = img_pil.resize((new_w, new_h), Image.LANCZOS)

                buffered = io.BytesIO()
                img_pil.convert("RGB").save(buffered, format="JPEG", quality=82)
                img_b64 = base64.b64encode(buffered.getvalue()).decode()

                # 1. Try Groq Vision first (with rate limit retry)
                if groq_key:
                    for groq_ocr_attempt in range(3):  # Up to 3 attempts with backoff
                        try:
                            response = await asyncio.to_thread(
                                _call_groq_api_direct,
                                api_key=groq_key,
                                model="meta-llama/llama-4-scout-17b-16e-instruct",
                                messages=[{
                                    "role": "user",
                                    "content": [
                                        {"type": "text", "text": OCR_PROMPT},
                                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                                    ]
                                }],
                                max_tokens=2000,
                                temperature=0,
                                timeout=120.0
                            )
                            text = response.choices[0].message.content.strip()
                            print(f"✅ [PRO-OCR] Page {idx+1}/{total_pages} done via Groq")
                            return idx, text, []
                        except Exception as groq_err:
                            err_str = str(groq_err).lower()
                            is_rate_limit = any(x in err_str for x in ("429", "rate limit", "tpm", "quota"))
                            if is_rate_limit and groq_ocr_attempt < 2:
                                wait_secs = (groq_ocr_attempt + 1) * 8  # 8s, 16s
                                print(f"⏳ [PRO-OCR] Groq rate-limited for Page {idx+1} (attempt {groq_ocr_attempt+1}). Waiting {wait_secs}s...")
                                await asyncio.sleep(wait_secs)
                            else:
                                print(f"⚠️ [PRO-OCR] Groq failed for Page {idx+1}: {groq_err}. Trying Gemini fallback...")
                                break


                # 2. Try Gemini Vision fallback (with retry)
                if gemini_key:
                    for gem_ocr_attempt in range(3):
                        try:
                            import json, requests as req_lib
                            url_gem = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
                            payload = {
                                "contents": [{
                                    "parts": [
                                        {"text": OCR_PROMPT},
                                        {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}}
                                    ]
                                }]
                            }
                            resp = await asyncio.to_thread(lambda: req_lib.post(url_gem, json=payload, timeout=90))
                            resp.raise_for_status()
                            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                            print(f"✅ [PRO-OCR] Page {idx+1}/{total_pages} done via Gemini")
                            return idx, text, []
                        except Exception as gem_err:
                            err_str = str(gem_err).lower()
                            is_rate_limit = any(x in err_str for x in ("429", "quota", "resource"))
                            if is_rate_limit and gem_ocr_attempt < 2:
                                wait_secs = (gem_ocr_attempt + 1) * 10  # 10s, 20s
                                print(f"⏳ [PRO-OCR] Gemini rate-limited for Page {idx+1} (attempt {gem_ocr_attempt+1}). Waiting {wait_secs}s...")
                                await asyncio.sleep(wait_secs)
                            else:
                                print(f"❌ [PRO-OCR] Gemini also failed for Page {idx+1}: {gem_err}")
                                break

                raise RuntimeError("All OCR providers exhausted.")
            except Exception as e:
                print(f"⚠️ [PRO-OCR] Page {idx+1} completely failed: {e}")
                return idx, f"[OCR error on page {idx+1}: {e}]", []

        # Run OCR in SEQUENTIAL BATCHES to avoid hitting TPM rate limits
        # Groq free tier: 30,000 tokens/minute — batch size of 4 pages at a time with delay
        BATCH_SIZE = 4   # pages per batch (adjust down if still hitting limits)
        BATCH_DELAY = 5  # seconds between batches (gives API time to refill token bucket)
        results = []
        for batch_start in range(0, len(images), BATCH_SIZE):
            batch = list(enumerate(images))[batch_start:batch_start + BATCH_SIZE]
            print(f"📦 [PRO-OCR] Processing batch pages {batch_start+1}–{batch_start+len(batch)} of {total_pages}")
            batch_tasks = [_ocr_page_with_retry(i, img) for i, img in batch]
            batch_results = await asyncio.gather(*batch_tasks)
            results.extend(batch_results)
            # Wait between batches to avoid rate limits (skip wait after last batch)
            if batch_start + BATCH_SIZE < len(images):
                print(f"⏳ [PRO-OCR] Batch complete. Waiting {BATCH_DELAY}s before next batch to avoid rate limits...")
                await asyncio.sleep(BATCH_DELAY)
        results.sort(key=lambda x: x[0])

        full_text_chunks = []
        page_detections_map = {}
        for idx, text, detections in results:
            page_detections_map[idx] = detections
            full_text_chunks.append(f"── Page {idx+1} ──\n{text}")
            
        # --- 2. Two-Stage LLM Evaluation ---
        print("🧠 [PRO-MODE] Starting LLM Evaluation...")
        groq_key   = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not groq_key and not gemini_key:
            return {"status": "error", "message": "No GROQ_API_KEY or GEMINI_API_KEY set for Pro Mode"}
            
        student_text = "\n\n".join(full_text_chunks)

        # Clamp strictness level to valid range
        pro_strictness = max(1, min(5, req.strictness_level))
        pro_strictness_instruction = _STRICTNESS_INSTRUCTIONS[pro_strictness]
        print(f"🎯 [PRO-MODE] Strictness level: {pro_strictness}/5")

        PROMPT = f"""You are a professional examiner with 20+ years of experience correcting school and university exam papers.
You are now grading ONE student's complete answer sheet.

════════════════════════════════════════
STRICTNESS INSTRUCTION — THIS OVERRIDES ALL DEFAULTS
════════════════════════════════════════
{pro_strictness_instruction}

════════════════════════════════════════
STEP 1: READ THE QUESTION PAPER
════════════════════════════════════════
QUESTION PAPER (read carefully — this defines marks and structure):
{req.question_paper_text[:4000]}

REFERENCE / MARKING SCHEME:
{req.model_answers_text[:2000] if req.model_answers_text else "Not provided — grade based on academic correctness and completeness."}

PAPER TOTAL MARKS: {req.total_marks}

════════════════════════════════════════
STEP 2: READ THE STUDENT'S ANSWER SHEET
════════════════════════════════════════
The student's answers appear page-by-page below. Each page is labelled "── Page N ──".
The student has written question numbers (like "Q1", "1.", "Ans 2b") at the start of each answer.
YOUR MOST IMPORTANT JOB is to correctly map each student answer to the correct question in the paper.

HOW TO IDENTIFY WHICH QUESTION IS ANSWERED WHERE:
- Look for explicit question labels the student wrote (e.g. "Q.1", "Ans. 3b", "1a)", "Question 2")
- If no label is visible, match the content of the answer to the most likely question
- Note the PAGE NUMBER where each answer appears for annotation purposes
- Group sub-parts (1a, 1b, 1c) under the parent question number

STUDENT ANSWER SHEET:
{student_text}

════════════════════════════════════════
STEP 3: GRADE USING THESE STRICT RULES
════════════════════════════════════════

RULE 1 — UNDERSTAND PAPER STRUCTURE
  a) Identify all sections (Section A, B, Module 1, etc.)
  b) Identify MANDATORY questions (must attempt) vs CHOICE sections ("attempt any X out of Y")
  c) Identify OR questions (student picks ONE of two)

RULE 2 — HANDLE CHOICE / OR QUESTIONS CORRECTLY
  a) "Attempt any X out of Y" section: grade ONLY the FIRST X answers the student wrote.
     Additional answers beyond X: marks_awarded = 0, is_counted = false.
  b) OR questions: grade ONLY the one the student chose (first if both attempted).
     Second OR option: marks_awarded = 0, is_counted = false.
  c) Mandatory question NOT attempted: include with marks_awarded = 0, status = "zero", student_answer_summary = "Not attempted".

RULE 3 — MARKS ALLOCATION (be strict — no charity marks)
  * marks_total for each question MUST EXACTLY match the question paper.
  * NEVER award more than marks_total for any question.
  * Full marks: answer is complete, accurate, ALL key points present.
  * Partial marks: core idea correct but — explanation incomplete, wrong units, key term missing, diagram absent, formula right but calculation wrong.
  * Zero: wrong answer, completely blank, or answer just repeats the question.
  * For calculations: award method marks even if final answer is wrong.
  * For theory/definitions: check key terms, logical structure, completeness.
  * Vague or incomplete bullets = partial only. Copied definition with no explanation = 50% max.

RULE 4 — SPECIFIC PROFESSIONAL FEEDBACK
  * Be precise: "You wrote X but the correct answer is Y because Z."
  * State exactly what was missing: "Key term 'osmosis' absent — deducted 1 mark."
  * Give one specific, actionable improvement tip per question.

RULE 5 — SCORING
  * total_awarded = sum of marks_awarded for is_counted=true questions ONLY.
  * total_possible = {req.total_marks} exactly — DO NOT change this.
  * percentage = (total_awarded / {req.total_marks}) * 100, rounded to 1 decimal.

════════════════════════════════════════
OUTPUT — valid JSON only, no markdown:
════════════════════════════════════════
{{
  "questions": [
    {{
      "question_no": "1a",
      "question": "Full question text exactly as it appears in the paper",
      "section": "Section A",
      "marks_awarded": 2,
      "marks_total": 5,
      "status": "partial",
      "is_counted": true,
      "student_answer_summary": "Brief accurate summary of what the student actually wrote for this question",
      "mistakes": [
        {{"text": "specific wrong phrase or concept the student wrote", "marks_deducted": 2, "comment": "Explanation of why this is wrong"}}
      ],
      "correct_parts": [
        {{"text": "specific correct phrase the student wrote", "marks_awarded": 2}}
      ],
      "feedback": "Specific teacher feedback: what was right, what was wrong, what was missing",
      "improvement": "One specific actionable tip to improve this answer",
      "red_pen_comment": "Violation note (choice rule broken, extra answer, etc.) or empty string",
      "page_no": 1
    }}
  ],
  "total_awarded": 0,
  "total_possible": {req.total_marks},
  "percentage": 0.0,
  "grade": "F",
  "overall_feedback": "Comprehensive overall assessment of student performance.",
  "mark_loss_analysis": [
    "Q1a: Key term 'osmosis' missing (-1 mark)",
    "Q2b: Wrong formula used, correct working method (+2 method marks, -3 for wrong answer)"
  ]
}}

CRITICAL REMINDERS:
- total_possible MUST be {req.total_marks} — the paper's declared total, never change it.
- total_awarded = sum of marks_awarded for is_counted=true questions only.
- Recalculate percentage accurately.
- Every question from the paper must appear in the output (either graded or as "Not attempted").
- The student_answer_summary field must describe what the student ACTUALLY wrote, not what they should have written."""
        
        import json, requests as req_lib
        import time as _time
        eval_data = None

        # --- Try Groq first (fast, free) — with one retry on rate limits ---
        if groq_key:
            for groq_attempt in range(2):
                try:
                    print(f"🚀 [PRO-MODE] Trying Groq (llama-3.3-70b-versatile) attempt {groq_attempt+1}...")
                    def _call_groq_pro():
                        res = _call_groq_api_direct(
                            api_key=groq_key,
                            model="llama-3.3-70b-versatile",
                            messages=[
                                {"role": "system", "content": "You are a strict academic examiner. Respond with valid JSON only."},
                                {"role": "user", "content": PROMPT}
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.1,
                            max_tokens=4096,
                            timeout=240.0
                        )
                        return json.loads(res.choices[0].message.content)
                    eval_data = await asyncio.to_thread(_call_groq_pro)
                    print("✅ [PRO-MODE] Groq evaluation succeeded.")
                    break  # Success — exit retry loop

                except Exception as groq_err:
                    err_str = str(groq_err).lower()
                    is_rate_limit = any(x in err_str for x in ("429", "rate limit", "quota", "503"))
                    if groq_attempt == 0 and is_rate_limit:
                        print(f"⏳ [PRO-MODE] Groq rate-limited. Waiting 10s before retry...")
                        await asyncio.sleep(10)
                    else:
                        print(f"⚠️ [PRO-MODE] Groq failed: {groq_err} — falling back to Gemini")
                        break

        # --- Gemini fallback — with exponential backoff retries ---
        if eval_data is None and gemini_key:
            gemini_max_retries = 3
            for gem_attempt in range(gemini_max_retries):
                try:
                    print(f"✨ [PRO-MODE] Trying Gemini (gemini-2.5-flash) attempt {gem_attempt+1}/{gemini_max_retries}...")
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{"parts": [{"text": PROMPT}]}],
                        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
                    }
                    resp = await asyncio.to_thread(lambda: req_lib.post(url, json=payload, timeout=240))
                    resp.raise_for_status()
                    text_resp = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    if text_resp.startswith("```"):
                        text_resp = text_resp.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                    eval_data = json.loads(text_resp)
                    print("✅ [PRO-MODE] Gemini evaluation succeeded.")
                    break  # Success
                except Exception as gem_err:
                    err_str = str(gem_err).lower()
                    is_rate_limit = any(x in err_str for x in ("429", "quota", "resource", "503"))
                    wait = (2 ** gem_attempt) * 6  # 6s, 12s, 24s
                    if gem_attempt < gemini_max_retries - 1:
                        if is_rate_limit:
                            print(f"⏳ [PRO-MODE] Gemini rate-limited (attempt {gem_attempt+1}). Waiting {wait}s...")
                        else:
                            print(f"⚠️ [PRO-MODE] Gemini error (attempt {gem_attempt+1}): {gem_err}. Retrying in {wait}s...")
                        await asyncio.sleep(wait)
                    else:
                        print(f"❌ [PRO-MODE] Gemini failed after {gemini_max_retries} attempts: {gem_err}")

        if eval_data is None:
            return {"status": "error", "message": "Both Groq and Gemini failed after retries. Check API keys and rate limits."}

        print("✅ [PRO-MODE] Evaluation Complete.")

        # ── CRITICAL FIX: Override totals with authoritative values ──────────────
        # The AI may return wrong total_possible. Always use the paper's declared marks.
        if req.total_marks > 0:
            counted_awarded = sum(
                float(q.get("marks_awarded", 0))
                for q in eval_data.get("questions", [])
                if q.get("is_counted", True)
            )
            # Clamp — can't score more than the paper total
            counted_awarded = min(counted_awarded, float(req.total_marks))
            eval_data["total_awarded"] = counted_awarded
            eval_data["total_possible"] = float(req.total_marks)
            pct = round((counted_awarded / req.total_marks) * 100, 1) if req.total_marks > 0 else 0
            eval_data["percentage"] = pct
            grade = "F"
            if pct >= 90:   grade = "A+"
            elif pct >= 80: grade = "A"
            elif pct >= 70: grade = "B"
            elif pct >= 60: grade = "C"
            elif pct >= 50: grade = "D"
            eval_data["grade"] = grade
            print(f"📊 [PRO-MODE] Score: {counted_awarded}/{req.total_marks} = {pct}% Grade {grade}")

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
            try:
                # Ensure annotation images are within safe size limits
                MAX_ANNOTATE_PIXELS = 15_000_000  # 15MP is plenty for readable annotations
                ann_w, ann_h = img.width, img.height
                if ann_w * ann_h > MAX_ANNOTATE_PIXELS:
                    scale = (MAX_ANNOTATE_PIXELS / (ann_w * ann_h)) ** 0.5
                    img = img.resize((int(ann_w * scale), int(ann_h * scale)), Image.LANCZOS)

                # Annotate only if there are evaluations for this page
                if i in page_to_qs:
                    page_eval = {"questions": page_to_qs[i]}
                    ann_img = pro_eval.annotate_page(img, page_eval, page_detections_map[i])
                    annotated_images.append(ann_img)
                else:
                    annotated_images.append(img)  # Unchanged
            except Exception as ann_err:
                print(f"⚠️ [PRO-MODE] Annotation failed for page {i+1}: {ann_err}. Using original image.")
                annotated_images.append(img.convert("RGB") if img.mode != "RGB" else img)
                
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
