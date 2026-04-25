print("Testing imports...")
import time
start = time.time()
print("Importing torch...")
import torch
print(f"Done in {time.time()-start:.2f}s")

start = time.time()
print("Importing transformers...")
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
print(f"Done in {time.time()-start:.2f}s")

start = time.time()
print("Importing paddleocr...")
from paddleocr import PaddleOCR
print(f"Done in {time.time()-start:.2f}s")

print("All imports successful!")
