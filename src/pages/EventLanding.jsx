import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventById } from '../utils/db';
import { motion } from 'framer-motion';

const EventLanding = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const [eventData, setEventData] = useState(null);

    useEffect(() => {
        const fetchEvent = async () => {
            const data = await getEventById(eventId);
            if (data) setEventData(data);
            else navigate('/'); // Or an error page
        };
        fetchEvent();
    }, [eventId, navigate]);

    if (!eventData) return <div className="text-center p-20">Loading event...</div>;

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-0 rounded-2xl w-full max-w-2xl text-center shadow-2xl relative overflow-hidden text-brand-charcoal"
            >
                {/* Banner Image */}
                <div className="w-full h-48 md:h-64 bg-brand-charcoal relative">
                    {eventData.coverUrl ? (
                        <img src={eventData.coverUrl.replace('/upload/', '/upload/w_1000,q_auto,f_auto/')} className="w-full h-full object-cover opacity-90" alt="Cover" />
                    ) : (
                        <div className="absolute inset-0 opacity-20 bg-[url('/assets/pattern.png')] bg-cover"></div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent"></div>
                </div>

                <div className="p-8 md:p-12 relative z-10">
                    <h3 className="text-sm font-bold tracking-widest text-brand-gold uppercase mb-2">Welcome to</h3>
                    <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-4 font-sans">{eventData.name}</h2>

                    <div className="flex justify-center items-center gap-4 text-gray-600 mb-10">
                        <span className="flex items-center gap-1">📅 {new Date(eventData.date || Date.now()).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">📍 {eventData.location}</span>
                    </div>

                    <div className="bg-brand-light/50 p-6 rounded-xl border border-gray-100 mb-8 mx-auto max-w-md">
                        <p className="text-lg leading-relaxed">
                            Find all your photos instantly! Just take a quick selfie to let our AI scan the gallery and securely deliver your memories.
                        </p>
                    </div>

                    <button
                        onClick={() => navigate(`/event/${eventId}/scan`)}
                        className="bg-brand-navy text-white text-lg px-10 py-4 rounded-full font-bold shadow-[0_4px_14px_0_rgba(12,60,103,0.39)] hover:bg-brand-charcoal hover:scale-105 transition-all duration-300 w-full md:w-auto"
                    >
                        Find My Photos 📸
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default EventLanding;
