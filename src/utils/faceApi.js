import { Human } from '@vladmandic/human';

const humanConfig = {
    // Load models from the official CDN to keep the app lightweight and fast
    modelBasePath: 'https://vladmandic.github.io/human/models/',
    backend: 'webgl',
    filter: { enabled: false },
    face: {
        enabled: true,
        detector: { model: 'blazeface', maxDetected: 100, minConfidence: 0.2, return: true },
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
        // Valid faces with embeddings (faceres returns 1024-d array)
        const validFaces = result.face.filter(f => f.box[2] >= 30 && f.box[3] >= 30 && f.embedding);

        // Return array of arrays (Array.from converts Float32Array to standard array for Firestore)
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
        const faces = result.face.filter(f => f.embedding);

        if (faces.length === 0) return null;

        // Sort by area size (width * height) to get the primary face (selfie)
        faces.sort((a, b) => (b.box[2] * b.box[3]) - (a.box[2] * a.box[3]));

        return Array.from(faces[0].embedding);
    } catch (error) {
        console.error("Error extracting single face:", error);
        return null;
    }
}

// Standalone pure-math fallback for findMatches so it doesn't break if WebGL models haven't finished loading in background
const cosineSimilarity = (a, b) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const findMatches = (selfieDescriptorArray, galleryDescriptorsArray, threshold = 0.45) => {
    // Reverse similarity to distance to match existing slider UI (0 distance = perfect match)
    for (const galleryDescArray of galleryDescriptorsArray) {
        const similarity = cosineSimilarity(selfieDescriptorArray, galleryDescArray);
        const distance = 1.0 - similarity;

        if (distance < threshold) {
            return true;
        }
    }
    return false;
};
