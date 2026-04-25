from PIL import Image, ImageDraw, ImageFont
import torch
import numpy as np
import cv2
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

def test_config(name, img, processor, model, gen_args):
    pixel_values = processor(images=img, return_tensors='pt').pixel_values
    with torch.no_grad():
        generated_ids = model.generate(pixel_values, **gen_args)
    text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    print(f"Config '{name}': {text}")

# 1. Create a "handwritten-like" image (thick strokes)
img = Image.new('RGB', (1000, 150), color='white')
draw = ImageDraw.Draw(img)
# Use a default font but make it look like a line of text
text_to_test = "Handwriting recognition test for secondary school."
draw.text((30, 40), text_to_test, fill='black')

# 2. Load model
print("Loading model...")
processor = TrOCRProcessor.from_pretrained('microsoft/trocr-large-handwritten')
model = VisionEncoderDecoderModel.from_pretrained('microsoft/trocr-large-handwritten')

# 3. Test various generation configs
configs = [
    ("Default", {}),
    ("Beam 4", {"num_beams": 4}),
    ("No Repeat 2", {"no_repeat_ngram_size": 2}),
    ("No Repeat 3", {"no_repeat_ngram_size": 3}),
    ("Penalty 1.2", {"repetition_penalty": 1.2}),
    ("Combined", {"num_beams": 4, "no_repeat_ngram_size": 3, "early_stopping": True})
]

print(f"Target Text: {text_to_test}")
for name, args in configs:
    test_config(name, img.convert("RGB"), processor, model, args)

# 4. Test Preprocessing
print("\nTesting Preprocessing (Thresholded vs Original)...")
# Adaptive thresh
img_np = np.array(img.convert("L"))
thresh = cv2.adaptiveThreshold(img_np, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
img_thresh = Image.fromarray(thresh).convert("RGB")

test_config("Original (RGB)", img.convert("RGB"), processor, model, {"num_beams": 4})
test_config("Thresholded (B&W)", img_thresh, processor, model, {"num_beams": 4})
