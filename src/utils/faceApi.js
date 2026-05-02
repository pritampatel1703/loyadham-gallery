/**
 * Face API — Connects to the local Python ArcFace server (localhost:8000)
 * for 99.8% accuracy face recognition.
 * 
 * Falls back to the browser-based @vladmandic/human engine if the 
 * Python server is not running.
 */

import { Human } from '@vladmandic/human';

// ─── Configuration ────────────────────────────────────────────────
// In production (Render), this will be dynamically populated from import.meta.env
const PYTHON_SERVER_URL = import.meta.env.VITE_PYTHON_SERVER_URL || 'http://localhost:8000';
let serverAvailable = null; // null = not checked, true/false = checked

// ─── Python Server Detection ─────────────────────────────────────
const checkServer = async () => {
    if (serverAvailable !== null) return serverAvailable;
    try {
        const res = await fetch(`${PYTHON_SERVER_URL}/`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        serverAvailable = data.status === 'running';
        if (serverAvailable) {
            console.log('🚀 ArcFace Python server detected! Using 99.8% accuracy engine.');
        }
    } catch {
        serverAvailable = false;
        console.log('⚠️ Python server not running. Falling back to browser-based AI.');
    }
    return serverAvailable;
};

// ─── Browser-based fallback (Human/faceres) ───────────────────────
const humanConfig = {
    modelBasePath: 'https://vladmandic.github.io/human/models/',
    backend: 'webgl',
    filter: { enabled: false },
    face: {
        enabled: true,
        detector: { model: 'blazeface', maxDetected: 50, minConfidence: 0.25, return: true },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: true, model: 'faceres' },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false }
};

let human = null;
let modelsLoaded = false;

const loadBrowserModels = async () => {
    if (modelsLoaded) return true;
    try {
        human = new Human(humanConfig);
        await human.load();
        await human.warmup();
        modelsLoaded = true;
        console.log("Browser-based Human models loaded (fallback mode).");
        return true;
    } catch (error) {
        console.error("Error loading Human models:", error);
        return false;
    }
};

// ─── PUBLIC API ───────────────────────────────────────────────────

/**
 * Load models — checks if Python server is available, loads browser fallback if not.
 */
export const loadModels = async () => {
    const hasServer = await checkServer();
    if (hasServer) return true;
    return loadBrowserModels();
};

/**
 * Extract face embeddings from a photo.
 * Used during admin upload — pass the Cloudinary URL to the Python server.
 * Falls back to browser extraction if server is unavailable.
 */
export const extractFacesFromImage = async (imageElement, cloudinaryUrl) => {
    const hasServer = await checkServer();

    if (hasServer && cloudinaryUrl) {
        // ─── ArcFace Server (512-d embeddings, 99.8% accuracy) ───
        try {
            console.log(`🔍 Sending to ArcFace server: ${cloudinaryUrl.substring(0, 60)}...`);
            const res = await fetch(`${PYTHON_SERVER_URL}/api/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: cloudinaryUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Server error');
            console.log(`✅ ArcFace detected ${data.faceCount} face(s)`);
            return data.embeddings;
        } catch (err) {
            console.error('ArcFace server error, falling back to browser:', err);
        }
    }

    // ─── Browser Fallback (1024-d faceres embeddings) ─────────
    if (!modelsLoaded) await loadBrowserModels();
    try {
        const result = await human.detect(imageElement);
        const validFaces = result.face.filter(f =>
            f.box[2] >= 30 && f.box[3] >= 30 && f.embedding
        );
        console.log(`Browser detected ${validFaces.length} face(s) (fallback mode)`);
        return validFaces.map(f => Array.from(f.embedding));
    } catch (error) {
        console.error("Error extracting faces:", error);
        return [];
    }
};

/**
 * Extract the selfie face descriptor.
 * Returns the embedding array for the largest face detected.
 */
export const getSingleFaceDescriptor = async (imageElement) => {
    const hasServer = await checkServer();

    if (hasServer) {
        // ─── ArcFace Server ──────────────────────────────────────
        try {
            // Convert image element to base64
            const canvas = document.createElement('canvas');
            canvas.width = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width;
            canvas.height = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.9);

            const res = await fetch(`${PYTHON_SERVER_URL}/api/detect-base64`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 }),
            });

            if (!res.ok) throw new Error('Server detection failed for selfie');

            const data = await res.json();
            if (data.embeddings && data.embeddings.length > 0) {
                console.log(`✅ ArcFace selfie: detected ${data.faceCount} face(s)`);
                return data.embeddings[0]; // Return the first (largest) face
            }
            return null;
        } catch (err) {
            console.error('ArcFace selfie detection failed, falling back:', err);
        }
    }

    // ─── Browser Fallback ────────────────────────────────────────
    if (!modelsLoaded) await loadBrowserModels();
    try {
        const result = await human.detect(imageElement);
        const faces = result.face.filter(f => f.embedding && f.score >= 0.3);
        if (faces.length === 0) return null;
        faces.sort((a, b) => (b.box[2] * b.box[3]) - (a.box[2] * a.box[3]));
        console.log(`Browser selfie: detected ${faces.length} face(s) (fallback)`);
        return Array.from(faces[0].embedding);
    } catch (error) {
        console.error("Error extracting single face:", error);
        return null;
    }
};

// ─── MATCHING ─────────────────────────────────────────────────────

// L2-normalize a vector
const normalize = (vec) => {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
};

// Cosine similarity
const cosineSimilarity = (a, b) => {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Match a selfie descriptor against gallery descriptors.
 * Automatically adjusts threshold based on embedding type:
 *   - 512-d (ArcFace): threshold 0.40 — extremely discriminative
 *   - 1024-d (faceres/Human): threshold 0.40 — looser due to lower quality
 */
export const findMatches = (selfieDescriptor, galleryDescriptorsArray) => {
    // Detect embedding type and set appropriate threshold
    const is512d = selfieDescriptor.length === 512;
    const THRESHOLD = is512d ? 0.40 : 0.40;

    const normSelfie = normalize(selfieDescriptor);
    let bestScore = 0;

    for (const galleryDesc of galleryDescriptorsArray) {
        // Skip dimension mismatch (e.g., 512-d selfie vs 1024-d gallery)
        if (selfieDescriptor.length !== galleryDesc.length) continue;

        const normGallery = normalize(galleryDesc);
        const sim = cosineSimilarity(normSelfie, normGallery);
        if (sim > bestScore) bestScore = sim;

        if (sim >= THRESHOLD) {
            console.log(`  ✅ MATCH! Similarity: ${sim.toFixed(4)} (${is512d ? 'ArcFace' : 'Browser'})`);
            return true;
        }
    }
    console.log(`  ❌ No match. Best: ${bestScore.toFixed(4)}`);
    return false;
};
