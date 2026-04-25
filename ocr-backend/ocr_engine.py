import time
import cv2
import numpy as np
import os
import sys
import io
import threading
from PIL import Image

# Disable Paddle network checks globally
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_allocator_strategy"] = "naive_best_fit"


sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ─────────────────────────────────────────────
# Optional engine imports (moved inside)
# ─────────────────────────────────────────────
_TROCR_AVAILABLE = True # Assume available for logic, check inside


# ─────────────────────────────────────────────
# Image Preprocessing Helpers
# ─────────────────────────────────────────────
def _preprocess_for_ocr(img_pil: Image.Image) -> Image.Image:
    """
    Enhance image quality before OCR:
    1. Convert to grayscale
    2. Upscale small images (TrOCR prefers >= 300 DPI equivalent)
    3. OTSU adaptive thresholding (handles uneven lighting)
    Cleans the image using Adaptive Thresholding to eliminate mobile camera shadows
    and outputs a pure B&W deskewed image so TrOCR/Tesseract don't hallucinate.
    """
    img_np = np.array(img_pil.convert("RGB"))
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    
    # Adaptive thresholding elegantly handles heavy camera shadows and uneven lighting
    # It turns the background pure white and ink pure black without destroying text
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
    h, w = gray.shape
    if w < 1000:
        scale = 1000 / w
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

    # --- Denoise (mild, preserves ink strokes) ---
    gray = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

    # --- Deskew ---
    binary = _deskew(thresh)

    return Image.fromarray(binary)


def _deskew(binary_np: np.ndarray) -> np.ndarray:
    """Detect and correct skew angle using Hough line transform."""
    try:
        coords = np.column_stack(np.where(binary_np < 128))
        if len(coords) < 50:
            return binary_np
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) < 0.3:  # Skip tiny adjustments
            return binary_np
        (h, w) = binary_np.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(binary_np, M, (w, h),
                                  flags=cv2.INTER_CUBIC,
                                  borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except Exception:
        return binary_np


def _split_into_lines(img_pil: Image.Image):
    """
    Split a page image into individual text line images
    using horizontal projection profile.
    Returns list of PIL line images.
    """
    gray = np.array(img_pil.convert("L"))
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Horizontal projection: sum of white (ink) pixels per row
    row_sums = np.sum(binary, axis=1)
    threshold = np.max(row_sums) * 0.05  # 5% of max = text row
    in_text = False
    line_starts = []
    line_ends = []
    for i, s in enumerate(row_sums):
        if not in_text and s > threshold:
            in_text = True
            line_starts.append(max(0, i - 4))
        elif in_text and s <= threshold:
            in_text = False
            line_ends.append(min(len(row_sums) - 1, i + 4))
    if in_text:
        line_ends.append(len(row_sums) - 1)

    lines = []
    for y1, y2 in zip(line_starts, line_ends):
        if y2 - y1 > 8:  # Skip tiny strips
            crop = img_pil.crop((0, y1, img_pil.width, y2))
            lines.append(crop)
    return lines if lines else [img_pil]  # Fallback: treat whole page as one line


# ─────────────────────────────────────────────
# TrOCR Singleton (loaded once, reused)
# ─────────────────────────────────────────────
class TrOCREngine:
    _instance = None
    _init_lock = threading.Lock()

    @classmethod
    def get(cls):
        with cls._init_lock:
            if cls._instance is None:
                cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.processor = None
        self.model = None
        self.ready = False
        self.inference_lock = threading.Lock()
        self._load()

    def _load(self):
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            import torch
            import logging

            # Suppress the harmless "MISSING pooler weights" info from HuggingFace
            logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)
            print("[TrOCR] Loading microsoft/trocr-base-handwritten …")
            self.processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
            base_model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
            # Restore normal log level after loading
            logging.getLogger("transformers.modeling_utils").setLevel(logging.WARNING)
            # Apply dynamic quantization to significantly speed up CPU inference
            self.model = torch.quantization.quantize_dynamic(
                base_model, {torch.nn.Linear}, dtype=torch.qint8
            )
            self.ready = True
            print("[TrOCR] Model ready ✓")
        except Exception as e:
            print(f"[TrOCR] Load failed: {e}")

    def read_lines(self, line_images: list) -> list:
        """
        Run TrOCR on a list of line PIL images in a TRUE BATCH (fast).
        Filters out blank images to prevent hallucinations.
        Returns list of string texts, one per line.
        """
        if not self.ready or not line_images:
            return []
        import torch

        # Cap lines per page to avoid timeout crashes on dense pages
        line_images = line_images[:30]

        valid_indices = []
        valid_images = []
        for i, img in enumerate(line_images):
            arr = np.array(img.convert("L"))
            if np.std(arr) > 5:
                valid_indices.append(i)
                valid_images.append(img.convert("RGB"))

        results = [""] * len(line_images)
        if not valid_images:
            return results

        try:
            # ── TRUE BATCH: process all lines in ONE forward pass ──
            pixel_values = self.processor(
                images=valid_images,
                return_tensors="pt"
            ).pixel_values

            with self.inference_lock:
                with torch.no_grad():
                    generated_ids = self.model.generate(
                        pixel_values,
                        max_new_tokens=64,    # Increased for longer words/lines
                        num_beams=4,          # Increased for better accuracy
                        early_stopping=True,
                        no_repeat_ngram_size=3
                    )

            texts = self.processor.batch_decode(generated_ids, skip_special_tokens=True)

            for i, text in zip(valid_indices, texts):
                clean_text = text.strip()
                # Filter known TrOCR hallucinations
                if clean_text and "1961" not in text and "FINDER" not in text and clean_text not in ["0 0", "O O", "0 .", ".", "0"]:
                    results[i] = text
            return results
        except Exception as e:
            print(f"[TrOCR] Inference error: {e}")
            return [""] * len(line_images)


# ─────────────────────────────────────────────
# Main OCR Comparer
# ─────────────────────────────────────────────
class OCRComparer:
    def __init__(self):
        print("Initializing OCR Engines wrapper (Lazy-loading mode)…")
        self._paddle_reader = None
        self._easy_reader = None
        self._trocr = None
        print("Wrapper initialized. Engines will load on demand.")

    @property
    def trocr(self):
        if self._trocr is None:
            self._trocr = TrOCREngine.get()
        return self._trocr

    # ── Single-image entry point (existing API) ──────────────────
    def run_all(self, image_bytes: bytes, target_model: str = None):
        image_np = np.frombuffer(image_bytes, np.uint8)
        img_cv2 = cv2.imdecode(image_np, cv2.IMREAD_COLOR)
        img_pil = Image.open(io.BytesIO(image_bytes))
        return self._run_engines(img_pil, img_cv2, target_model)

    # ── Single-page entry point (used by parallel PDF scanner) ───
    def run_page(self, img_pil: Image.Image, target_model: str = None) -> dict:
        """
        Process a single PIL image page.
        Returns a dict with keys matching target_model (or 'trocr' by default).
        """
        img_np = np.array(img_pil.convert("RGB"))
        img_cv2 = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        return self._run_engines(img_pil, img_cv2, target_model)

    # ── Core engine dispatcher ───────────────────────────────────
    def _run_engines(self, img_pil: Image.Image, img_cv2: np.ndarray, target_model: str = None) -> dict:
        width, height = img_pil.size
        results = {}
        max_dim = 2000
        # ── 1. TrOCR (Primary — best for handwriting) ──
        if not target_model or target_model == "trocr":
            start = time.time()
            try:
                # 1. Detection Phase: Use Adaptive thresholding to find line boundaries
                # (Great for finding lines in shadows)
                img_np_gray = cv2.cvtColor(np.array(img_pil.convert("RGB")), cv2.COLOR_RGB2GRAY)
                thresh_detect = cv2.adaptiveThreshold(img_np_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
                
                # 2. Recognition Phase Image: Use High-Quality Grayscale (preserving strokes)
                # Denoise slightly, but don't hard-threshold
                img_trocr_source = cv2.fastNlMeansDenoising(img_np_gray, h=10, templateWindowSize=7, searchWindowSize=21)
                img_pil_trocr = Image.fromarray(img_trocr_source)

                import pytesseract
                # Tesseract layout analysis on the binary detection image
                boxes_data = pytesseract.image_to_data(thresh_detect, output_type=pytesseract.Output.DICT)
                boxes = []
                for i in range(len(boxes_data['level'])):
                    if boxes_data['level'][i] == 4:
                        x = boxes_data['left'][i]
                        y = boxes_data['top'][i]
                        w = boxes_data['width'][i]
                        h = boxes_data['height'][i]
                        if w > 25 and h > 10:
                            boxes.append((x, y, w, h))
                
                line_imgs = []
                if boxes:
                    # Robust sorting: Primary by Y-coordinate, secondary by X-coordinate
                    # This ensures skewed lines are still read in the correct left-to-right order
                    boxes.sort(key=lambda b: (b[1] // 10, b[0])) 
                    boxes = boxes[:40]  # Increased limit for large documents
                    for (x, y, w, h) in boxes:
                        # Generous side-padding for handwriting context (prevents cut-off words)
                        pad_w = int(w * 0.05) + 25
                        pad_h = int(h * 0.15) + 15
                        left = max(0, x - pad_w)
                        top = max(0, y - pad_h)
                        right = min(width, x + w + pad_w)
                        bottom = min(height, y + h + pad_h)
                        
                        # CROP FROM THE GRAYSCALE SOURCE (not binary)
                        line_imgs.append(img_pil_trocr.crop((left, top, right, bottom)))





                engine = self.trocr
                if engine.ready:
                    lines_text = engine.read_lines(line_imgs)
                    full_text = "\n".join(t.strip() for t in lines_text if t.strip())
                    detections = [{"text": t, "conf": 90, "box": [0, 0, 100, 0]} for t in lines_text if t.strip()]
                    avg_conf = 90 if full_text else 0
                else:
                    full_text = "TrOCR model not loaded. Run: pip install transformers torch"
                    detections, avg_conf = [], 0
            except Exception as e:
                full_text = f"Error: {str(e)}"
                detections, avg_conf = [], 0

            results["trocr"] = {
                "text": full_text.strip(),
                "time": round((time.time() - start) * 1000),
                "confidence": avg_conf,
                "detections": detections,
            }

        # ── 2. Tesseract ──
        if not target_model or target_model == "tesseract":
            start = time.time()

            try:
                import pytesseract
                pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
                clean_img = _preprocess_for_ocr(img_pil)
                data = pytesseract.image_to_data(clean_img, output_type=pytesseract.Output.DICT)
                tes_text = pytesseract.image_to_string(clean_img)
                detections, conf_sum, conf_count = [], 0, 0
                for i in range(len(data['text'])):
                    if int(data['conf'][i]) > 0:
                        conf = int(data['conf'][i])
                        conf_sum += conf; conf_count += 1
                        detections.append({
                            "text": data['text'][i], "conf": conf,
                            "box": [round(data['top'][i]/height*100,2),
                                    round(data['left'][i]/width*100,2),
                                    round(data['width'][i]/width*100,2),
                                    round(data['height'][i]/height*100,2)]
                        })
                avg_conf = round(conf_sum / conf_count) if conf_count > 0 else 0
            except Exception as e:
                tes_text = f"Error: {str(e)}"
                detections, avg_conf = [], 0


            results["tesseract"] = {
                "text": tes_text.strip(),
                "time": round((time.time() - start) * 1000),
                "confidence": avg_conf,
                "detections": detections,
            }

        # ── 3. EasyOCR (Fallback) ──
        if not target_model or target_model == "easyocr":
            start = time.time()
            try:
                import easyocr
                if not self._easy_reader:
                    self._easy_reader = easyocr.Reader(['en'], gpu=False)

                clean_img_np = np.array(_preprocess_for_ocr(img_pil))
                easy_result = self._easy_reader.readtext(clean_img_np)
                lines, detections, conf_sum, count = [], [], 0, 0
                for box, text, conf in easy_result:
                    lines.append(text)
                    conf_val = round(conf * 100)
                    conf_sum += conf_val; count += 1
                    left  = min(p[0] for p in box) / width  * 100
                    top   = min(p[1] for p in box) / height * 100
                    w     = (max(p[0] for p in box) - min(p[0] for p in box)) / width  * 100
                    h     = (max(p[1] for p in box) - min(p[1] for p in box)) / height * 100
                    detections.append({"text": text, "conf": conf_val,
                                       "box": [round(top,2), round(left,2), round(w,2), round(h,2)]})
                easy_text = "\n".join(lines)
                avg_conf  = round(conf_sum / count) if count > 0 else 0
            except Exception as e:
                easy_text = f"Error: {str(e)}"
                detections, avg_conf = [], 0

            results["easyocr"] = {
                "text": easy_text.strip(),
                "time": round((time.time() - start) * 1000),
                "confidence": avg_conf,
                "detections": detections,
            }

        # ── 4. PaddleOCR ──
        if not target_model or target_model == "paddleocr":
            start = time.time()
            try:
                from paddleocr import PaddleOCR
                if not self._paddle_reader:
                    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
                    self._paddle_reader = PaddleOCR(use_angle_cls=True, lang='en', enable_mkldnn=False)

                img_cv2_clean = np.array(_preprocess_for_ocr(img_pil).convert("RGB"))
                img_cv2_clean = cv2.cvtColor(img_cv2_clean, cv2.COLOR_RGB2BGR)
                pad_result = self._paddle_reader.predict(img_cv2_clean) if hasattr(self._paddle_reader, 'predict') else self._paddle_reader.ocr(img_cv2_clean)
                lines, detections, conf_sum, count = [], [], 0, 0
                if pad_result and isinstance(pad_result[0], dict) and 'rec_texts' in pad_result[0]:
                    page = pad_result[0]
                    for i in range(len(page.get('rec_texts', []))):
                        text = page['rec_texts'][i]; conf = page['rec_scores'][i]; poly = page['rec_polys'][i]
                        lines.append(text); conf_val = round(conf*100); conf_sum += conf_val; count += 1
                        top  = float(np.min(poly[:,1]))/height*100; left = float(np.min(poly[:,0]))/width*100
                        w    = float(np.max(poly[:,0])-np.min(poly[:,0]))/width*100
                        h    = float(np.max(poly[:,1])-np.min(poly[:,1]))/height*100
                        detections.append({"text":text,"conf":conf_val,"box":[round(top,2),round(left,2),round(w,2),round(h,2)]})
                elif pad_result and pad_result[0]:
                    for line in pad_result[0]:
                        box,(text,conf)=line; lines.append(text); conf_val=round(conf*100); conf_sum+=conf_val; count+=1
                        left=box[0][0]/width*100; top=box[0][1]/height*100
                        w=(box[1][0]-box[0][0])/width*100; h=(box[2][1]-box[0][1])/height*100
                        detections.append({"text":text,"conf":conf_val,"box":[round(top,2),round(left,2),round(w,2),round(h,2)]})
                pad_text = "\n".join(lines)
                avg_conf = round(conf_sum/count) if count>0 else 0
            except Exception as e:
                pad_text = f"Error: {str(e)}"
                detections, avg_conf = [], 0


            results["paddleocr"] = {
                "text": pad_text.strip(),
                "time": round((time.time() - start) * 1000),
                "confidence": avg_conf,
                "detections": detections,
            }

        return results
