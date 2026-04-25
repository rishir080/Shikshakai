import os
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

def download_models():
    print("Initiating manual download for TrOCR Base Handwritten model...")
    print("This might take a moment. Your backend will not timeout while doing this!")
    
    try:
        model_id = "microsoft/trocr-base-handwritten"
        
        print("\nStep 1/2: Downloading Processor...")
        processor = TrOCRProcessor.from_pretrained(model_id)
        
        print("\nStep 2/2: Downloading VisionEncoderDecoder Model...")
        model = VisionEncoderDecoderModel.from_pretrained(model_id)
        
        print("\nSuccess! All models have been safely downloaded and cached.")
        print("You can safely start the backend now.")
        
    except Exception as e:
        print(f"\nError downloading models: {e}")

if __name__ == "__main__":
    download_models()
