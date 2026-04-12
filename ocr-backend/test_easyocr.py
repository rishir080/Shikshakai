import easyocr
import traceback

print("Testing EasyOCR download...")
try:
    reader = easyocr.Reader(['en'], gpu=False)
    print("EasyOCR loaded successfully!")
except Exception as e:
    print("Exception occurred:")
    traceback.print_exc()
