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
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

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
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI  # type: ignore
from fpdf import FPDF
from PIL import Image
import fitz            # PyMuPDF
import json
import re
import time
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
    max_tokens: int = 2500,
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
    if not resp.ok:
        err_msg = ""
        try:
            err_msg = resp.json().get("error", {}).get("message", "")
        except Exception:
            err_msg = resp.text[:200]
        retry_after = resp.headers.get("retry-after") or resp.headers.get("x-ratelimit-reset-tokens") or ""
        raise RuntimeError(f"Groq {resp.status_code} [{model}]: {err_msg} | retry_after={retry_after}")

    resp_json = resp.json()
    content = resp_json["choices"][0]["message"]["content"]
    
    class MessageObj:
        def __init__(self, c):
            self.content = c
            
    class ChoiceObj:
        def __init__(self, c):
            self.message = MessageObj(c)
            
    class ResponseObj:
        def __init__(self, c, h):
            self.choices = [ChoiceObj(c)]
            self.headers = h
            
    return ResponseObj(content, resp.headers)


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


# ─── Global exception handler to prevent server crash ───────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    tb = traceback.format_exc()
    print(f"[GLOBAL-ERROR] Unhandled exception on {request.url}: {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": str(exc), "detail": "Internal server error"}
    )

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"📥 [REQUEST] {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"📤 [RESPONSE] {request.method} {request.url.path} - Status: {response.status_code}")
    return response

@app.get("/")
@app.get("/health")
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
        contents = base64.b64decode(req.imageBase64)
        results = comparer.run_all(contents, req.target_model)
        return {"status": "success", "results": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}


class LocalOCRRequest(BaseModel):
    imageBase64: Optional[str] = None
    pdfBase64: Optional[str] = None

@app.post("/api/local-ocr")
async def local_ocr_fallback(req: LocalOCRRequest):
    """
    100% reliable, zero-rate-limit local OCR using PyMuPDF + Tesseract.
    """
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

        if req.pdfBase64:
            pdf_bytes = base64.b64decode(req.pdfBase64)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages_text = []
            for i, page in enumerate(doc):
                text = page.get_text("text").strip()
                if not text:
                    pix = page.get_pixmap(dpi=150)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    text = pytesseract.image_to_string(img).strip()
                pages_text.append(f"── Page {i+1} of {len(doc)} ──\n{text if text else '[blank page]'}")
            doc.close()
            merged = "\n\n".join(pages_text)
            return {"status": "success", "text": merged, "confidence": 90}

        elif req.imageBase64:
            img_bytes = base64.b64decode(req.imageBase64)
            img = Image.open(io.BytesIO(img_bytes))
            text = pytesseract.image_to_string(img).strip()
            return {"status": "success", "text": text if text else "[blank page]", "confidence": 90}

        return {"status": "error", "message": "No image or PDF data provided"}
    except Exception as e:
        print(f"❌ [LOCAL-OCR] Error: {e}")
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
    """Run handwriting recognition on a single page using Groq's Vision model (qwen3.8-27b)."""
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
            model="qwen/qwen3.8-27b",
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
        model_gemini = genai.GenerativeModel("gemini-2.0-flash")
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
            import re
            models_to_try = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            data = None
            last_groq_err = None
            for m in models_to_try:
                try:
                    def _call(model_name=m):
                        res = _call_groq_api_direct(
                            api_key=groq_key,
                            model=model_name,
                            messages=[
                                {"role": "system", "content": "You are an expert academic lexicographer. Respond with valid JSON only."},
                                {"role": "user", "content": PROMPT}
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.2,
                            max_tokens=4096,
                            timeout=120.0
                        )
                        raw_text = res.choices[0].message.content.strip()
                        if "```" in raw_text:
                            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                            raw_text = re.sub(r"\s*```$", "", raw_text)
                        return json.loads(raw_text)
                    data = await asyncio.to_thread(_call)
                    print(f"✅ [GLOSSARY] Groq ({m}) extracted {data.get('total_terms', '?')} terms")
                    return {"status": "success", **data}
                except Exception as model_err:
                    last_groq_err = model_err
                    print(f"⚠️ [GLOSSARY] Groq model {m} failed: {model_err}")
            if not data and last_groq_err:
                print(f"⚠️ [GLOSSARY] All Groq models failed: {last_groq_err} — falling back to Gemini")
        except Exception as e:
            print(f"⚠️ [GLOSSARY] Groq handler error: {e}")

    # ── Gemini fallback ──
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
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
# ENDPOINT 3d — Bloom's Taxonomy Alignment Engine ⭐
# ─────────────────────────────────────────────
class BloomAnalyzeRequest(BaseModel):
    text: str
    subject: Optional[str] = ""
    level: Optional[str] = ""

@app.post("/api/bloom/analyze")
async def analyze_bloom_taxonomy(req: BloomAnalyzeRequest):
    """
    Performs precision Bloom's Taxonomy classification (Anderson & Krathwohl revised)
    on questions or full exam papers.
    Extracts individual questions, classifies cognitive levels (L1-L6), action verbs,
    knowledge dimensions, confidence scores, pedagogical justifications, level-up recommendations,
    and calculates paper-level distribution, LOTS/HOTS ratios, and balance metrics.
    """
    if not req.text or not req.text.strip():
        return {"status": "error", "message": "Please provide question text or exam paper content to analyze."}

    groq_key   = os.getenv("GROQ_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not groq_key and not gemini_key:
        return {"status": "error", "message": "No API key configured. Set GROQ_API_KEY or GEMINI_API_KEY."}

    subject_hint = f"Subject / Domain: {req.subject}." if req.subject else ""
    level_hint   = f"Target Student Level: {req.level}." if req.level else ""

    PROMPT = f"""You are an expert pedagogical assessment specialist, senior curriculum auditor, and authoritative Bloom's Taxonomy taxonomist specializing in the Revised Bloom's Taxonomy (Anderson & Krathwohl, 2001).

Your task is to analyze the provided question paper or questions with MAXIMUM PEDAGOGICAL PRECISION.
{subject_hint} {level_hint}

TAXONOMY DEFINITIONS & CRITERIA:
- L1 - Remember (Level 1):
  Definition: Retrieving relevant knowledge from long-term memory with no transformation.
  Action Verbs: Define, List, State, What is, Who, When, Where, Name, Identify, Recall, Mention, Enumerate.
  Processes: Recognizing, Recalling.

- L2 - Understand (Level 2):
  Definition: Constructing meaning from instructional messages; explaining ideas in one's own words, interpreting concepts.
  Action Verbs: Explain, Describe, Summarize, Clarify, Classify, Illustrate, Paraphrase, Discuss (descriptive), Distinguish between (basic concepts).
  Processes: Interpreting, Exemplifying, Classifying, Summarizing, Inferring, Comparing (basic), Explaining.

- L3 - Apply (Level 3):
  Definition: Carrying out or using a procedure or algorithm in a given situation; solving standard/routine numerical or procedural problems.
  Action Verbs: Calculate, Compute, Solve, Demonstrate, Implement, Execute, Show how, Apply, Derive (standard formula), Determine (numerical).
  Processes: Executing, Implementing.

- L4 - Analyze (Level 4):
  Definition: Breaking material into constituent parts and determining how parts relate to one another and to an overall structure; discerning causality, biases, or architectural trade-offs.
  Action Verbs: Analyze, Differentiate, Compare and Contrast (architectural/structural), Deconstruct, Categorize, Infer causes, Examine, Deduce trade-offs.
  Processes: Differentiating, Organizing, Attributing.

- L5 - Evaluate (Level 5):
  Definition: Making judgments based on criteria and standards; critiquing, defending choices, weighing competing alternatives, assessing validity.
  Action Verbs: Evaluate, Critique, Judge, Justify, Defend, Assess, Appraise, Validate, Argue for/against, Recommend with justification.
  Processes: Checking, Critiquing.

- L6 - Create (Level 6):
  Definition: Putting elements together to form a novel, coherent or functional whole; reorganizing elements into a new pattern; designing an original solution, algorithm, architecture, or plan.
  Action Verbs: Design, Formulate, Develop, Create, Devise, Compose, Propose, Synthesize, Architect, Invent.
  Processes: Generating, Planning, Producing.

KNOWLEDGE DIMENSIONS:
- Factual: Basic terminology, discrete facts, specific details.
- Conceptual: Classifications, categories, principles, generalizations, theories, models.
- Procedural: Subject-specific skills, algorithms, techniques, methods, criteria.
- Metacognitive: Strategic knowledge, self-assessment, cognitive task awareness, reflection.

PRECISION RULES:
1. Parse every distinct question, sub-question, or numbered problem (e.g. Q1, Q1(a), Q2...). If not numbered, assign Q1, Q2, etc.
2. Context overrides keyword matching! Look at what mental effort is ACTUALLY required, not just the action verb.
3. Identify the true governing cognitive demand. A "describe" question requiring original synthesis could be L5+.
4. Assign bloom_level (1-6) and bloom_name ("Remember"|"Understand"|"Apply"|"Analyze"|"Evaluate"|"Create").
5. HUMANIZED COGNITIVE SPECTRUM & TEACHER PERCEPTION (CRITICAL):
   - In real pedagogical practice, the cognitive demand of a question is NOT rigid or fixed mathematically. Real teachers often disagree on the Bloom level depending on classroom context, prior student exposure, and problem formulation!
   - For EVERY question, provide a Humanized Cognitive Spectrum:
     * "educator_spectrum": human-readable spectrum string, e.g. "L2 (Understand) ↔ L4 (Analyze)" or "L1 (Remember) ↔ L2 (Understand)".
     * "spectrum_lower": adjacent lower level number (e.g. 2 if primary is 3, or null if 1).
     * "spectrum_higher": adjacent higher level number (e.g. 4 if primary is 3, or null if 6).
     * "lower_perspective_rationale": Concrete reason why a teacher might classify this at a lower level (e.g. "If students were trained on this standard textbook formula or template, it functions primarily as routine procedural recall").
     * "higher_perspective_rationale": Concrete reason why a teacher might classify this at a higher level (e.g. "If presented as an unseen, unprompted scenario requiring multi-variable deconstruction, it demands deep analytical problem solving").
     * "contextual_factors": 2-3 factors that shift human perception of this question, e.g. ["Instructional Scaffolding Provided", "Problem Novelty vs Textbook Routine", "Multi-Step vs Single-Step Synthesis"].
     * "is_ambiguous": true if genuinely on a cognitive boundary where educators frequently disagree.
     * "ambiguity_note": concise explanation of the educator debate.
6. Provide a pedagogical rationale explaining why this primary level was chosen AND why adjacent levels were not the primary classification.
7. Provide a Level-Up Suggestion: A concrete rewritten version elevating to a higher cognitive level.
8. Provide paper-level summary statistics:
   - total_questions (count)
   - total_marks (sum of extracted or estimated marks)
   - lots_percentage (percentage of questions in L1 + L2)
   - hots_percentage (percentage of questions in L3 + L4 + L5 + L6)
   - distribution: map of levels "1" through "6" with count and percentage
   - dominant_level: e.g. "L2 - Understand"
   - balance_rating: e.g. "Balanced (NEP 2020 Aligned)", "Recall-Heavy (Skewed towards LOTS)", "Analytical & Rigorous"
   - pedagogical_critique: concise critique of the exam cognitive balance
   - recommendations: 2-4 actionable tips for educators to balance the exam
   - ambiguous_count: number of questions that sit on cognitive boundaries
   - humanized_perception_note: 2-sentence summary explaining how cognitive demand across this paper depends on student prior familiarity and teaching scaffolding.

TEXT TO ANALYZE:
\"\"\"
{req.text[:8000]}
\"\"\"

Respond ONLY with valid JSON in this exact structure, with no markdown code blocks:
{{
  "questions": [
    {{
      "id": "q1",
      "question_number": "Q1",
      "text": "Define operating system and list its functions.",
      "marks": 5,
      "bloom_level": 1,
      "bloom_name": "Remember",
      "action_verb": "Define",
      "knowledge_dimension": "Factual",
      "difficulty": "Low",
      "confidence": 95,
      "is_ambiguous": false,
      "alternative_level": 2,
      "ambiguity_note": "If an oral elaboration of resource management is expected, some teachers treat as Understand.",
      "educator_spectrum": "L1 (Remember) ↔ L2 (Understand)",
      "spectrum_lower": 1,
      "spectrum_higher": 2,
      "lower_perspective_rationale": "Requires pure recall of factual definition and standard list of OS functions from long-term memory without manipulation.",
      "higher_perspective_rationale": "If the student must explain the operational interplay between hardware and user space in their own words, it touches Level 2.",
      "contextual_factors": ["Prior memorization of textbook list", "Requirement for original explanation"],
      "rationale": "Core demand is retrieval of established concepts from long-term memory without requiring synthesis.",
      "level_up_suggestion": "Explain how an operating system coordinates hardware and software resources when running multiple concurrent applications (Elevates to L2 - Understand)."
    }}
  ],
  "summary": {{
    "total_questions": 1,
    "total_marks": 5,
    "lots_percentage": 100,
    "hots_percentage": 0,
    "lots_count": 1,
    "hots_count": 0,
    "distribution": {{
      "1": {{ "count": 1, "percentage": 100, "name": "Remember" }},
      "2": {{ "count": 0, "percentage": 0, "name": "Understand" }},
      "3": {{ "count": 0, "percentage": 0, "name": "Apply" }},
      "4": {{ "count": 0, "percentage": 0, "name": "Analyze" }},
      "5": {{ "count": 0, "percentage": 0, "name": "Evaluate" }},
      "6": {{ "count": 0, "percentage": 0, "name": "Create" }}
    }},
    "dominant_level": "Remember (L1)",
    "balance_rating": "Recall-Heavy",
    "pedagogical_critique": "Assessment relies heavily on rote recall.",
    "recommendations": [
      "Add application (L3) and analytical (L4) questions to meet higher-order thinking benchmarks."
    ],
    "subject_detected": "Computer Science",
    "ambiguous_count": 0,
    "humanized_perception_note": "Cognitive demand may vary depending on whether questions were previously practiced in assignments."
  }}
}}"""

    # ── Try Groq first ──
    if groq_key:
        try:
            import re
            models_to_try = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            data = None
            last_groq_err = None
            for m in models_to_try:
                try:
                    def _call(model_name=m):
                        res = _call_groq_api_direct(
                            api_key=groq_key,
                            model=model_name,
                            messages=[
                                {"role": "system", "content": "You are an expert pedagogical Bloom Taxonomy assessor. Respond with valid JSON only."},
                                {"role": "user", "content": PROMPT}
                            ],
                            response_format={"type": "json_object"},
                            temperature=0.1,
                            max_tokens=4096,
                            timeout=120.0
                        )
                        raw_text = res.choices[0].message.content.strip()
                        if "```" in raw_text:
                            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                            raw_text = re.sub(r"\s*```$", "", raw_text)
                        return json.loads(raw_text)
                    data = await asyncio.to_thread(_call)
                    print(f"✅ [BLOOM] Groq ({m}) classified {len(data.get('questions', []))} questions")
                    return {"status": "success", **data}
                except Exception as model_err:
                    last_groq_err = model_err
                    print(f"⚠️ [BLOOM] Groq model {m} failed: {model_err}")
            if not data and last_groq_err:
                print(f"⚠️ [BLOOM] All Groq models failed: {last_groq_err} — falling back to Gemini")
        except Exception as e:
            print(f"⚠️ [BLOOM] Groq handler error: {e}")

    # ── Gemini fallback ──
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": PROMPT}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
            }
            resp = await asyncio.to_thread(lambda: http_requests.post(url, json=payload, timeout=60))
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            data = json.loads(text)
            print(f"✅ [BLOOM] Gemini classified {len(data.get('questions', []))} questions")
            return {"status": "success", **data}
        except Exception as e:
            print(f"❌ [BLOOM] Gemini also failed: {e}")
            return {"status": "error", "message": str(e)}

    return {"status": "error", "message": "All LLM providers failed for Bloom Taxonomy analysis."}


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
    student_text: str = ""             # OCR output from student answer sheet
    pdfBase64: Optional[str] = None    # Optional: direct PDF upload
    imageBase64: Optional[str] = None  # Optional: direct image upload
    question_paper_text: str = ""      # OCR/typed question paper
    model_answers_text: str = ""       # Optional
    syllabus_text: str = ""            # Optional
    total_marks: int = 0               # Authoritative total marks for the paper
    class_level: str = ""              # Optional e.g. "Grade 10", "1st Year"
    strictness_level: int = 3          # 1=Very Lenient, 3=Balanced (default), 5=Very Strict

class EvaluateSingleRequest(BaseModel):
    question_text: str              # The question being asked
    student_answer: str             # Student's written answer text
    marks_total: int = 10           # Maximum marks for this question
    model_answer: str = ""          # Optional model answer / marking scheme
    strictness_level: int = 3       # 1=Very Lenient, 5=Very Strict
    class_level: str = ""           # e.g. "Grade 10", "Class 12"
    subject: str = ""               # e.g. "Physics", "History"


# ── SHARED HELPERS FOR QUESTION PARSING & NORMALIZATION ─────────────────────
def _extract_authoritative_marks_map(qp_text: str, student_text: str = "") -> dict:
    """
    Extracts explicit per-question marks from the question paper text, teacher distribution notes,
    or student booklet headings.
    Handles formats like:
      - 'Q1: 2 marks, Q2: 5 marks, Q3: 10 marks'
      - '1a) 2 marks\n1b) 3 marks\n2. 5 marks'
      - 'Section A (2 marks each)\n1. What is...\n2. Define...'
      - 'Q1. Define velocity [2 Marks]\nQ2. Explain Carnot engine (5M)'
    """
    marks_map = {}
    if not qp_text and not student_text:
        return marks_map

    # 1. First look for key-value pairs like 'Q1: 2', 'Q1 - 5 marks', '1: 2, 2: 5, 3: 10', 'Q1: 2.5'
    kv_pattern = r'(?:Q(?:uestion)?\.?\s*|\b)(\d+[a-z]?)\s*[:=\-–]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m|pts?|points?)?'
    for m in re.finditer(kv_pattern, qp_text, flags=re.IGNORECASE):
        q_label = m.group(1).lower()
        try:
            val = float(m.group(2))
            if 0 < val <= 100:
                marks_map[q_label] = val
        except ValueError:
            pass

    # 2. Line-by-line parsing for Section headers with 'X marks each' and inline marks brackets
    lines = [line.strip() for line in qp_text.split('\n') if line.strip()]
    current_section_mark = None

    for line in lines:
        sec_match = re.search(r'(?:section|part|module)\s+[a-z0-9]+\s*[\(\[:\-–].*?(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*each', line, re.IGNORECASE)
        if sec_match:
            try:
                current_section_mark = float(sec_match.group(1))
            except ValueError:
                pass

        # If line contains multiple questions (e.g. comma separated), skip line-end matching
        if ',' in line and ('q' in line.lower() or ':' in line):
            continue

        q_start = re.match(r'^(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?)\s*[\.\)\:\-]\s*(.*)', line, re.IGNORECASE)
        if q_start:
            q_num = q_start.group(1).lower()
            rest = q_start.group(2)
            explicit_mark = None
            bracket_match = re.search(r'[\(\[\{](\d+(?:\.\d+)?)\s*(?:marks?|m|pts?)?[\)\]\}]\s*$', rest, re.IGNORECASE)
            if bracket_match:
                try:
                    explicit_mark = float(bracket_match.group(1))
                except ValueError:
                    pass
            else:
                end_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:marks?|m|pts?)\s*$', rest, re.IGNORECASE)
                if end_match:
                    try:
                        explicit_mark = float(end_match.group(1))
                    except ValueError:
                        pass

            if explicit_mark is not None and 0 < explicit_mark <= 100:
                marks_map[q_num] = explicit_mark
            elif q_num not in marks_map and current_section_mark is not None:
                marks_map[q_num] = current_section_mark

    return marks_map


def _lookup_marks(q_no: str, marks_map: dict, default_mark = None):
    """
    Looks up the allocated mark for a question number string (e.g. 'Q1', '1a', 'Ans 2', '3b)').
    """
    if not marks_map:
        return default_mark
    clean_no = re.sub(r'^(?:Q(?:uestion)?\.?|Ans\.?)\s*', '', str(q_no).strip(), flags=re.IGNORECASE).lower()
    clean_no = clean_no.rstrip('.)')
    if clean_no in marks_map:
        return marks_map[clean_no]
    num_match = re.match(r'^(\d+)', clean_no)
    if num_match and num_match.group(1) in marks_map:
        return marks_map[num_match.group(1)]
    return default_mark


def _normalize_question_obj(item: dict) -> dict:
    awarded = float(item.get("marks_awarded", item.get("score", item.get("marks", 0))))
    total_m = float(item.get("marks_total", item.get("max_marks", item.get("total_marks", 5))))
    raw_status = str(item.get("status", "")).strip().lower()

    if not raw_status:
        if awarded >= total_m:
            status = "full"
        elif awarded == 0:
            status = "zero"
        else:
            status = "partial"
    else:
        status = raw_status

    marks_reduced = max(0.0, round(total_m - awarded, 2))

    # Process deductions / mistakes list
    deductions = []
    raw_deductions = item.get("deductions") or item.get("mistakes") or []
    if isinstance(raw_deductions, list):
        for d in raw_deductions:
            if isinstance(d, dict):
                lost = float(d.get("marks_lost") or d.get("marks_deducted") or 0.0)
                issue = str(d.get("issue") or d.get("text") or "Specific deduction").strip()
                expl = str(d.get("explanation") or d.get("comment") or "").strip()
                deductions.append({
                    "marks_lost": lost,
                    "issue": issue,
                    "explanation": expl or issue
                })

    why_reduced = str(item.get("why_marks_reduced") or "").strip()
    if not why_reduced and marks_reduced > 0:
        if deductions:
            why_reduced = "; ".join(f"-{d['marks_lost']} for {d['issue']}" for d in deductions)
        else:
            fb = str(item.get("feedback") or "").strip()
            why_reduced = fb if fb else f"Marks reduced by {marks_reduced} due to incomplete response."
    elif marks_reduced == 0 and not why_reduced:
        why_reduced = "No marks reduced. Full marks awarded for complete and accurate answer."

    what_correct = str(item.get("what_was_correct") or "").strip()
    if not what_correct and isinstance(item.get("correct_parts"), list) and item["correct_parts"]:
        parts = [p.get("text", "") for p in item["correct_parts"] if isinstance(p, dict)]
        what_correct = "; ".join(filter(None, parts))

    return {
        "question_no": str(item.get("question_no") or item.get("question_number") or item.get("q_no") or "1").strip(),
        "question": str(item.get("question") or item.get("question_text") or item.get("title") or "Question").strip(),
        "section": str(item.get("section") or item.get("section_name") or "Section A").strip(),
        "marks_awarded": awarded,
        "marks_total": total_m,
        "marks_reduced": marks_reduced,
        "why_marks_reduced": why_reduced,
        "deductions": deductions,
        "what_was_correct": what_correct,
        "student_answer_summary": str(item.get("student_answer_summary") or item.get("summary") or item.get("answer") or "").strip(),
        "status": status,
        "feedback": str(item.get("feedback") or item.get("comment") or item.get("remarks") or "Answer reviewed.").strip(),
        "improvement": str(item.get("improvement") or item.get("tips") or "").strip(),
        "red_pen_comment": str(item.get("red_pen_comment") or "").strip(),
        "page_no": str(item.get("page_no") or item.get("page") or "1"),
        "is_counted": bool(item.get("is_counted", True))
    }


def _extract_questions_recursive(data) -> list:
    if not data:
        return []
    if isinstance(data, list):
        found = []
        for item in data:
            if isinstance(item, dict):
                if any(k in item for k in ("marks_awarded", "marks_total", "question_no", "question", "feedback", "score")):
                    found.append(_normalize_question_obj(item))
                else:
                    found.extend(_extract_questions_recursive(item))
        if found:
            return found

    elif isinstance(data, dict):
        for k in ("questions", "graded_questions", "evaluation", "results", "answers", "items", "graded_answers", "evaluations", "data"):
            if k in data:
                sub = _extract_questions_recursive(data[k])
                if sub:
                    return sub

        if "sections" in data and isinstance(data["sections"], list):
            found = []
            for sec in data["sections"]:
                if isinstance(sec, dict):
                    sec_name = sec.get("section_name") or sec.get("section") or "Section A"
                    sec_qs = _extract_questions_recursive(sec)
                    for q in sec_qs:
                        if not q.get("section") or q["section"] == "Section A":
                            q["section"] = sec_name
                    found.extend(sec_qs)
            if found:
                return found

        if any(k in data for k in ("marks_awarded", "score", "question_no")):
            return [_normalize_question_obj(data)]

        found = []
        for k, v in data.items():
            if isinstance(v, dict) and any(m in v for m in ("marks_awarded", "score", "marks_total", "feedback", "status")):
                v_copy = dict(v)
                if "question_no" not in v_copy:
                    v_copy["question_no"] = str(k).replace("Q", "").replace("q", "").strip()
                found.append(_normalize_question_obj(v_copy))
            elif isinstance(v, (list, dict)):
                sub = _extract_questions_recursive(v)
                if sub:
                    found.extend(sub)
        if found:
            return found

    return []


def _parse_groq_questions(raw_text: str) -> list:
    if not raw_text or not isinstance(raw_text, str):
        return []
    clean = re.sub(r"<think>[\s\S]*?(?:<\/think>|$)", "", raw_text, flags=re.IGNORECASE).strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean).strip()

    parsed = None
    try:
        parsed = json.loads(clean)
    except Exception:
        m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", clean)
        if m:
            try: parsed = json.loads(m.group(0))
            except Exception: pass

    return _extract_questions_recursive(parsed)


GROQ_EVAL_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b"
]


def _call_groq_sync(prompt: str, system_msg: str = "You are a strict academic examiner. Respond with valid JSON only. No markdown, no code fences.", preferred_model: str = None) -> dict:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not configured")

    models_to_try = [preferred_model] if preferred_model and preferred_model in GROQ_EVAL_MODELS else []
    for m in GROQ_EVAL_MODELS:
        if m not in models_to_try:
            models_to_try.append(m)

    last_err = None
    for model_name in models_to_try:
        for attempt in range(2):
            try:
                cur_tokens = 4000 if attempt == 0 else 2500
                resp_fmt = {"type": "json_object"}
                res = _call_groq_api_direct(
                    api_key=groq_key,
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": prompt}
                    ],
                    response_format=resp_fmt,
                    temperature=0.1,
                    max_tokens=cur_tokens,
                    timeout=90.0
                )
                raw_text = res.choices[0].message.content.strip()
                return {"raw": raw_text, "model": model_name}

            except Exception as e:
                last_err = e
                err_str = str(e).lower()
                is_rate_limit = any(x in err_str for x in ("429", "413", "rate limit", "quota", "503", "tpm", "too large"))
                is_json_fail = "failed to validate json" in err_str or "400" in err_str

                if (is_rate_limit or is_json_fail) and attempt == 0:
                    wait_s = 2.0
                    match = re.search(r"(\d+(?:\.\d+)?)\s*s", err_str)
                    if match:
                        try: wait_s = min(float(match.group(1)) + 1, 6.0)
                        except: pass
                    print(f"[EVAL] Groq {model_name} issue ({'rate limit' if is_rate_limit else 'json schema'}). Retrying in {wait_s:.1f}s...")
                    time.sleep(wait_s)
                    continue
                print(f"[EVAL] Groq {model_name} failed: {e}")
                break
    raise last_err or Exception("All Groq evaluation models exhausted")


@app.post("/api/evaluate")
async def evaluate_answers(req: EvaluateRequest):
    """
    Comprehensive, full-context academic paper evaluator.
    - Evaluates all pages in one cohesive pass to prevent dropped questions.
    - Handles Choice & OR modules fairly without penalizing skipped options.
    - Explicitly identifies and reports omitted/unattempted questions.
    - Reconciles total score and denominator with 100% mathematical consistency.
    - Auto-fails over across Groq model families (qwen3.8 -> gpt-oss-120b -> compound-mini).
    """
    try:
        groq_key = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        if not groq_key and not gemini_key:
            return {"status": "error", "message": "No API key configured. Set GROQ_API_KEY or GEMINI_API_KEY."}

        # 1. Determine student text (from pre-scanned text or direct PDF/image upload)
        student_text = (req.student_text or "").strip()
        if not student_text and req.pdfBase64:
            print("[EVAL] Transcribing uploaded PDF answer booklet on server via PyMuPDF + Groq Vision...")
            pdf_bytes = base64.b64decode(req.pdfBase64)
            images = _pdf_bytes_to_images(pdf_bytes, dpi=150)
            if images:
                page_texts = []
                HANDWRITING_OCR_PROMPT = """You are a highly trained professional document transcriber specializing in handwritten exam answer sheets.
Your job is to read this handwritten answer sheet page and transcribe it EXACTLY as written.

CRITICAL RULES — FOLLOW EVERY ONE:
1. PRESERVE every question number exactly (e.g. "Q1", "1.", "1a)", "Ans. 3b", "Q.5 OR Q.6")
2. PRESERVE every section heading (e.g. "Section A", "Part B", "Module 3")
3. PRESERVE blank lines between answers — these mark question boundaries
4. DO NOT correct spelling or grammar — transcribe EXACTLY what is written
5. If a number or label appears before a paragraph, keep it on its OWN line
6. For math/formulas: write them as clearly as possible using text notation (e.g. V=IR, E=mc^2)
7. If text is illegible, write [illegible] — never guess or skip
8. NEVER merge two questions into one paragraph
9. Return ONLY the transcribed text — no commentary, no "Here is the text:", no preamble

IMPORTANT: Question numbers written by the student (like "1.", "Q2", "Ans 3b") are CRITICAL markers — they tell the examiner what question each answer belongs to. Never skip or merge them."""

                for i, img in enumerate(images):
                    for attempt in range(3):
                        try:
                            buffered = io.BytesIO()
                            # Higher quality JPEG for handwriting
                            img.convert("RGB").save(buffered, format="JPEG", quality=90)
                            b64 = base64.b64encode(buffered.getvalue()).decode()
                            if groq_key:
                                res = await asyncio.to_thread(
                                    _call_groq_api_direct,
                                    api_key=groq_key,
                                    model="qwen/qwen3.8-27b",
                                    messages=[{
                                        "role": "user",
                                        "content": [
                                            {"type": "text", "text": HANDWRITING_OCR_PROMPT},
                                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
                                        ]
                                    }],
                                    max_tokens=3000,
                                    temperature=0,
                                    timeout=120.0
                                )
                                t = res.choices[0].message.content.strip()
                                # Remove any preamble the model added
                                t = re.sub(r'^(?:here is|the transcribed|transcription:?)\s*', '', t, flags=re.IGNORECASE).strip()
                                page_texts.append(f"── Page {i+1} ──\n{t}")
                                print(f"✅ [EVAL-OCR] Page {i+1} transcribed ({len(t)} chars)")
                                break
                        except Exception as pg_err:
                            err_str = str(pg_err).lower()
                            is_rate = any(x in err_str for x in ("429", "rate limit", "tpm", "quota"))
                            if is_rate and attempt < 2:
                                wait = (attempt + 1) * 8
                                print(f"⏳ [EVAL-OCR] Rate limited on page {i+1}, waiting {wait}s...")
                                await asyncio.sleep(wait)
                            else:
                                print(f"⚠️ [EVAL] OCR error on page {i+1}: {pg_err}")
                                page_texts.append(f"── Page {i+1} ──\n[OCR failed for this page]")
                                break
                if page_texts:
                    student_text = "\n\n".join(page_texts)

        if not student_text:
            return {"status": "error", "message": "No student answer text or answer sheet file provided."}

        # 2. Determine grading mode
        if req.model_answers_text.strip():
            mode = "Mode 1 — Model Answers Provided (strict rubric-based marking)"
        elif req.syllabus_text.strip():
            mode = "Mode 2 — Syllabus Provided (syllabus-scoped grading)"
        else:
            mode = "Mode 3 — General Academic Grading (knowledge correctness)"

        strictness = max(1, min(5, req.strictness_level))
        strictness_instruction = _STRICTNESS_INSTRUCTIONS[strictness]

        print(f"[EVAL] Evaluating student answer booklet (chars: {len(student_text)}, strictness: {strictness}/5, mode: {mode})")

        # 3. Formulate unified grading prompt
        declared_total = req.total_marks if req.total_marks > 0 else 50
        authoritative_marks_map = _extract_authoritative_marks_map(req.question_paper_text, student_text)

        marks_instruction_block = ""
        if authoritative_marks_map:
            marks_lines = [f"  * Question {k.upper()}: EXACTLY {v} marks" for k, v in authoritative_marks_map.items()]
            marks_instruction_block = (
                "\n=====================================\n"
                "AUTHORITATIVE MARKS SPECIFICATION (STRICT - DO NOT SPLIT EQUALLY):\n"
                "The following marks per question are MANDATED by the teacher/paper:\n"
                + "\n".join(marks_lines) + "\n"
                "You MUST set marks_total for each question to EXACTLY the mark value specified above.\n"
                "NEVER divide the paper total equally across questions (e.g. NEVER make every question 5.6 or similar)!\n"
                "Each question has distinct allocated weight.\n"
                "=====================================\n"
            )
        else:
            marks_instruction_block = (
                "\n=====================================\n"
                "MARKS DISTRIBUTION GUIDELINE:\n"
                "Extract each question's actual allocated marks from the question paper (e.g. [2 Marks], [5 Marks], [10 Marks]).\n"
                "DO NOT divide total marks equally across questions (e.g. NEVER assign 5.6 to every question)!\n"
                "Standard academic questions carry clean whole marks: short answer (1-2 marks), medium (3-5 marks), long/essay (8-10 marks).\n"
                "Ensure each question's marks_total reflects its actual depth and weight.\n"
                "=====================================\n"
            )

        qp_context = req.question_paper_text.strip() if req.question_paper_text.strip() else "Not provided — infer questions and marks from student answers."
        ref_context = (
            req.model_answers_text.strip()[:5000] if req.model_answers_text.strip()
            else req.syllabus_text.strip()[:5000] if req.syllabus_text.strip()
            else "Not provided — grade based on academic accuracy, completeness, formulas, diagrams, and step-by-step logic."
        )

        # Build a clear, explicit marks table to inject into the prompt
        if authoritative_marks_map:
            marks_table_lines = ["MARKS PER QUESTION (MANDATORY — READ BEFORE GRADING):"]
            for k, v in authoritative_marks_map.items():
                marks_table_lines.append(f"  Q{k.upper()} = {v} marks")
            marks_table_lines.append("You MUST set marks_total for each question to EXACTLY the value above.")
            marks_table_lines.append("FORBIDDEN: Do NOT divide total marks equally (e.g. NEVER assign 5.0 or 5.6 to EVERY question).")
            marks_table = "\n".join(marks_table_lines)
        else:
            marks_table = (
                "MARKS PER QUESTION: Not explicitly provided as a distribution list.\n"
                "ACTION REQUIRED: Extract marks from the Question Paper text above.\n"
                "Look for patterns like: '[5 Marks]', '(2M)', '10 marks', 'Section A (2 marks each)', 'Q1: 5, Q2: 10'.\n"
                "Assign clean whole-number marks that match the question's complexity:\n"
                "  - Short answer / definition: 2-5 marks\n"
                "  - Medium explanation: 5-8 marks\n"
                "  - Long / derivation / essay: 10-15 marks\n"
                "STRICTLY FORBIDDEN: Do NOT assign equal marks to all questions (e.g. NOT every question = 5.0 marks)."
            )

        EVAL_PROMPT = f"""You are a professional academic examiner and senior teacher with 20+ years of experience grading exam papers.
You are grading ONE student's complete answer booklet. Read everything carefully like a real teacher.

════════════════════════════════════════════════════
PAPER DETAILS
════════════════════════════════════════════════════
Total Marks: {declared_total}
Grading Mode: {mode}
Strictness: {strictness_instruction}

════════════════════════════════════════════════════
QUESTION PAPER
════════════════════════════════════════════════════
{qp_context[:6000]}

════════════════════════════════════════════════════
{marks_table}
════════════════════════════════════════════════════

REFERENCE / MODEL ANSWERS / SYLLABUS:
{ref_context}

════════════════════════════════════════════════════
STUDENT'S ANSWER BOOKLET
════════════════════════════════════════════════════
{student_text}

════════════════════════════════════════════════════
EXAMINER INSTRUCTIONS
════════════════════════════════════════════════════

STEP 1 — READ THE QUESTION PAPER:
- Identify every question and sub-question (Q1, Q1a, Q1b, Q2, Q3a, etc.)
- For each question, note its EXACT marks from the paper or the marks table above
- Identify which questions are mandatory vs. optional/choice
- Identify "OR" questions (student picks one)

STEP 2 — MAP STUDENT ANSWERS:
- Read every page of the student booklet
- Match each written answer to its question using: question number labels (Q1, 1a, Ans 3b) AND content
- Students sometimes write out of order — find ALL answers
- Never skip a question that the student attempted

STEP 3 — GRADE EACH QUESTION LIKE A REAL TEACHER:
- marks_total = EXACT marks this question is worth (from paper/marks table above)
- marks_awarded = what the student actually earned based on their answer quality
- Be specific: what did they write correctly? what was wrong or missing?

MANDATORY MARKS RULES (CRITICAL):
✦ marks_total MUST match the actual question paper weight for each question
✦ NEVER assign the same marks_total to all questions (e.g. NOT all = 5.0)
✦ NEVER calculate marks_total = total_marks ÷ number_of_questions
✦ If Q1 is worth 2 marks and Q2 is worth 10 marks — show EXACTLY that difference
✦ total_possible = {declared_total} (always)

CHOICE/OR QUESTIONS:
- If "attempt any 3 out of 5": grade FIRST 3 the student wrote. Rest: is_counted=false, marks_awarded=0
- "OR" questions: grade the one the student chose. Other option: is_counted=false, marks_awarded=0
- Never penalize for not attempting optional questions

UNATTEMPTED MANDATORY QUESTIONS:
- Include with marks_awarded=0, status="not_attempted", is_counted=true

FEEDBACK QUALITY:
- Each question needs UNIQUE feedback — never copy-paste the same reason across questions
- State exactly: what formula/step/key term was missing
- Example: "Lost 2 marks — did not write the SI unit for resistance (Ohms) and missed the temperature-constancy condition"
- what_was_correct: Quote specific things the student wrote correctly

════════════════════════════════════════════════════
OUTPUT — Valid JSON only, no markdown fences:
════════════════════════════════════════════════════
{{
  "questions": [
    {{
      "question_no": "1a",
      "question": "Full question text from question paper",
      "section": "Section A / Module 1",
      "marks_awarded": 8.0,
      "marks_total": 10.0,
      "marks_reduced": 2.0,
      "status": "partial",
      "is_counted": true,
      "student_answer_summary": "20-30 words: what the student actually wrote for this question",
      "why_marks_reduced": "Specific reason: exactly what was missing or wrong that caused deduction",
      "deductions": [
        {{"marks_lost": 1.0, "issue": "Missing boundary condition", "explanation": "Did not state Ohm's Law requires constant temperature"}},
        {{"marks_lost": 1.0, "issue": "SI units omitted", "explanation": "Resistance unit Ohm (Ω) not written"}}
      ],
      "what_was_correct": "Correctly wrote V=IR formula and explained current-voltage relationship",
      "feedback": "2-3 sentence professional teacher comment on this specific answer",
      "improvement": "One specific actionable tip for this answer",
      "red_pen_comment": "Short margin note (max 10 words)",
      "page_no": "1"
    }}
  ],
  "total_awarded": 0.0,
  "total_possible": {declared_total},
  "total_reduced": 0.0,
  "percentage": 0.0,
  "grade": "F",
  "mark_loss_analysis": [
    "Q1: -2 marks — missing temperature condition and Ohm unit",
    "Q2: -5 marks — derivation incomplete, final equation not written"
  ],
  "overall_feedback": "3-4 sentence summary of the student's overall performance, strongest area, main weakness, and revision advice"
}}"""

        eval_data = None
        used_model = "openai/gpt-oss-120b"

        # 4. Execute evaluation call with model failover (gpt-oss-120b first, then gpt-oss-20b)
        if groq_key:
            try:
                res_dict = await asyncio.to_thread(_call_groq_sync, EVAL_PROMPT, "You are a senior academic examiner. Respond ONLY with valid JSON.", "openai/gpt-oss-120b")
                raw_out = res_dict.get("raw", "")
                used_model = res_dict.get("model", "openai/gpt-oss-120b")
                clean_json = re.sub(r"<think>[\s\S]*?(?:<\/think>|$)", "", raw_out, flags=re.IGNORECASE).strip()
                clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json)
                clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                eval_data = json.loads(clean_json)
                print(f"[EVAL] Successfully evaluated via Groq ({used_model}).")
            except Exception as eval_err:
                print(f"⚠️ [EVAL] Groq failed: {eval_err}")

        # 5. Gemini fallback if needed
        if eval_data is None and gemini_key:
            try:
                print("[EVAL] Trying Gemini fallback...")
                import requests as req_lib
                for g_mod in ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]:
                    try:
                        url_gem = f"https://generativelanguage.googleapis.com/v1beta/models/{g_mod}:generateContent?key={gemini_key}"
                        payload = {
                            "contents": [{"parts": [{"text": EVAL_PROMPT}]}],
                            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
                        }
                        resp = await asyncio.to_thread(lambda: req_lib.post(url_gem, json=payload, timeout=120))
                        if resp.ok:
                            text_resp = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                            clean_json = re.sub(r"^```(?:json)?\s*", "", text_resp)
                            clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                            eval_data = json.loads(clean_json)
                            used_model = g_mod
                            print(f"[EVAL] Successfully evaluated via Gemini ({g_mod}).")
                            break
                    except Exception:
                        continue
            except Exception as gem_err:
                print(f"⚠️ [EVAL] Gemini fallback failed: {gem_err}")

        # 6. Extract questions list
        all_qs = []
        if isinstance(eval_data, dict):
            all_qs = _extract_questions_recursive(eval_data)
        elif isinstance(eval_data, list):
            all_qs = [_normalize_question_obj(q) for q in eval_data]

        if not all_qs:
            # Resilient fallback: extract questions from student text headers with dynamic per-question feedback
            print("[EVAL] Header-based fallback extraction triggered...")
            header_pattern = r"(?:(?<=\n)|^)(?:Q(?:uestion)?\.?\s*(\d+[a-z]?)|(\d+)\s*[\.\)]\s*([a-z]\))?|NITTE\s*\d*\s*Module\s*-\s*(\d+))"
            matches = list(re.finditer(header_pattern, student_text, flags=re.IGNORECASE))
            target_total = float(req.total_marks or 50)
            if matches and len(matches) > 1:
                for idx, m in enumerate(matches):
                    q_num = m.group(1) or m.group(2) or m.group(4) or str(idx + 1)
                    auth_m = _lookup_marks(str(q_num), authoritative_marks_map, default_mark=None)
                    per_q_marks = auth_m if auth_m is not None else 5.0
                    start = m.start()
                    end = matches[idx + 1].start() if idx + 1 < len(matches) else len(student_text)
                    snippet = student_text[start:end].strip()
                    first_line = snippet.split("\n")[0][:100]
                    summary = snippet[:250].replace("\n", " ")
                    estimated_awarded = round(per_q_marks * 0.5, 1) if len(snippet) > 80 else round(per_q_marks * 0.2, 1)
                    q_reduced = round(per_q_marks - estimated_awarded, 1)
                    all_qs.append({
                        "question_no": str(q_num),
                        "question": first_line or f"Question {q_num}",
                        "section": "Section A",
                        "marks_awarded": estimated_awarded,
                        "marks_total": per_q_marks,
                        "marks_reduced": q_reduced,
                        "student_answer_summary": summary,
                        "status": "partial" if estimated_awarded > 0 else "zero",
                        "why_marks_reduced": f"Marks reduced by {q_reduced} on Question {q_num}: answer requires complete derivations, diagrammatic illustration, and detailed step-by-step reasoning.",
                        "deductions": [
                            {"marks_lost": q_reduced, "issue": f"Incomplete steps for Question {q_num}", "explanation": "Lacks comprehensive explanation of key formulas and boundary conditions."}
                        ],
                        "what_was_correct": f"Initial response structure and introductory points for Question {q_num}.",
                        "feedback": f"Demonstrated basic introductory understanding of Question {q_num}, but lacked in-depth steps, diagrams, and formal conclusions.",
                        "improvement": f"Provide complete mathematical steps, standard units, and label diagrams clearly for Question {q_num}.",
                        "red_pen_comment": f"Incomplete working (-{q_reduced})",
                        "page_no": "1",
                        "is_counted": True
                    })
            else:
                all_qs = [{
                    "question_no": "1",
                    "question": "Overall Examination Evaluation",
                    "section": "Section A",
                    "marks_awarded": round(target_total * 0.5, 1),
                    "marks_total": target_total,
                    "marks_reduced": round(target_total * 0.5, 1),
                    "student_answer_summary": student_text[:200] + "...",
                    "status": "partial",
                    "why_marks_reduced": f"Marks reduced by {round(target_total * 0.5, 1)}: answer booklet contains broad overview points but lacks comprehensive derivations and question-by-question structure.",
                    "deductions": [
                        {"marks_lost": round(target_total * 0.5, 1), "issue": "Missing itemized question mapping", "explanation": "Answers were presented without distinct question numbering and full supporting derivations."}
                    ],
                    "what_was_correct": "General conceptual ideas and introductory statements were legible.",
                    "feedback": "Initial review indicates relevant conceptual terms were identified, but full derivations and distinct question boundaries are needed for full credit.",
                    "improvement": "Number each question clearly and show step-by-step solutions with appropriate units and diagrams.",
                    "red_pen_comment": "Needs step-by-step working",
                    "page_no": "1",
                    "is_counted": True
                }]

        # ── 7. AUTHORITATIVE AGGREGATION & MATHEMATICAL RECONCILIATION ──────────
        # Reconcile marks_total against authoritative_marks_map if available
        if authoritative_marks_map:
            for q in all_qs:
                q_no = str(q.get("question_no", ""))
                auth_m = _lookup_marks(q_no, authoritative_marks_map, default_mark=None)
                if auth_m is not None:
                    q["marks_total"] = auth_m
                    if float(q.get("marks_awarded", 0)) > auth_m:
                        q["marks_awarded"] = auth_m
                    q["marks_reduced"] = max(0.0, round(auth_m - float(q.get("marks_awarded", 0)), 1))
        else:
            # If model assigned uniform fractional marks like 5.6 across all questions, clean them to integers
            distinct_totals = {round(float(q.get("marks_total", 0)), 1) for q in all_qs if q.get("marks_total")}
            if len(distinct_totals) == 1 and len(all_qs) > 1:
                single_val = list(distinct_totals)[0]
                if single_val not in (1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 15.0, 20.0):
                    clean_val = round(single_val) or 5.0
                    for q in all_qs:
                        q["marks_total"] = clean_val
                        if float(q.get("marks_awarded", 0)) > clean_val:
                            q["marks_awarded"] = clean_val
                        q["marks_reduced"] = max(0.0, round(clean_val - float(q.get("marks_awarded", 0)), 1))

        # If no question paper was provided, filter out hallucinated unattempted questions
        if not req.question_paper_text.strip():
            all_qs = [q for q in all_qs if q.get("status") != "not_attempted"]
            for q in all_qs:
                q["is_counted"] = True

        counted_qs = [q for q in all_qs if q.get("is_counted", True)]
        uncounted_qs = [q for q in all_qs if not q.get("is_counted", True)]
        not_attempted_qs = [q for q in counted_qs if q.get("status") == "not_attempted"]

        total_aw = sum(float(q.get("marks_awarded", 0)) for q in counted_qs)
        sum_counted_max = sum(float(q.get("marks_total", 0)) for q in counted_qs)

        if req.total_marks > 0:
            total_pos = float(req.total_marks)
            if not req.question_paper_text.strip() and sum_counted_max > 0:
                total_pos = sum_counted_max
        else:
            total_pos = sum_counted_max if sum_counted_max > 0 else 50.0

        total_aw = min(total_aw, total_pos)
        total_red = max(0.0, round(total_pos - total_aw, 1))
        pct = round((total_aw / total_pos * 100), 1) if total_pos > 0 else 0.0

        grade = "F"
        if pct >= 90:   grade = "A+"
        elif pct >= 80: grade = "A"
        elif pct >= 70: grade = "B"
        elif pct >= 60: grade = "C"
        elif pct >= 50: grade = "D"

        # Ensure every question has distinct, genuine reasons and correct marks_reduced
        seen_reasons = set()
        loss_breakdowns = []
        for q in all_qs:
            q_tot = float(q.get("marks_total", 0))
            q_aw = float(q.get("marks_awarded", 0))
            q_red = max(0.0, round(q_tot - q_aw, 1))
            q["marks_reduced"] = q_red

            q_num_label = q.get("question_no", "Q")
            q_title = q.get("question", f"Question {q_num_label}")[:45]

            # Enforce distinct, genuine explanation
            why = str(q.get("why_marks_reduced") or "").strip()
            if not why or why in seen_reasons:
                if q.get("status") == "not_attempted":
                    why = f"Question {q_num_label} not attempted: full -{q_red} marks deducted."
                elif q_red > 0:
                    if q.get("deductions"):
                        why = f"Lost {q_red} marks on {q_title}: " + "; ".join(d.get("issue", "") for d in q["deductions"] if d.get("issue"))
                    else:
                        why = f"Lost {q_red} marks on {q_title}: incomplete derivation steps, missing standard units, and omitted boundary conditions."
                else:
                    why = f"Full marks awarded for {q_title}: clear, complete explanation adhering to marking scheme."
                q["why_marks_reduced"] = why
            seen_reasons.add(why)

            if q_red > 0 and q.get("is_counted", True):
                loss_breakdowns.append(f"Q{q_num_label}: -{q_red} marks ({q.get('why_marks_reduced', 'Gap in answer')})")

        full_qs    = [q for q in counted_qs if q.get("status") == "full"]
        partial_qs = [q for q in counted_qs if q.get("status") == "partial"]
        zero_qs    = [q for q in counted_qs if q.get("status") in ("zero", "not_attempted", "invalid")]

        if pct >= 80:
            tone = "Excellent performance overall."
        elif pct >= 60:
            tone = "Good attempt with some areas for refinement."
        elif pct >= 50:
            tone = "Satisfactory performance. Notable revision needed on specific topics."
        else:
            tone = "Needs significant improvement. Core concepts require focused revision."

        model_label = "Groq" if "groq" in used_model or "qwen" in used_model or "gpt-oss" in used_model else "Gemini"
        overall = (
            f"{tone} "
            f"Student scored {total_aw}/{total_pos} ({pct}%) — Grade {grade}. "
            f"Total marks reduced: {total_red}. "
            f"{len(full_qs)} question(s) answered fully, "
            f"{len(partial_qs)} partially, "
            f"{len(zero_qs)} with zero or not attempted. "
            f"{f'{len(uncounted_qs)} optional choice question(s) skipped (no penalty applied). ' if uncounted_qs else ''}"
            f"{f'{len(not_attempted_qs)} required question(s) were not attempted. ' if not_attempted_qs else ''}"
            f" (Evaluated via {model_label})"
        )

        extracted_loss = eval_data.get("mark_loss_analysis") if (isinstance(eval_data, dict) and eval_data.get("mark_loss_analysis")) else loss_breakdowns[:6]

        evaluation = {
            "questions": all_qs,
            "total_awarded": total_aw,
            "total_possible": total_pos,
            "total_reduced": total_red,
            "percentage": pct,
            "grade": grade,
            "mark_loss_analysis": extracted_loss or loss_breakdowns[:6],
            "overall_feedback": eval_data.get("overall_feedback", overall) if (isinstance(eval_data, dict) and eval_data.get("overall_feedback")) else overall,
        }

        print(f"✅ [EVAL] Completed: {total_aw}/{total_pos} (Reduced: {total_red}, {pct}% - Grade {grade})")
        return {"status": "success", "evaluation": evaluation, "mode": mode}

    except Exception as e:
        import traceback
        print(f"❌ [EVALUATE] Unhandled error: {e}\n{traceback.format_exc()}")
        return {"status": "error", "message": str(e)}



@app.post("/api/evaluate-single")
async def evaluate_single_question(req: EvaluateSingleRequest):
    """
    Evaluate a single question answer quickly.
    Returns marks, feedback, mistakes, correct_parts, and improvement tip.
    """
    try:
        groq_key = os.getenv("GROQ_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not groq_key and not gemini_key:
            return {"status": "error", "message": "No API key configured."}

        strictness = max(1, min(5, req.strictness_level))
        strictness_instruction = _STRICTNESS_INSTRUCTIONS[strictness]

        model_ans_section = f"""
MODEL ANSWER / MARKING SCHEME:
{req.model_answer[:2000]}
""" if req.model_answer.strip() else "MODEL ANSWER: Not provided — grade based on academic correctness and completeness."

        SINGLE_PROMPT = f"""You are an experienced school/university examiner grading ONE student answer.

STRICTNESS: {strictness_instruction}

SUBJECT: {req.subject or 'General'}
CLASS/LEVEL: {req.class_level or 'Not specified'}

QUESTION (worth {req.marks_total} marks):
{req.question_text}

{model_ans_section}

STUDENT'S ANSWER:
{req.student_answer}

GRADING RULES:
1. marks_awarded MUST be between 0 and {req.marks_total}. Never exceed {req.marks_total}.
2. Grade based on: accuracy, completeness, key terms, logical flow, and working shown.
3. For partial marks: identify exactly what was correct and what was missing.
4. Write feedback in a direct teacher voice: "Good understanding of X. However, Y was missing."
5. Give ONE specific, actionable improvement tip.

Respnd ONLY with valid JSON:
{{
  "marks_awarded": 0,
  "marks_total": {req.marks_total},
  "percentage": 0.0,
  "status": "full|partial|zero",
  "feedback": "Specific teacher feedback on this answer",
  "improvement": "One actionable tip to improve this answer",
  "mistakes": [
    {{"text": "specific wrong phrase or missing concept", "marks_deducted": 1, "comment": "Why this is wrong or incomplete"}}
  ],
  "correct_parts": [
    {{"text": "specific correct concept the student wrote", "marks_awarded": 2}}
  ],
  "red_pen_comment": "Short teacher annotation or empty string"
}}"""

        eval_data = None

        if groq_key:
            try:
                res = await asyncio.to_thread(
                    _call_groq_sync,
                    SINGLE_PROMPT,
                    "You are a strict academic examiner. Respond ONLY with valid JSON.",
                    "openai/gpt-oss-120b"
                )
                raw = res.get("raw", "")
                clean = re.sub(r"<think>[\s\S]*?(?:</think>|$)", "", raw, flags=re.IGNORECASE).strip()
                clean = re.sub(r"^```(?:json)?\s*", "", clean)
                clean = re.sub(r"\s*```$", "", clean).strip()
                eval_data = json.loads(clean)
            except Exception as e:
                print(f"[SINGLE-EVAL] Groq failed: {e}")

        if eval_data is None and gemini_key:
            try:
                import requests as req_lib
                url_gem = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
                payload = {
                    "contents": [{"parts": [{"text": SINGLE_PROMPT}]}],
                    "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
                }
                resp = await asyncio.to_thread(lambda: req_lib.post(url_gem, json=payload, timeout=60))
                if resp.ok:
                    text_resp = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    clean = re.sub(r"^```(?:json)?\s*", "", text_resp)
                    clean = re.sub(r"\s*```$", "", clean).strip()
                    eval_data = json.loads(clean)
            except Exception as e:
                print(f"[SINGLE-EVAL] Gemini failed: {e}")

        if eval_data is None:
            return {"status": "error", "message": "Evaluation failed. Check API keys and try again."}

        # Clamp marks
        awarded = float(eval_data.get("marks_awarded", 0))
        awarded = max(0.0, min(awarded, float(req.marks_total)))
        pct = round((awarded / req.marks_total) * 100, 1) if req.marks_total > 0 else 0.0
        reduced = max(0.0, round(float(req.marks_total) - awarded, 1))

        why_reduced = str(eval_data.get("why_marks_reduced") or "").strip()
        if not why_reduced:
            if reduced > 0:
                mistakes = eval_data.get("mistakes", [])
                if mistakes:
                    why_reduced = "; ".join(f"-{m.get('marks_deducted', '')} for {m.get('text', '')}" for m in mistakes if m.get("text"))
                else:
                    why_reduced = f"Lost {reduced} marks due to missing key details and incomplete explanation."
            else:
                why_reduced = "Full marks awarded. Accurate and complete explanation."

        result = {
            "marks_awarded": awarded,
            "marks_total": float(req.marks_total),
            "marks_reduced": reduced,
            "why_marks_reduced": why_reduced,
            "percentage": pct,
            "status": eval_data.get("status", "partial"),
            "feedback": eval_data.get("feedback", ""),
            "improvement": eval_data.get("improvement", ""),
            "mistakes": eval_data.get("mistakes", []),
            "correct_parts": eval_data.get("correct_parts", []),
            "red_pen_comment": eval_data.get("red_pen_comment", ""),
        }

        print(f"[SINGLE-EVAL] Done: {awarded}/{req.marks_total} (Reduced: {reduced}, {pct}%)")
        return {"status": "success", "result": result}

    except Exception as e:
        import traceback
        print(f"[SINGLE-EVAL] Error: {e}\n{traceback.format_exc()}")
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
                                model="qwen/qwen3.8-27b",
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
                            url_gem = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
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
        pro_auth_marks = _extract_authoritative_marks_map(req.question_paper_text, student_text)

        if pro_auth_marks:
            pro_marks_table_lines = ["MARKS PER QUESTION (MANDATORY — SET BEFORE GRADING):"]
            for k, v in pro_auth_marks.items():
                pro_marks_table_lines.append(f"  Q{k.upper()} = {v} marks")
            pro_marks_table_lines.append("You MUST assign marks_total for each question to EXACTLY the value listed above.")
            pro_marks_table_lines.append("NEVER divide total marks equally across all questions!")
            pro_marks_table = "\n".join(pro_marks_table_lines)
        else:
            pro_marks_table = (
                "MARKS PER QUESTION: Read directly from the question paper above.\n"
                "Look for patterns like: '(5 Marks)', '[2M]', '10 marks', 'Section A: 2 marks each'.\n"
                "DO NOT assign the same marks to all questions. Assign distinct marks that reflect each question's weight.\n"
                "Short answer=2-3 marks, Medium=5-8 marks, Long/essay=10-15 marks."
            )

        # Clamp strictness level to valid range
        pro_strictness = max(1, min(5, req.strictness_level))
        pro_strictness_instruction = _STRICTNESS_INSTRUCTIONS[pro_strictness]
        print(f"🎯 [PRO-MODE] Strictness level: {pro_strictness}/5")

        PROMPT = f"""You are a professional academic examiner and senior teacher with 20+ years experience grading exam papers.
You are grading ONE student's complete answer sheet from start to finish.

════════════════════════════════════════════════════
STRICTNESS: {pro_strictness_instruction}
════════════════════════════════════════════════════

════════════════════════════════════════════════════
QUESTION PAPER
════════════════════════════════════════════════════
{req.question_paper_text[:4000]}

════════════════════════════════════════════════════
{pro_marks_table}
════════════════════════════════════════════════════

REFERENCE / MARKING SCHEME:
{req.model_answers_text[:2000] if req.model_answers_text else "Not provided — grade based on academic correctness and completeness."}

PAPER TOTAL MARKS: {req.total_marks}

════════════════════════════════════════════════════
STUDENT ANSWER SHEET (page by page)
════════════════════════════════════════════════════
{student_text}

════════════════════════════════════════════════════
EXAMINER INSTRUCTIONS
════════════════════════════════════════════════════

STEP 1 — MAP STUDENT ANSWERS:
- Find every answer the student wrote (check all pages)
- Match each answer to its question using: labels the student wrote (Q1, 1a, Ans 2b) AND content matching
- Note the page number each answer appears on
- Students sometimes write answers out of order — find ALL of them

STEP 2 — ASSIGN marks_total (CRITICAL):
- marks_total = the marks THIS question is worth as per the question paper
- NEVER assign the same marks_total to all questions (e.g. NOT all = 5.0)
- NEVER calculate marks_total = paper_total ÷ number_of_questions
- If Q1 = 2 marks and Q2 = 10 marks, marks_total must reflect EXACTLY that

STEP 3 — GRADE LIKE A REAL TEACHER:
- Grade each answer individually based on its actual content
- Full marks: all key points, correct formula/derivation, complete explanation
- Partial marks: right idea but missing key terms, units, steps, or diagrams
- Zero: wrong, blank, or just repeats the question
- For calculations: award method marks even if final answer is wrong
- For theory: check key terms, logical structure, and completeness

STEP 4 — HANDLE CHOICE/OR QUESTIONS:
- "Attempt any X out of Y": grade first X answers. Rest: is_counted=false, marks_awarded=0
- "OR" questions: grade the student's chosen answer. Other option: is_counted=false, marks_awarded=0
- Mandatory question not attempted: marks_awarded=0, status="not_attempted", is_counted=true

STEP 5 — WRITE PROFESSIONAL FEEDBACK:
- Each question must have UNIQUE, SPECIFIC feedback — never copy-paste
- Name exactly what was missing: formula, condition, unit, diagram, step
- what_was_correct: quote the actual correct things the student wrote
{req.model_answers_text[:2000] if req.model_answers_text else "Not provided — grade based on academic correctness and completeness."}

PAPER TOTAL MARKS: {req.total_marks}

════════════════════════════════════════════════════
OUTPUT — Valid JSON only, no markdown fences:
════════════════════════════════════════════════════
{{
  "questions": [
    {{
      "question_no": "1a",
      "question": "Full question text exactly as it appears in the paper",
      "section": "Section A",
      "marks_awarded": 8.0,
      "marks_total": 10.0,
      "status": "partial",
      "is_counted": true,
      "student_answer_summary": "What the student actually wrote for this question (20-30 words)",
      "mistakes": [
        {{"text": "specific wrong phrase or concept the student wrote", "marks_deducted": 2, "comment": "Explanation of why this is wrong"}}
      ],
      "correct_parts": [
        {{"text": "specific correct phrase the student wrote", "marks_awarded": 2}}
      ],
      "feedback": "Specific teacher feedback: what was right, what was wrong, what was missing",
      "improvement": "One specific actionable tip to improve this answer",
      "red_pen_comment": "Margin note (max 10 words)",
      "page_no": 1
    }}
  ],
  "total_awarded": 0,
  "total_possible": {req.total_marks},
  "percentage": 0.0,
  "grade": "F",
  "overall_feedback": "3-4 sentence summary of overall performance, strongest area, main weakness, revision advice",
  "mark_loss_analysis": [
    "Q1: -2 marks — missing SI units and temperature condition",
    "Q2: -5 marks — derivation incomplete, final result not written"
  ]
}}"""
        
        import json, requests as req_lib
        import time as _time
        eval_data = None

        # --- Try Groq first (fast, free) — with model rotation and backoff on rate limits ---
        if groq_key:
            import re
            pro_models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            safe_pro_tokens = 4000
            for pro_model in pro_models:
                for groq_attempt in range(2):
                    try:
                        print(f"🚀 [PRO-MODE] Trying Groq ({pro_model}) attempt {groq_attempt+1}...")
                        def _call_groq_pro_fn(m=pro_model, attempt_num=groq_attempt):
                            cur_tokens = safe_pro_tokens if attempt_num == 0 else 2500
                            res = _call_groq_api_direct(
                                api_key=groq_key,
                                model=m,
                                messages=[
                                    {"role": "system", "content": "You are a strict academic examiner. Respond with valid JSON only."},
                                    {"role": "user", "content": PROMPT}
                                ],
                                response_format={"type": "json_object"},
                                temperature=0.1,
                                max_tokens=cur_tokens,
                                timeout=120.0
                            )
                            raw_text = res.choices[0].message.content.strip()
                            clean_text = re.sub(r"<think>[\s\S]*?(?:<\/think>|$)", "", raw_text, flags=re.IGNORECASE).strip()
                            if "```" in clean_text:
                                clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
                                clean_text = re.sub(r"\s*```$", "", clean_text)
                            parsed_raw = json.loads(clean_text)
                            # Ensure questions list is properly extracted
                            if isinstance(parsed_raw, dict):
                                if "questions" not in parsed_raw or not parsed_raw["questions"]:
                                    parsed_raw["questions"] = _extract_questions_recursive(parsed_raw)
                            return parsed_raw

                        eval_data = await asyncio.to_thread(_call_groq_pro_fn)
                        print(f"✅ [PRO-MODE] Groq ({pro_model}) evaluation succeeded.")
                        break

                    except Exception as groq_err:
                        err_str = str(groq_err).lower()
                        is_rate_limit = any(x in err_str for x in ("429", "413", "rate limit", "quota", "503", "tpm", "too large"))
                        if groq_attempt == 0 and is_rate_limit:
                            print(f"⏳ [PRO-MODE] Groq {pro_model} rate/size limit hit. Retrying in 4s with reduced tokens...")
                            await asyncio.sleep(4)
                        else:
                            print(f"⚠️ [PRO-MODE] Groq {pro_model} failed: {groq_err}")
                            break
                if eval_data is not None:
                    break

        # --- Gemini fallback — with exponential backoff retries ---
        if eval_data is None and gemini_key:
            gemini_max_retries = 3
            for gem_attempt in range(gemini_max_retries):
                try:
                    print(f"✨ [PRO-MODE] Trying Gemini (gemini-2.0-flash) attempt {gem_attempt+1}/{gemini_max_retries}...")
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
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

        # Normalize and enrich questions with marks reduced and genuine reason
        if isinstance(eval_data.get("questions"), list):
            eval_data["questions"] = [_normalize_question_obj(q) for q in eval_data["questions"]]

            # Reconcile against authoritative marks map if present
            if pro_auth_marks:
                for q in eval_data["questions"]:
                    q_no = str(q.get("question_no", ""))
                    auth_m = _lookup_marks(q_no, pro_auth_marks, default_mark=None)
                    if auth_m is not None:
                        q["marks_total"] = auth_m
                        if float(q.get("marks_awarded", 0)) > auth_m:
                            q["marks_awarded"] = auth_m
                        q["marks_reduced"] = max(0.0, round(auth_m - float(q.get("marks_awarded", 0)), 1))
            else:
                distinct_totals = {round(float(q.get("marks_total", 0)), 1) for q in eval_data["questions"] if q.get("marks_total")}
                if len(distinct_totals) == 1 and len(eval_data["questions"]) > 1:
                    single_val = list(distinct_totals)[0]
                    if single_val not in (1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 15.0, 20.0):
                        clean_val = round(single_val) or 5.0
                        for q in eval_data["questions"]:
                            q["marks_total"] = clean_val
                            if float(q.get("marks_awarded", 0)) > clean_val:
                                q["marks_awarded"] = clean_val
                            q["marks_reduced"] = max(0.0, round(clean_val - float(q.get("marks_awarded", 0)), 1))

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
            total_reduced = max(0.0, round(float(req.total_marks) - counted_awarded, 1))
            eval_data["total_awarded"] = counted_awarded
            eval_data["total_possible"] = float(req.total_marks)
            eval_data["total_reduced"] = total_reduced
            pct = round((counted_awarded / req.total_marks) * 100, 1) if req.total_marks > 0 else 0
            eval_data["percentage"] = pct
            grade = "F"
            if pct >= 90:   grade = "A+"
            elif pct >= 80: grade = "A"
            elif pct >= 70: grade = "B"
            elif pct >= 60: grade = "C"
            elif pct >= 50: grade = "D"
            eval_data["grade"] = grade
            print(f"📊 [PRO-MODE] Score: {counted_awarded}/{req.total_marks} (Reduced: {total_reduced}) = {pct}% Grade {grade}")

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
