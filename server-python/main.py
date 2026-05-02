"""
Loyadham Gallery — Face Recognition Backend
Engine: InsightFace ArcFace (ONNX) — 99.8% accuracy on CPU
No compilation needed. Uses only onnxruntime + opencv + numpy.

Endpoints:
  GET  /             — Health check
  POST /api/detect   — Detect faces in a Cloudinary image URL, return 512-d embeddings
  POST /api/search   — Compare selfie against gallery embeddings, return matched photo IDs
"""

import io
import os
import base64
import traceback

import cv2
import numpy as np
import onnxruntime as ort
import requests as http_requests
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# ─── PATHS ─────────────────────────────────────────────────────────
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
DET_MODEL_PATH = os.path.join(MODELS_DIR, "det_10g.onnx")
REC_MODEL_PATH = os.path.join(MODELS_DIR, "w600k_r50.onnx")

# ─── ONNX Sessions ────────────────────────────────────────────────
det_session = None
rec_session = None


def load_models():
    global det_session, rec_session
    print("Loading ONNX models...")
    det_session = ort.InferenceSession(DET_MODEL_PATH, providers=["CPUExecutionProvider"])
    rec_session = ort.InferenceSession(REC_MODEL_PATH, providers=["CPUExecutionProvider"])
    print("  Face Detector : det_10g.onnx (RetinaFace)")
    print("  Face Recognizer: w600k_r50.onnx (ArcFace, 512-d, 99.8% accuracy)")
    print("Models loaded successfully!")


# ─── FACE DETECTION (RetinaFace) ──────────────────────────────────
# Standard 5-point face template for alignment (used by InsightFace)
ARCFACE_TEMPLATE = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)


def _generate_anchors(height, width, strides=[8, 16, 32]):
    """Generate anchor boxes for RetinaFace at multiple scales."""
    anchors = []
    for stride in strides:
        fh = height // stride
        fw = width // stride
        for i in range(fh):
            for j in range(fw):
                # 2 anchors per location
                anchors.append([j * stride, i * stride])
                anchors.append([j * stride, i * stride])
    return np.array(anchors, dtype=np.float32)


def _distance2bbox(points, distance):
    """Convert distance predictions to bounding boxes."""
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def _distance2kps(points, distance):
    """Convert distance predictions to keypoints (5 landmarks x 2 coords)."""
    kps = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, 0] + distance[:, i]
        py = points[:, 1] + distance[:, i + 1]
        kps.append(px)
        kps.append(py)
    return np.stack(kps, axis=-1)


def detect_faces(image_bgr, det_size=640, conf_threshold=0.5):
    """
    Detect faces using the RetinaFace ONNX model.
    Returns list of dicts: { bbox: [x1,y1,x2,y2], score: float, landmarks: [[x,y]*5] }
    """
    h_orig, w_orig = image_bgr.shape[:2]

    # Resize to det_size x det_size
    scale = det_size / max(h_orig, w_orig)
    new_w = int(w_orig * scale)
    new_h = int(h_orig * scale)
    resized = cv2.resize(image_bgr, (new_w, new_h))

    # Pad to square
    padded = np.zeros((det_size, det_size, 3), dtype=np.float32)
    padded[:new_h, :new_w, :] = resized

    # Prepare input: HWC -> NCHW, float32
    blob = np.transpose(padded, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)

    # Run inference
    input_name = det_session.get_inputs()[0].name
    outputs = det_session.run(None, {input_name: blob})

    # Parse outputs (3 scales: stride 8, 16, 32)
    # outputs[0:3] = scores, outputs[3:6] = bboxes, outputs[6:9] = landmarks
    strides = [8, 16, 32]
    scores_list = []
    bboxes_list = []
    kps_list = []

    anchors = _generate_anchors(det_size, det_size, strides)
    anchor_idx = 0

    for idx, stride in enumerate(strides):
        fh = det_size // stride
        fw = det_size // stride
        num_anchors = fh * fw * 2  # 2 anchors per location

        score = outputs[idx].reshape(-1)
        bbox = outputs[idx + 3].reshape(-1, 4) * stride
        kps = outputs[idx + 6].reshape(-1, 10) * stride

        anchor_slice = anchors[anchor_idx:anchor_idx + num_anchors]
        anchor_idx += num_anchors

        bbox_decoded = _distance2bbox(anchor_slice, bbox)
        kps_decoded = _distance2kps(anchor_slice, kps)

        scores_list.append(score)
        bboxes_list.append(bbox_decoded)
        kps_list.append(kps_decoded)

    all_scores = np.concatenate(scores_list)
    all_bboxes = np.concatenate(bboxes_list)
    all_kps = np.concatenate(kps_list)

    # Filter by confidence
    mask = all_scores >= conf_threshold
    scores = all_scores[mask]
    bboxes = all_bboxes[mask]
    kps = all_kps[mask]

    if len(scores) == 0:
        return []

    # NMS (Non-Maximum Suppression)
    order = scores.argsort()[::-1]
    bboxes = bboxes[order]
    scores = scores[order]
    kps = kps[order]

    keep = []
    suppressed = np.zeros(len(scores), dtype=bool)
    for i in range(len(scores)):
        if suppressed[i]:
            continue
        keep.append(i)
        ix1 = np.maximum(bboxes[i, 0], bboxes[i + 1:, 0])
        iy1 = np.maximum(bboxes[i, 1], bboxes[i + 1:, 1])
        ix2 = np.minimum(bboxes[i, 2], bboxes[i + 1:, 2])
        iy2 = np.minimum(bboxes[i, 3], bboxes[i + 1:, 3])
        iw = np.maximum(ix2 - ix1, 0)
        ih = np.maximum(iy2 - iy1, 0)
        inter = iw * ih
        area_i = (bboxes[i, 2] - bboxes[i, 0]) * (bboxes[i, 3] - bboxes[i, 1])
        area_j = (bboxes[i + 1:, 2] - bboxes[i + 1:, 0]) * (bboxes[i + 1:, 3] - bboxes[i + 1:, 1])
        iou = inter / (area_i + area_j - inter + 1e-6)
        suppressed[i + 1:][iou > 0.4] = True

    bboxes = bboxes[keep]
    scores = scores[keep]
    kps = kps[keep]

    # Scale back to original image size
    faces = []
    for i in range(len(scores)):
        bbox = bboxes[i] / scale
        landmarks = kps[i].reshape(5, 2) / scale
        faces.append({
            "bbox": bbox.tolist(),
            "score": float(scores[i]),
            "landmarks": landmarks.tolist()
        })

    return faces


# ─── FACE ALIGNMENT & RECOGNITION (ArcFace) ──────────────────────
def align_face(image_bgr, landmarks_5):
    """
    Align a face using 5-point landmarks via affine transformation.
    This is CRITICAL for ArcFace accuracy — without alignment, accuracy drops massively.
    """
    src = np.array(landmarks_5, dtype=np.float32)
    dst = ARCFACE_TEMPLATE.copy()

    # Estimate affine transform (partial, allows rotation + scale + translation)
    tform = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)[0]
    aligned = cv2.warpAffine(image_bgr, tform, (112, 112), borderValue=0)
    return aligned


def get_embedding(aligned_face_bgr):
    """
    Extract a 512-d ArcFace embedding from a 112x112 aligned face.
    Returns L2-normalized embedding.
    """
    # Preprocess: BGR -> RGB, normalize to [-1, 1], transpose to NCHW
    face_rgb = cv2.cvtColor(aligned_face_bgr, cv2.COLOR_BGR2RGB)
    face_input = (face_rgb.astype(np.float32) - 127.5) / 127.5
    face_input = np.transpose(face_input, (2, 0, 1))[np.newaxis, :, :, :]

    # Run ArcFace
    input_name = rec_session.get_inputs()[0].name
    embedding = rec_session.run(None, {input_name: face_input})[0][0]

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding.tolist()


def process_image(image_bgr):
    """Full pipeline: detect faces, align them, extract embeddings."""
    faces = detect_faces(image_bgr, conf_threshold=0.3)  # Permissive detection
    embeddings = []
    for face in faces:
        aligned = align_face(image_bgr, face["landmarks"])
        emb = get_embedding(aligned)
        embeddings.append(emb)
    return embeddings, faces


# ─── FASTAPI APP ───────────────────────────────────────────────────
app = FastAPI(title="Loyadham Face API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    imageUrl: str


class GalleryItem(BaseModel):
    photoId: str
    embeddings: List[List[float]]


class SearchRequest(BaseModel):
    selfieBase64: str
    galleryEmbeddings: List[GalleryItem]


@app.on_event("startup")
def startup():
    load_models()


@app.get("/")
def root():
    return {
        "status": "running",
        "engine": "InsightFace ArcFace (ONNX)",
        "accuracy": "99.8% (LFW benchmark)",
        "embedding_dim": 512
    }


@app.get("/api/ping")
def ping():
    """Endpoint for UptimeRobot to ping every 5 minutes to keep the Render free tier awake."""
    return {"status": "awake"}


@app.post("/api/detect")
def api_detect(req: DetectRequest):
    """
    Admin uploads a photo. We download it, detect all faces,
    and return 512-d ArcFace embeddings for each face.
    """
    try:
        print(f"Detecting faces in: {req.imageUrl[:80]}...")

        # Download image
        resp = http_requests.get(req.imageUrl, timeout=30)
        resp.raise_for_status()
        img_array = np.frombuffer(resp.content, np.uint8)
        image_bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if image_bgr is None:
            raise HTTPException(status_code=400, detail="Failed to decode image")

        embeddings, faces = process_image(image_bgr)

        print(f"  Found {len(faces)} face(s), extracted {len(embeddings)} embedding(s)")
        return {
            "success": True,
            "embeddings": embeddings,
            "faceCount": len(embeddings),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class DetectBase64Request(BaseModel):
    imageBase64: str


@app.post("/api/detect-base64")
def api_detect_base64(req: DetectBase64Request):
    """
    Detect faces from a base64-encoded image (used for selfie detection).
    Returns 512-d ArcFace embeddings.
    """
    try:
        print("Detecting faces from base64 image...")

        b64 = req.imageBase64
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        image_data = base64.b64decode(b64)
        img_array = np.frombuffer(image_data, np.uint8)
        image_bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if image_bgr is None:
            raise HTTPException(status_code=400, detail="Failed to decode image")

        embeddings, faces = process_image(image_bgr)

        print(f"  Found {len(faces)} face(s), extracted {len(embeddings)} embedding(s)")
        return {
            "success": True,
            "embeddings": embeddings,
            "faceCount": len(embeddings),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
def api_search(req: SearchRequest):
    """
    Guest sends selfie. We extract the selfie's ArcFace embedding,
    then compare it against all gallery embeddings using cosine similarity.
    """
    try:
        print(f"Processing selfie search...")

        # Decode selfie from base64
        b64 = req.selfieBase64
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        image_data = base64.b64decode(b64)
        img_array = np.frombuffer(image_data, np.uint8)
        selfie_bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if selfie_bgr is None:
            raise HTTPException(status_code=400, detail="Failed to decode selfie image")

        # Detect faces in selfie
        faces = detect_faces(selfie_bgr, conf_threshold=0.3)
        if not faces:
            raise HTTPException(status_code=400, detail="No face detected in selfie. Please try again with better lighting.")

        # Use the largest face (selfie subject)
        faces.sort(key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]), reverse=True)
        aligned = align_face(selfie_bgr, faces[0]["landmarks"])
        selfie_emb = np.array(get_embedding(aligned))

        print(f"  Selfie face detected (score: {faces[0]['score']:.3f}). Comparing against gallery...")

        # Compare against gallery
        THRESHOLD = 0.40  # Cosine similarity threshold. ArcFace same-person: 0.5-1.0, different: -0.2 to 0.3
        matches = []

        for item in req.galleryEmbeddings:
            best_sim = -1.0
            for emb in item.embeddings:
                gallery_emb = np.array(emb)
                # Cosine similarity (embeddings are already L2-normalized)
                sim = float(np.dot(selfie_emb, gallery_emb))
                if sim > best_sim:
                    best_sim = sim

            if best_sim >= THRESHOLD:
                matches.append({
                    "photoId": item.photoId,
                    "confidence": round(best_sim, 4)
                })

        print(f"  Found {len(matches)} matches out of {len(req.galleryEmbeddings)} photos")
        return {"success": True, "matches": matches}

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print("=" * 60)
    print("  Loyadham Gallery - Face Recognition Server")
    print("  Engine: InsightFace ArcFace (99.8% accuracy)")
    print("  Mode:   CPU (ONNX Runtime)")
    print(f"  Docs:   http://localhost:{port}/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)
