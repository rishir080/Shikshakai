import time
import cv2
import numpy as np
import os
import io
from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    from paddleocr import PaddleOCR
except ImportError:
    PaddleOCR = None

class OCRComparer:
    def __init__(self):
        print("Initializing OCR Engines wrapper...")
        self._paddle_reader = None
        print("Wrapper initialized. Heavy models will load upon first request.")

    def run_all(self, image_bytes: bytes):
        results = {}
        
        image_np = np.frombuffer(image_bytes, np.uint8)
        img_cv2 = cv2.imdecode(image_np, cv2.IMREAD_COLOR)
        img_pil = Image.open(io.BytesIO(image_bytes))
        width, height = img_pil.size

        # 1. Tesseract
        start = time.time()
        try:
            if pytesseract:
                # Configure exact path for Windows Tesseract
                pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
                
                data = pytesseract.image_to_data(img_pil, output_type=pytesseract.Output.DICT)
                tes_text = pytesseract.image_to_string(img_pil)
                detections = []
                conf_sum = 0
                conf_count = 0
                
                for i in range(len(data['text'])):
                    if int(data['conf'][i]) > 0:
                        conf = int(data['conf'][i])
                        conf_sum += conf
                        conf_count += 1
                        detections.append({
                            "text": data['text'][i],
                            "conf": conf,
                            "box": [
                                round(data['top'][i] / height * 100, 2),
                                round(data['left'][i] / width * 100, 2),
                                round(data['width'][i] / width * 100, 2),
                                round(data['height'][i] / height * 100, 2)
                            ]
                        })
                
                avg_conf = round(conf_sum / conf_count) if conf_count > 0 else 0
            else:
                tes_text = "Dependency Missing: pytesseract not installed."
                detections = []
                avg_conf = 0
        except Exception as e:
            tes_text = f"Error: {str(e)}"
            detections = []
            avg_conf = 0
        
        results['tesseract'] = {
            "text": tes_text.strip(), 
            "time": round((time.time() - start) * 1000),
            "confidence": avg_conf,
            "detections": detections
        }

        # 2. PaddleOCR
        start = time.time()
        try:
            if PaddleOCR:
                if not self._paddle_reader:
                    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
                    # paddleocr>=2.7 does not use 'use_gpu' natively in this wrapper version, use default
                    # disable mkldnn to bypass ConvertPirAttribute2RuntimeAttribute oneDNN crash on Windows CPU
                    self._paddle_reader = PaddleOCR(use_angle_cls=True, lang='en', enable_mkldnn=False)

                # Use predict() if available (PaddleX v3.0 wrapper), fallback to ocr()
                pad_result = self._paddle_reader.predict(img_cv2) if hasattr(self._paddle_reader, 'predict') else self._paddle_reader.ocr(img_cv2)
                
                pad_text_lines = []
                detections = []
                conf_sum = 0
                count = 0
                
                # Support new PaddleX dict structure or classic tuple list
                if pad_result and isinstance(pad_result[0], dict) and 'rec_texts' in pad_result[0]:
                    page = pad_result[0]
                    texts = page.get('rec_texts', [])
                    scores = page.get('rec_scores', [])
                    polys = page.get('rec_polys', [])
                    
                    for i in range(len(texts)):
                        text = texts[i]
                        conf = scores[i]
                        poly = polys[i]
                        
                        pad_text_lines.append(text)
                        conf_val = round(conf * 100)
                        conf_sum += conf_val
                        count += 1
                        
                        top = float(np.min(poly[:, 1])) / height * 100
                        left = float(np.min(poly[:, 0])) / width * 100
                        w = float(np.max(poly[:, 0]) - np.min(poly[:, 0])) / width * 100
                        h = float(np.max(poly[:, 1]) - np.min(poly[:, 1])) / height * 100
                        
                        detections.append({
                            "text": text,
                            "conf": conf_val,
                            "box": [round(top, 2), round(left, 2), round(w, 2), round(h, 2)]
                        })
                elif pad_result and pad_result[0]:
                    for line in pad_result[0]:
                        box, (text, conf) = line
                        pad_text_lines.append(text)
                        conf_val = round(conf * 100)
                        conf_sum += conf_val
                        count += 1
                        
                        left = box[0][0] / width * 100
                        top = box[0][1] / height * 100
                        w = (box[1][0] - box[0][0]) / width * 100
                        h = (box[2][1] - box[0][1]) / height * 100
                        
                        detections.append({
                            "text": text,
                            "conf": conf_val,
                            "box": [round(top, 2), round(left, 2), round(w, 2), round(h, 2)]
                        })
                
                pad_text = "\n".join(pad_text_lines)
                avg_conf = round(conf_sum / count) if count > 0 else 0
            else:
                pad_text = "Dependency Missing: paddleocr not installed."
                detections, avg_conf = [], 0
        except Exception as e:
            pad_text = f"Error: {str(e)}"
            detections, avg_conf = [], 0
            
        results['paddleocr'] = {
            "text": pad_text.strip(), 
            "time": round((time.time() - start) * 1000),
            "confidence": avg_conf,
            "detections": detections
        }

        return results
