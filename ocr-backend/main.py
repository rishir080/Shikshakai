import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fpdf import FPDF
from dotenv import load_dotenv
from ocr_engine import OCRComparer

load_dotenv()

comparer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global comparer
    comparer = OCRComparer()
    yield

app = FastAPI(title="ShikshakAI OCR Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.post("/api/compare-ocr")
async def compare_ocr(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        results = comparer.run_all(contents)
        return {"status": "success", "results": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

from openai import OpenAI

class EnhanceRequest(BaseModel):
    ocr_text: str

@app.post("/api/enhance-text")
async def enhance_text(req: EnhanceRequest):
    prompt = f"""
    You are an AI tasked with cleaning up noisy OCR text from a handwritten answer sheet.
    Correct spelling and grammar mistakes that look like typical OCR errors.
    Preserve structural meaning. Return only the cleaned up text.

    Raw OCR Text:
    {req.ocr_text}
    """
    try:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"status": "error", "message": "GROQ_API_KEY not set"}
            
        client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000
        )
        return {"status": "success", "enhanced_text": response.choices[0].message.content}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class PDFRequest(BaseModel):
    text: str

@app.post("/api/generate-pdf")
async def generate_pdf(req: PDFRequest):
    try:
        # Initializing PDF with Multi-Page support
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        
        # Use a more stable font or encoding
        pdf.set_font("Arial", size=12)
        
        # Multi-cell handles line wrapping and page breaks automatically
        # Cleaning text of common encoding issues
        safe_text = req.text.encode('latin-1', 'replace').decode('latin-1')
        
        pdf.multi_cell(0, 10, txt=safe_text)
        
        output_path = "output.pdf"
        pdf.output(output_path)
        
        return {"status": "success", "message": "Multi-page PDF Generated", "file": output_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
