import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSingleFaceDescriptor } from '../utils/faceApi';

const GuestSelfie = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();

    const videoRef = useRef(null);
    const canvasRef = useRef(null);


    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const stopCamera = useCallback(() => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
    }, []);

    const startCamera = useCallback(async () => {
        try {
            setError('');
            setPermissionDenied(false);
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' } // Use front camera
            });

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Camera error:", err);
            setPermissionDenied(true);
            setError('Camera access denied. Please allow camera permissions to scan your face.');
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        startCamera();
        return () => stopCamera(); // Cleanup when unmounting
    }, [startCamera, stopCamera]);

    const handleCapture = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setIsProcessing(true);

        // Draw current video frame to canvas
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
            // Extract Face
            const descriptor = await getSingleFaceDescriptor(canvas);

            if (!descriptor) {
                setIsProcessing(false);
                setError("No face detected! Please ensure your face is clearly visible and try again.");
                return;
            }

            // Success! Stop camera and navigate to gallery
            stopCamera();

            // Store the selfie descriptor in sessionStorage to pass it safely 
            // back to the GalleryView without enormous URL params.
            sessionStorage.setItem('guestSelfieDescriptor', JSON.stringify(descriptor));

            navigate(`/event/${eventId}/gallery`);

        } catch (err) {
            console.error("Scanning failed:", err);
            setError("Failed to process image. Please try again.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
            <div className="glass-panel p-6 md:p-8 rounded-2xl w-full max-w-lg text-center relative">
                <h2 className="text-2xl font-bold text-brand-navy mb-2 heading-decorative">Selfie Scan</h2>
                <p className="text-gray-500 mb-6 text-sm mt-3">Position your face in the frame.</p>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100 mb-6">
                        {error}
                    </div>
                )}

                {/* Camera Container */}
                <div className="relative w-full aspect-[3/4] bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center mb-6 border-4 border-gray-100">

                    {permissionDenied ? (
                        <div className="p-6 text-white text-center">
                            <span className="text-4xl block mb-2">📸</span>
                            <p className="mb-4">Camera access is required to find your photos.</p>
                            <button onClick={startCamera} className="bg-brand-navy px-4 py-2 rounded-lg font-semibold hover:bg-brand-charcoal">
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transform -scale-x-100 ${isProcessing ? 'opacity-50 blur-sm' : 'opacity-100'}`}
                        />
                    )}

                    {/* Processing Overlay */}
                    {isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10 text-white">
                            <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mb-4"></div>
                            <p className="font-bold tracking-widest uppercase">Scanning Face...</p>
                        </div>
                    )}

                    {/* Frame Guide */}
                    {!isProcessing && !permissionDenied && (
                        <div className="absolute inset-0 pointer-events-none border-2 border-white/20 m-8 rounded-[100%] border-dashed opacity-50"></div>
                    )}
                </div>

                {/* Action Button */}
                {!permissionDenied && (
                    <button
                        disabled={isProcessing}
                        onClick={handleCapture}
                        className="w-full bg-brand-gold text-white font-bold text-xl py-4 rounded-xl shadow-[0_4px_14px_0_rgba(197,160,89,0.39)] hover:shadow-[0_6px_20px_rgba(197,160,89,0.23)] hover:bg-[#b08d4a] transition-all disabled:opacity-50"
                    >
                        {isProcessing ? 'Processing...' : 'Capture'}
                    </button>
                )}

            </div>

            {/* Hidden canvas for image extraction */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

export default GuestSelfie;
