"""Quick script to inspect the ONNX model input/output shapes."""
import onnxruntime as ort
import os

models_dir = os.path.join(os.path.dirname(__file__), "models")

for model_name in ["det_10g.onnx", "w600k_r50.onnx"]:
    path = os.path.join(models_dir, model_name)
    print(f"\n=== {model_name} ===")
    session = ort.InferenceSession(path)
    for inp in session.get_inputs():
        print(f"  INPUT:  name={inp.name}, shape={inp.shape}, type={inp.type}")
    for out in session.get_outputs():
        print(f"  OUTPUT: name={out.name}, shape={out.shape}, type={out.type}")
