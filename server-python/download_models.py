"""
Download InsightFace ONNX models (ArcFace) from Hugging Face.
These are the two models we need:
  1. det_10g.onnx  — Face Detector (~16MB)
  2. w600k_r50.onnx — ArcFace Face Recognition (~166MB, 512-d embeddings, 99.8% accuracy)
"""

import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Hugging Face URLs for InsightFace buffalo_l models
MODELS = {
    "det_10g.onnx": "https://huggingface.co/Aitrepreneur/insightface/resolve/main/models/buffalo_l/det_10g.onnx",
    "w600k_r50.onnx": "https://huggingface.co/Aitrepreneur/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx",
}

def download():
    for filename, url in MODELS.items():
        filepath = os.path.join(MODELS_DIR, filename)
        if os.path.exists(filepath):
            print(f"  ✅ {filename} already exists, skipping.")
            continue
        print(f"  ⬇️ Downloading {filename} ...")
        urllib.request.urlretrieve(url, filepath)
        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"  ✅ {filename} downloaded ({size_mb:.1f} MB)")

if __name__ == "__main__":
    print("🔽 Downloading InsightFace ArcFace ONNX models...")
    download()
    print("🎉 All models ready!")
