import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventById, getEventPhotos } from '../utils/db';
import { findMatches } from '../utils/faceApi';

const GalleryView = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();

    const [eventData, setEventData] = useState(null);
    const [allPhotos, setAllPhotos] = useState([]);
    const [matchingPhotos, setMatchingPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selfieDescriptor, setSelfieDescriptor] = useState(null);
    const [matchThreshold, setMatchThreshold] = useState(0.45);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

    // Handle keyboard navigation for Lightbox
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (selectedPhotoIndex === null) return;
            if (e.key === 'Escape') setSelectedPhotoIndex(null);
            if (e.key === 'ArrowLeft') handlePrevPhoto();
            if (e.key === 'ArrowRight') handleNextPhoto();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPhotoIndex, handleNextPhoto, handlePrevPhoto]);

    const handleNextPhoto = useCallback(() => {
        if (selectedPhotoIndex !== null && selectedPhotoIndex < matchingPhotos.length - 1) {
            setSelectedPhotoIndex(prev => prev + 1);
        }
    }, [selectedPhotoIndex, matchingPhotos.length]);

    const handlePrevPhoto = useCallback(() => {
        if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
            setSelectedPhotoIndex(prev => prev - 1);
        }
    }, [selectedPhotoIndex]);

    useEffect(() => {
        // 1. Retrieve the saved selfie face descriptor
        const savedDescriptorJson = sessionStorage.getItem('guestSelfieDescriptor');
        if (!savedDescriptorJson) {
            navigate(`/event/${eventId}`);
            return;
        }

        try {
            const descriptor = JSON.parse(savedDescriptorJson);
            setSelfieDescriptor(descriptor);
            fetchAndMatchPhotos();
        } catch (e) {
            console.error("Failed to parse selfie data", e);
            navigate(`/event/${eventId}`);
        }
    }, [eventId, navigate, fetchAndMatchPhotos]);

    useEffect(() => {
        if (!allPhotos.length || !selfieDescriptor) return;

        const matches = allPhotos.filter(photo => {
            if (!photo.descriptors || photo.descriptors === "[]") return false;

            let parsedDescriptors = [];
            try {
                parsedDescriptors = JSON.parse(photo.descriptors);
            } catch (e) {
                console.error(e);
                return false;
            }

            if (!Array.isArray(parsedDescriptors) || parsedDescriptors.length === 0) return false;

            // findMatches checks the guest's face array against the array of faces in the photo
            return findMatches(selfieDescriptor, parsedDescriptors, matchThreshold);
        });

        // Sort newest first
        matches.sort((photoA, photoB) => {
            const timeA = (photoA.uploadedAt && typeof photoA.uploadedAt.toMillis === 'function') ? photoA.uploadedAt.toMillis() : 0;
            const timeB = (photoB.uploadedAt && typeof photoB.uploadedAt.toMillis === 'function') ? photoB.uploadedAt.toMillis() : 0;
            return timeB - timeA;
        });
        setMatchingPhotos(matches);
    }, [allPhotos, selfieDescriptor, matchThreshold]);

    const fetchAndMatchPhotos = useCallback(async () => {
        setLoading(true);
        try {
            // 2. Load Event Data
            const eventDetails = await getEventById(eventId);
            setEventData(eventDetails);

            // 3. Load All Photos for this event (matching is now handled by useEffect)
            const photos = await getEventPhotos(eventId);
            setAllPhotos(photos);
        } catch (error) {
            console.error("Error fetching and matching:", error);
        } finally {
            setLoading(false);
        }
    }, [eventId]);

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
            console.error(e);
            // Fallback for CORS issues if Cloudinary isn't configured for blob download
            window.open(url, '_blank');
        }
    };

    if (loading || !eventData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh]">
                <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full mb-4"></div>
                <p className="text-xl font-bold text-brand-navy">Searching gallery...</p>
                <p className="text-sm text-gray-500">Our AI is finding your beautiful moments.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="text-center mb-10 pt-4 border-b-2 border-brand-gold pb-6">
                <h2 className="text-3xl md:text-4xl font-bold text-brand-navy mb-2 heading-decorative">{eventData.name}</h2>
                <p className="text-gray-600 mb-6">We found <span className="font-bold text-brand-navy">{matchingPhotos.length}</span> photos of you!</p>

                {/* Strictness Slider */}
                <div className="max-w-md mx-auto bg-white p-4 rounded-xl shadow-sm border border-brand-navy/10 pt-4">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-semibold text-brand-navy">AI Search Tolerance</label>
                        <span className="text-xs bg-brand-light text-brand-navy px-2 py-1 rounded font-mono font-bold">
                            {matchThreshold.toFixed(2)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0.30"
                        max="0.80"
                        step="0.01"
                        value={matchThreshold}
                        onChange={(e) => setMatchThreshold(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-gold"
                    />
                    <div className="flex justify-between text-xs text-brand-gold mt-2 font-semibold">
                        <span>Strict Matches Only</span>
                        <span>Show More (Lenient)</span>
                    </div>
                </div>
            </div>

            {matchingPhotos.length === 0 ? (
                <div className="glass-panel p-12 rounded-2xl text-center max-w-lg mx-auto mt-10 shadow-lg">
                    <p className="text-6xl mb-4">📸</p>
                    <h3 className="text-xl font-bold text-brand-charcoal mb-2">No photos found yet</h3>
                    <p className="text-gray-500 mb-6">We couldn't find your face in the current uploads. The organizer might still be uploading photos.</p>
                    <button
                        onClick={() => navigate(`/event/${eventId}/scan`)}
                        className="text-brand-navy font-bold underline hover:text-brand-gold transition-colors"
                    >
                        Retake Selfie
                    </button>
                </div>
            ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
                    {matchingPhotos.map((photo, index) => (
                        <div
                            key={photo.id}
                            className="break-inside-avoid glass-panel rounded-xl overflow-hidden shadow-md group relative"
                        >
                            <img
                                src={photo.url?.replace('/upload/', '/upload/w_500,c_fill,q_auto,f_auto/') || ''}
                                alt={`Your Memory ${index + 1}`}
                                className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-[1.05]"
                                loading="lazy"
                                decoding="async"
                            />

                            {/* Click to Expand Overlay */}
                            <div
                                className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center cursor-pointer"
                                onClick={() => setSelectedPhotoIndex(index)}
                            >
                                <div className="bg-black/50 p-3 rounded-full backdrop-blur-sm transform scale-75 group-hover:scale-100 transition-all duration-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                </div>
                            </div>

                            {/* Hover Download Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); downloadPhoto(photo.url); }}
                                className="absolute bottom-3 right-3 bg-white text-brand-navy p-3 rounded-full shadow-lg opacity-0 group-hover:opacity-100 hover:bg-brand-gold hover:text-white transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-10"
                                title="Download Photo"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-12 text-center pb-8 border-t border-gray-200 pt-8">
                <button
                    onClick={() => navigate(`/event/${eventId}/scan`)}
                    className="text-gray-500 hover:text-brand-navy text-sm flex items-center justify-center gap-2 mx-auto"
                >
                    <span>↺</span> Scan a different face
                </button>
            </div>

            {/* Full Screen Lightbox */}
            {selectedPhotoIndex !== null && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center">
                    {/* Close Button */}
                    <button
                        onClick={() => setSelectedPhotoIndex(null)}
                        className="absolute top-6 right-6 text-white/50 hover:text-white text-5xl leading-none z-[110]"
                    >
                        ×
                    </button>

                    {/* Left Arrow */}
                    {selectedPhotoIndex > 0 && (
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
                            src={matchingPhotos[selectedPhotoIndex]?.url}
                            alt="Preview"
                            className="max-h-[75vh] w-auto object-contain rounded-lg shadow-2xl"
                        />

                        {/* Download Button */}
                        <button
                            onClick={() => downloadPhoto(matchingPhotos[selectedPhotoIndex]?.url)}
                            className="mt-6 bg-brand-gold text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-[#b08d4a] flex items-center gap-2 transition-colors relative z-[110]"
                        >
                            <span>⬇</span> Download High-Resolution
                        </button>
                    </div>

                    {/* Right Arrow */}
                    {selectedPhotoIndex < matchingPhotos.length - 1 && (
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

export default GalleryView;
