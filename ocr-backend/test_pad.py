import traceback
import cv2
import numpy as np
import os

try:
    from paddleocr import PaddleOCR
    os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK']='True'
    ocr = PaddleOCR(use_angle_cls=True, lang='en', enable_mkldnn=False)
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    print(ocr.ocr(img))
    print('PaddleOCR generated results successfully')
except Exception as e:
    traceback.print_exc()
