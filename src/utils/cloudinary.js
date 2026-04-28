import { storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Helper function to compress images before upload
// This prevents the "File size too large" (10MB) error on free Cloudinary tiers
const compressImage = (file, maxWidth = 4000, quality = 0.95) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Only resize if the image is larger than our maxWidth
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export as JPEG with 80% quality
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error("Canvas to Blob failed"));
                        return;
                    }
                    // Create a new File object from the compressed blob
                    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });

                    console.log(`Original Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`Compressed Size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const uploadToCloudinary = async (file) => {
    const cloudName = "dbr7sayvl";
    const uploadPreset = "loyadham-gallery";

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    // Compress the file before uploading
    let fileToUpload = file;
    try {
        if (file.type.startsWith('image/')) {
            fileToUpload = await compressImage(file);
        }
    } catch (err) {
        console.error("Compression failed, attempting upload with original file", err);
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Cloudinary failed with data:", data);
            throw new Error(`Cloudinary Error: ${data.error?.message || response.statusText}`);
        }

        return data.secure_url;
    } catch (error) {
        console.warn("Cloudinary upload blocked or failed, falling back to Firebase Storage:", error);
        
        try {
            // Create a unique file name
            const timestamp = Date.now();
            const safeName = file.name ? file.name.replace(/[^a-z0-9.]/gi, '_') : 'image.jpg';
            const storageRef = ref(storage, `gallery_uploads/${timestamp}_${safeName}`);
            
            const snapshot = await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(snapshot.ref);
            
            return downloadURL;
        } catch (firebaseError) {
            console.error("Firebase Storage fallback also failed:", firebaseError);
            throw new Error(`Fallback upload failed: ${firebaseError.message || firebaseError}. Check your network or disable AdBlock/Antivirus.`);
        }
    }
};
