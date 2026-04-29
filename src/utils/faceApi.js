import { Human } from '@vladmandic/human';

const humanConfig = {
    modelBasePath: 'https://vladmandic.github.io/human/models/',
    backend: 'webgl',
    filter: { enabled: false },
    face: {
        enabled: true,
        // Permissive detection — catch blurry, partial, side-angle faces
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

export const extractFacesFromImage = async (imageElement) => {
    if (!modelsLoaded) await loadModels();

    try {
        const result = await human.detect(imageElement);
        // Accept all faces with valid embeddings (30px+ box size)
        const validFaces = result.face.filter(f => 
            f.box[2] >= 30 && 
            f.box[3] >= 30 && 
            f.embedding
        );

        console.log(`Detected ${result.face.length} faces, ${validFaces.length} have valid embeddings`);

        // Return RAW embeddings (no normalization during storage — we normalize during matching)
        return validFaces.map(f => Array.from(f.embedding));
    } catch (error) {
        console.error("Error extracting faces:", error);
        return [];
    }
};

export const getSingleFaceDescriptor = async (imageElement) => {
    if (!modelsLoaded) await loadModels();

    try {
        const result = await human.detect(imageElement);
        const faces = result.face.filter(f => f.embedding && f.score >= 0.3);

        if (faces.length === 0) return null;

        // Pick the largest face (most likely the selfie subject)
        faces.sort((faceA, faceB) => (faceB.box[2] * faceB.box[3]) - (faceA.box[2] * faceA.box[3]));

        console.log(`Selfie scan: detected ${faces.length} face(s), using largest (score: ${faces[0].score.toFixed(3)})`);

        // Return RAW embedding (normalize during matching, not storage)
        return Array.from(faces[0].embedding);
    } catch (error) {
        console.error("Error extracting single face:", error);
        return null;
    }
}

// =====================================================================
// MATCHING ENGINE
// =====================================================================

// L2-normalize a vector (converts to unit vector for fair comparison)
const normalize = (vec) => {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
        norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
};

// Cosine similarity between two vectors (handles both normalized and raw)
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

/**
 * Face matching — works with BOTH old (raw) and new embeddings.
 * 
 * Strategy:
 *  - Normalize both vectors on-the-fly before comparing (so old un-normalized 
 *    Firestore data and new data are treated equally).
 *  - Use cosine similarity as the single reliable metric.
 *  - Threshold of 0.55 = good balance between catching your photos and 
 *    rejecting strangers. faceres 1024-d cosine similarity for same person 
 *    is typically 0.6 to 0.9, for different people it's 0.0 to 0.45.
 */
export const findMatches = (selfieDescriptor, galleryDescriptorsArray) => {
    const SIMILARITY_THRESHOLD = 0.55; // Same person typically scores 0.6-0.9

    // Normalize the selfie once
    const normalizedSelfie = normalize(selfieDescriptor);

    for (const galleryDesc of galleryDescriptorsArray) {
        if (selfieDescriptor.length !== galleryDesc.length) continue;

        // Normalize each gallery face on-the-fly (handles old & new data)
        const normalizedGallery = normalize(galleryDesc);
        
        const similarity = cosineSimilarity(normalizedSelfie, normalizedGallery);

        if (similarity >= SIMILARITY_THRESHOLD) {
            console.log(`  ✅ MATCH found! Similarity: ${similarity.toFixed(4)}`);
            return true;
        }
    }
    return false;
};
