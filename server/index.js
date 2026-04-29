require('dotenv').config();
const express = require('express');
const cors = require('cors');
const msRest = require('@azure/ms-rest-js');
const Face = require('@azure/cognitiveservices-face');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // For base64 uploads if needed

// Initialize Azure Face API Client
// Note: These will be loaded from the environment
let faceClient = null;

const initFaceClient = () => {
    const key = process.env.AZURE_FACE_KEY;
    const endpoint = process.env.AZURE_FACE_ENDPOINT;
    
    if (!key || !endpoint) {
        console.warn('⚠️ AZURE_FACE_KEY or AZURE_FACE_ENDPOINT is missing in .env');
        return false;
    }
    
    const credentials = new msRest.ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } });
    faceClient = new Face.FaceClient(credentials, endpoint);
    return true;
};

initFaceClient();

// Test Route
app.get('/', (req, res) => {
    res.json({ status: 'Loyadham Gallery Face API Server Running' });
});

/**
 * Route: /api/detect
 * Desc: Called by Admin when uploading a photo. 
 * Detects faces via Azure and returns Face IDs.
 */
app.post('/api/detect', async (req, res) => {
    if (!faceClient && !initFaceClient()) {
        return res.status(500).json({ error: 'Azure credentials not configured.' });
    }

    const { imageUrl } = req.body;
    
    if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
    }

    try {
        console.log(`Detecting faces for: ${imageUrl}`);
        
        // Call Azure Face API
        const faces = await faceClient.face.detectWithUrl(imageUrl, {
            returnFaceId: true,
            recognitionModel: 'recognition_04', // Latest recognition model
            detectionModel: 'detection_03',     // Latest detection model
        });

        console.log(`Found ${faces.length} faces.`);
        
        // Extract Face IDs
        const faceIds = faces.map(face => face.faceId);
        
        res.json({ success: true, faceIds });
    } catch (error) {
        console.error('Azure Detect Error:', error.message);
        res.status(500).json({ error: 'Failed to detect faces', details: error.message });
    }
});

/**
 * Route: /api/search
 * Desc: Called by Guest when scanning selfie.
 * Takes the selfie image (base64 or URL), detects the selfie Face ID, 
 * then compares it against all gallery Face IDs.
 */
app.post('/api/search', async (req, res) => {
    if (!faceClient && !initFaceClient()) {
        return res.status(500).json({ error: 'Azure credentials not configured.' });
    }

    const { selfieBase64, galleryFaceIds } = req.body;
    
    if (!selfieBase64 || !galleryFaceIds || !Array.isArray(galleryFaceIds)) {
        return res.status(400).json({ error: 'selfieBase64 and galleryFaceIds array are required' });
    }
    
    if (galleryFaceIds.length === 0) {
        return res.json({ success: true, matchedIds: [] });
    }

    try {
        // 1. Detect face in the selfie
        // Azure requires binary stream for raw image upload
        const imageBuffer = Buffer.from(selfieBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        
        const selfieFaces = await faceClient.face.detectWithStream(imageBuffer, {
            returnFaceId: true,
            recognitionModel: 'recognition_04',
            detectionModel: 'detection_03'
        });

        if (selfieFaces.length === 0) {
            return res.status(400).json({ error: 'No face detected in selfie.' });
        }

        const selfieFaceId = selfieFaces[0].faceId; // Pick the first face detected
        console.log(`Selfie Face ID: ${selfieFaceId}`);

        // 2. Find similar faces in the gallery
        // Azure allows comparing against up to 1000 faces at once
        // For larger galleries, we chunk the array
        const matchedIds = [];
        const chunkSize = 1000;
        
        for (let i = 0; i < galleryFaceIds.length; i += chunkSize) {
            const chunk = galleryFaceIds.slice(i, i + chunkSize);
            
            const results = await faceClient.face.findSimilar(selfieFaceId, {
                faceIds: chunk,
                mode: 'matchPerson'
            });

            // Add matched Face IDs to the result array
            results.forEach(match => {
                matchedIds.push(match.faceId);
            });
        }

        console.log(`Found ${matchedIds.length} matches in the gallery.`);
        res.json({ success: true, matchedIds });

    } catch (error) {
        console.error('Azure Search Error:', error.message);
        res.status(500).json({ error: 'Failed to search faces', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
