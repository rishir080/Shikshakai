import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "ocr-backend"))
from ocr_engine import OCRComparer
import fitz # PyMuPDF
from PIL import Image
import io

print("Loading test PDF...")
doc = fitz.open("ocr-backend/dummy_test.pdf")
page = doc.load_page(0)
pix = page.get_pixmap(dpi=300)
img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

print("Running OCR Comparer (TrOCR)...")
comparer = OCRComparer()
result = comparer.run_page(img, target_model="trocr")

print("\n--- TrOCR Result ---")
for r in result.get("trocr", []):
    print(r.get("text"))
print("--------------------")
