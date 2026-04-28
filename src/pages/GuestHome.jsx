import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEvents } from '../utils/db';

const GuestHome = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const loadEvents = async () => {
            try {
                const data = await getEvents();
                // Sort by newest first
                setEvents(data.sort((eventA, eventB) => {
                    const timeA = (eventA.createdAt && typeof eventA.createdAt.toMillis === 'function') ? eventA.createdAt.toMillis() : 0;
                    const timeB = (eventB.createdAt && typeof eventB.createdAt.toMillis === 'function') ? eventB.createdAt.toMillis() : 0;
                    return timeB - timeA;
                }));
            } catch (error) {
                console.error("Failed to load events", error);
            } finally {
                setLoading(false);
            }
        };
        loadEvents();
    }, []);

    return (
        <div className="pt-10 pb-20 max-w-4xl mx-auto">
            <div className="text-center mb-12">
                <h2 className="text-4xl font-bold text-brand-navy mb-4 heading-decorative">Welcome to Loyadham Gallery</h2>
                <p className="text-gray-600 text-lg">Select an event below to find your photos.</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-12 h-12 border-4 border-brand-gold border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {events.length === 0 ? (
                        <div className="col-span-full text-center text-gray-500 py-10">
                            No public events available at the moment.
                        </div>
                    ) : (
                        events.map(event => (
                            <div
                                key={event.id}
                                onClick={() => navigate(`/event/${event.id}`)}
                                className="glass-panel p-0 rounded-2xl cursor-pointer hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 border-b-4 border-brand-gold text-center group overflow-hidden flex flex-col"
                            >
                                <div className="h-48 bg-brand-charcoal relative overflow-hidden shrink-0">
                                    {event.coverUrl ? (
                                        <img src={event.coverUrl.replace('/upload/', '/upload/w_800,q_auto,f_auto/')} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Cover" />
                                    ) : (
                                        <div className="absolute inset-0 opacity-20 bg-[url('/assets/pattern.png')] bg-cover"></div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent"></div>
                                </div>
                                <div className="p-6 flex-grow flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-2xl font-bold text-brand-navy mb-3 group-hover:text-brand-gold transition-colors">{event.name}</h3>
                                        <div className="text-sm text-gray-600 space-y-1 mb-6">
                                            <p className="flex items-center justify-center gap-2"><span>📅</span> {new Date(event.date || Date.now()).toLocaleDateString()}</p>
                                            <p className="flex items-center justify-center gap-2"><span>📍</span> {event.location || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <button className="w-full bg-brand-navy text-white px-6 py-3 rounded-full font-bold opacity-90 group-hover:opacity-100 transition-opacity shadow-md">
                                        View Event Gallery →
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default GuestHome;
