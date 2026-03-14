import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // need to install this or use built-in depending on node version, but node 18+ has fetch.
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testCloudinary() {
    console.log("Testing Cloudinary...");
    const cloudName = "dbr7sayvl";
    const uploadPreset = "loyadham-gallery";
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    // Create a dummy text file to upload as image for testing
    const dummyFilePath = path.join(__dirname, 'dummy.txt');
    fs.writeFileSync(dummyFilePath, "dummy data");

    const formData = new FormData();

    // Can't easily use FormData with file paths in raw Node.js fetch like browser, 
    // so we'll use a data URI.
    const base64Data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    formData.append("file", base64Data);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        console.log("Cloudinary Response:", data);
        if (!response.ok) {
            console.error("Cloudinary failed!");
            return false;
        }
        return true;
    } catch (error) {
        console.error("Cloudinary Error:", error);
        return false;
    }
}

testCloudinary();
