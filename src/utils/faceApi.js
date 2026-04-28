import { Human } from '@vladmandic/human';

const humanConfig = {
    // Load models from the official CDN to keep the app lightweight and fast
    modelBasePath: 'https://vladmandic.github.io/human/models/',
    backend: 'webgl',
    filter: { enabled: false },
    face: {
        enabled: true,
        // LOW confidence threshold = detect blurry/partial/side-angle faces during upload
        detector: { model: 'blazeface', maxDetected: 50, minConfidence: 0.25, return: true },
        mesh: { enabled: false },
        iris: { enabled: false },
        // faceres generates 1024-d embeddings for face recognition
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

export const loadModels = async () => {
    if (modelsLoaded) return true;

    try {
        human = new Human(humanConfig);
        await human.load();
        await human.warmup();
        modelsLoaded = true;
        console.log("Human WebGL models loaded successfully from CDN.");
        return true;
    } catch (error) {
        console.error("Error loading Human models:", error);
        return false;
    }
};

// L2-normalize a vector so cosine similarity becomes a simple dot product
// This is critical for accurate face matching — raw embeddings can have varying magnitudes
const normalizeEmbedding = (embedding) => {
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
        norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return embedding;
    return embedding.map(val => val / norm);
};

export const extractFacesFromImage = async (imageElement) => {
    if (!modelsLoaded) await loadModels();

    try {
        const result = await human.detect(imageElement);
        // Accept faces with small boxes (30px+) to catch blurry/partial faces in group photos
        // The key is: we store ALL detected face embeddings, even low-quality ones.
        // The MATCHING step (findMatches) is where we enforce strictness.
        const validFaces = result.face.filter(f => 
            f.box[2] >= 30 && 
            f.box[3] >= 30 && 
            f.embedding
        );

        console.log(`Detected ${result.face.length} faces, ${validFaces.length} have valid embeddings`);

        // Normalize all embeddings before storing — this is critical for accurate matching
        return validFaces.map(f => normalizeEmbedding(Array.from(f.embedding)));
    } catch (error) {
        console.error("Error extracting faces:", error);
        return [];
    }
};

export const getSingleFaceDescriptor = async (imageElement) => {
    if (!modelsLoaded) await loadModels();

    try {
        const result = await human.detect(imageElement);
        // For the selfie, we need at least some confidence
        const faces = result.face.filter(f => f.embedding && f.score >= 0.3);

        if (faces.length === 0) return null;

        // Sort by area size (width * height) to get the primary/largest face (selfie)
        faces.sort((faceA, faceB) => (faceB.box[2] * faceB.box[3]) - (faceA.box[2] * faceA.box[3]));

        console.log(`Selfie scan: detected ${faces.length} face(s), using largest (score: ${faces[0].score.toFixed(3)})`);

        // Normalize the selfie embedding too
        return normalizeEmbedding(Array.from(faces[0].embedding));
    } catch (error) {
        console.error("Error extracting single face:", error);
        return null;
    }
}

// =====================================================================
// MATCHING ENGINE — This is where precision matters
// =====================================================================

// Cosine similarity between two L2-normalized vectors (equivalent to dot product)
const cosineSimilarity = (vecA, vecB) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Euclidean distance — second independent metric to cross-verify
const euclideanDistance = (vecA, vecB) => {
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
        const diff = vecA[i] - vecB[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
};

/**
 * Dual-metric face matching with strict thresholds.
 * 
 * Strategy: 
 *   - Detection is PERMISSIVE (catch blurry/partial faces)
 *   - Matching is STRICT (only the right person passes)
 * 
 * A photo matches ONLY if at least one face in it passes BOTH:
 *   1. Cosine similarity >= 0.68 (i.e. cosine distance < 0.32)
 *   2. Euclidean distance < 1.0 (for normalized embeddings, max possible is 2.0)
 * 
 * These thresholds are tuned for faceres 1024-d normalized embeddings.
 */
export const findMatches = (selfieDescriptor, galleryDescriptorsArray) => {
    const COSINE_SIMILARITY_MIN = 0.68;   // Must be at least 68% similar
    const EUCLIDEAN_DISTANCE_MAX = 1.0;    // For L2-normalized vectors, same person is typically < 0.8

    for (const galleryDesc of galleryDescriptorsArray) {
        // Skip if dimensions don't match (corrupted data)
        if (selfieDescriptor.length !== galleryDesc.length) continue;

        const cosSim = cosineSimilarity(selfieDescriptor, galleryDesc);
        const euclDist = euclideanDistance(selfieDescriptor, galleryDesc);

        // Must pass BOTH metrics — this eliminates most false positives
        if (cosSim >= COSINE_SIMILARITY_MIN && euclDist < EUCLIDEAN_DISTANCE_MAX) {
            return true;
        }
    }
    return false;
};
