import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { getEventById, savePhotoMetadata, getEventPhotos, deleteEventPhoto, updateEvent } from '../utils/db';
import { extractFacesFromImage, loadModels } from '../utils/faceApi';
import { uploadToCloudinary } from '../utils/cloudinary';
import { logoutAdmin } from '../utils/auth';
import { ALLOWED_ADMINS } from '../config/admins';
import Swal from 'sweetalert2';

const EventAdmin = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();

    const [eventData, setEventData] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });

    // Lightbox State
    const [lightboxIndex, setLightboxIndex] = useState(null);

    // Hidden canvas/img for face-api processing
    const imgRef = useRef(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (!user) {
                navigate('/admin/login');
            } else if (!ALLOWED_ADMINS.includes(user.email?.toLowerCase())) {
                logoutAdmin().then(() => navigate('/admin/login'));
            } else {
                loadEventData();
            }
        });
        return () => unsubscribe();
    }, [eventId, navigate]);

    // Handle keyboard navigation for Lightbox
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (lightboxIndex === null) return;
            if (e.key === 'Escape') setLightboxIndex(null);
            if (e.key === 'ArrowLeft') handlePrevPhoto();
            if (e.key === 'ArrowRight') handleNextPhoto();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex]);

    const loadEventData = async () => {
        const data = await getEventById(eventId);
        if (data) {
            setEventData(data);
            const existingPhotos = await getEventPhotos(eventId);
            setPhotos(existingPhotos);

            // Backward compatibility: Automatically set cover if none exists but photos exist
            if (!data.coverUrl && existingPhotos.length > 0) {
                // Find the oldest uploaded photo (or just the first in the array)
                const firstPhoto = existingPhotos[0];
                await updateEvent(eventId, { coverUrl: firstPhoto.url });
                setEventData(prev => ({ ...prev, coverUrl: firstPhoto.url }));
            }
        } else {
            Swal.fire({
                title: 'Event Not Found',
                text: 'Could not locate this event securely.',
                icon: 'error',
                confirmButtonColor: '#0C3C67'
            });
            navigate('/admin');
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsProcessing(true);
        setProgress({ current: 0, total: files.length, status: 'Initializing ML Models...' });

        // Ensure models are loaded before processing starts
        await loadModels();

        let successCount = 0;

        let hasCover = eventData?.coverUrl;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setProgress({ current: i + 1, total: files.length, status: `Processing Image ${i + 1}/${files.length}...` });

            try {
                // Step 1: Load image into hidden DOM element to allow FaceAPI to read it
                const objectUrl = URL.createObjectURL(file);

                await new Promise((resolve, reject) => {
                    imgRef.current.onload = resolve;
                    imgRef.current.onerror = reject;
                    imgRef.current.src = objectUrl;
                });

                setProgress({ current: i + 1, total: files.length, status: `Extracting Faces...` });

                // Step 2: Extract Face Descriptors
                const descriptors = await extractFacesFromImage(imgRef.current);

                URL.revokeObjectURL(objectUrl); // Clean up memory

                setProgress({ current: i + 1, total: files.length, status: `Uploading to Cloud...` });

                // Step 3: Upload to Cloudinary
                const secureUrl = await uploadToCloudinary(file);

                // Step 4: Save metadata to Firestore
                await savePhotoMetadata(eventId, secureUrl, descriptors);

                // Auto-set cover image if the event doesn't currently have one
                if (!hasCover) {
                    await updateEvent(eventId, { coverUrl: secureUrl });
                    setEventData(prev => ({ ...prev, coverUrl: secureUrl }));
                    hasCover = true; // prevent re-triggering on next iteration
                }

                successCount++;
            } catch (err) {
                console.error(`Error processing file ${file.name}:`, err);
                Swal.fire({
                    title: 'Upload Error',
                    text: `Error uploading ${file.name}:\n\n${err.message || err.toString()}`,
                    icon: 'error',
                    confirmButtonColor: '#0C3C67'
                });
            }
        }

        setIsProcessing(false);
        setProgress({ current: 0, total: 0, status: '' });

        Swal.fire({
            title: 'Upload Complete',
            text: `Successfully processed and uploaded ${successCount} out of ${files.length} photos.`,
            icon: 'success',
            confirmButtonColor: '#0C3C67',
            timer: 3000
        });

        // Refresh Gallery
        const updatedPhotos = await getEventPhotos(eventId);
        setPhotos(updatedPhotos);
    };

    const handleDeletePhoto = async (photoId, photoUrl) => {
        const result = await Swal.fire({
            title: 'Delete Photo?',
            text: "This photo will be permanently removed from the event gallery.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#0C3C67',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) return;

        try {
            // Note: In a full production app, you would also want to ping a backend to delete the 
            // file from Cloudinary storage to save space, but for now we just delete the document reference.
            await deleteEventPhoto(eventId, photoId);

            // Remove from local state immediately for snappy UI
            setPhotos(prev => prev.filter(p => p.id !== photoId));

            Swal.fire({
                title: 'Deleted!',
                text: 'The photo has been removed.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Error deleting photo:", error);
            Swal.fire({
                title: 'Error',
                text: 'Failed to delete photo. Check console.',
                icon: 'error',
                confirmButtonColor: '#0C3C67'
            });
        }
    };

    const handleViewPhoto = (index) => {
        setLightboxIndex(index);
    };

    const handleNextPhoto = () => {
        if (lightboxIndex !== null && lightboxIndex < photos.length - 1) {
            setLightboxIndex(prev => prev + 1);
        }
    };

    const handlePrevPhoto = () => {
        if (lightboxIndex !== null && lightboxIndex > 0) {
            setLightboxIndex(prev => prev - 1);
        }
    };

    const downloadPhoto = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `loyadham_photo_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(objectUrl);
        } catch (e) {
            window.open(url, '_blank');
        }
    };

    const handleDeleteAllPhotos = async () => {
        if (photos.length === 0) return;

        const result = await Swal.fire({
            title: 'Delete ALL Photos?',
            text: `Are you entirely sure you want to permanently delete all ${photos.length} photos from this event? This action cannot be undone.`,
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#0C3C67',
            confirmButtonText: 'Yes, DELETE ALL'
        });

        if (!result.isConfirmed) return;

        try {
            Swal.fire({
                title: 'Deleting...',
                html: 'Purging all event photos. Please wait.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading()
                }
            });

            // Delete each document sequentially (in production, use batched writes)
            for (const photo of photos) {
                await deleteEventPhoto(eventId, photo.id);
            }

            setPhotos([]); // Clear local state

            Swal.fire({
                title: 'Gallery Cleared',
                text: 'All photos have been successfully deleted.',
                icon: 'success',
                confirmButtonColor: '#0C3C67'
            });
        } catch (error) {
            console.error("Error deleting all photos:", error);
            Swal.fire({
                title: 'Error',
                text: 'Failed to delete all photos. Check console.',
                icon: 'error',
                confirmButtonColor: '#0C3C67'
            });
        }
    };

    if (!eventData) return <div className="p-20 text-center">Loading event data...</div>;

    return (
        <div>
            <div className="mb-8 border-b-2 border-gray-200 pb-6 flex justify-between items-end">
                <div>
                    <button onClick={() => navigate('/admin')} className="text-gray-500 hover:text-brand-navy mb-2 text-sm">
                        ← Back to Dashboard
                    </button>
                    <h2 className="text-3xl font-bold text-brand-navy">{eventData.name}</h2>
                    <p className="text-gray-600 mt-1">
                        {new Date(eventData.date || Date.now()).toLocaleDateString()} | {eventData.location}
                    </p>
                </div>
                <div>
                    <a target="_blank" href={`/event/${eventId}`} className="text-brand-gold font-bold hover:underline">
                        View Guest Page ↗
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Upload Panel */}
                <div className="lg:col-span-1">
                    <div className="glass-panel p-6 rounded-2xl sticky top-24">
                        <h3 className="text-xl font-bold text-brand-navy mb-4 heading-decorative">Upload Photos</h3>
                        <p className="text-sm text-gray-500 mb-6 text-center">
                            Select photos. Faces will be analyzed automatically before uploading.
                        </p>

                        {isProcessing ? (
                            <div className="text-center py-6">
                                <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-brand-navy font-bold">{progress.status}</p>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                                    <div className="bg-brand-navy h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-brand-navy border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <span className="text-3xl mb-2">📸</span>
                                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold text-brand-navy">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-gray-400">JPG or PNG</p>
                                </div>
                                <input type="file" className="hidden" multiple accept="image/jpeg, image/png" onChange={handleFileUpload} />
                            </label>
                        )}
                    </div>
                </div>

                {/* Gallery Panel */}
                <div className="lg:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-brand-navy">Event Gallery ({photos.length})</h3>
                        {photos.length > 0 && (
                            <button
                                onClick={handleDeleteAllPhotos}
                                className="text-sm bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete All Photos
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {photos.map((photo, index) => (
                            <div key={photo.id} onClick={() => handleViewPhoto(index)} className="aspect-square rounded-xl overflow-hidden shadow-sm relative group bg-gray-100 cursor-pointer">
                                <img
                                    src={photo.url.replace('/upload/', '/upload/w_500,c_fill,q_auto,f_auto/')}
                                    alt="Event"
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                    loading="lazy"
                                    decoding="async"
                                />

                                {/* Overlay showing faces detected */}
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm pointer-events-none">
                                    {(() => {
                                        try {
                                            const descriptors = JSON.parse(photo.descriptors || "[]");
                                            return `${descriptors.length} faces`;
                                        } catch (e) { return "0 faces"; }
                                    })()}
                                </div>

                                {/* Delete Button (Visible on Hover) */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePhoto(photo.id, photo.url);
                                    }}
                                    className="absolute top-2 right-2 bg-red-500/90 text-white p-2 text-sm rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                                    title="Delete Photo"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {photos.length === 0 && (
                            <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                No photos uploaded yet.
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Hidden image element strictly for FaceAPI to read image data */}
            <img ref={imgRef} alt="hidden-processing" style={{ display: 'none' }} />

            {/* Full Screen Lightbox */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center">
                    {/* Close Button */}
                    <button
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-6 right-6 text-white/50 hover:text-white text-5xl leading-none z-[110]"
                    >
                        ×
                    </button>

                    {/* Left Arrow */}
                    {lightboxIndex > 0 && (
                        <button
                            onClick={handlePrevPhoto}
                            className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-7xl p-4 z-[110]"
                        >
                            ‹
                        </button>
                    )}

                    {/* Main Image */}
                    <div className="max-w-5xl max-h-[90vh] px-4 md:px-16 flex flex-col items-center relative">
                        <img
                            src={photos[lightboxIndex]?.url}
                            alt="Preview"
                            className="max-h-[75vh] w-auto object-contain rounded-lg shadow-2xl"
                        />

                        {/* Download Button */}
                        <button
                            onClick={() => downloadPhoto(photos[lightboxIndex]?.url)}
                            className="mt-6 bg-brand-gold text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-[#b08d4a] flex items-center gap-2 transition-colors relative z-[110]"
                        >
                            <span>⬇</span> Download High-Resolution
                        </button>
                    </div>

                    {/* Right Arrow */}
                    {lightboxIndex < photos.length - 1 && (
                        <button
                            onClick={handleNextPhoto}
                            className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-7xl p-4 z-[110]"
                        >
                            ›
                        </button>
                    )}
                </div>
            )}

        </div>
    );
};

export default EventAdmin;
