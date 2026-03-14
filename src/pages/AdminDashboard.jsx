import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { logoutAdmin } from '../utils/auth';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../utils/db';
import { uploadToCloudinary } from '../utils/cloudinary';
import { ALLOWED_ADMINS } from '../config/admins';
import Swal from 'sweetalert2';

const AdminDashboard = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    // Create state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newEventName, setNewEventName] = useState('');
    const [newEventDate, setNewEventDate] = useState('');
    const [newEventLocation, setNewEventLocation] = useState('');
    const [newEventCoverFile, setNewEventCoverFile] = useState(null);

    // Edit state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editEventId, setEditEventId] = useState('');
    const [editEventName, setEditEventName] = useState('');
    const [editEventDate, setEditEventDate] = useState('');
    const [editEventLocation, setEditEventLocation] = useState('');
    const [editEventCoverFile, setEditEventCoverFile] = useState(null);

    const [isUploading, setIsUploading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (!user) {
                navigate('/admin/login');
            } else if (!ALLOWED_ADMINS.includes(user.email?.toLowerCase())) {
                logoutAdmin().then(() => navigate('/admin/login'));
            } else {
                loadEvents();
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const loadEvents = async () => {
        setLoading(true);
        try {
            const data = await getEvents();
            setEvents(data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
        } catch (error) {
            console.error("Failed to load events", error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logoutAdmin();
        navigate('/admin/login');
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        setIsUploading(true);
        try {
            let coverUrl = '';
            // Upload cover completely optional
            if (newEventCoverFile) {
                coverUrl = await uploadToCloudinary(newEventCoverFile);
            }

            await createEvent({
                name: newEventName,
                date: newEventDate,
                location: newEventLocation,
                coverUrl: coverUrl
            });

            setShowCreateModal(false);
            setNewEventName('');
            setNewEventDate('');
            setNewEventLocation('');
            setNewEventCoverFile(null);

            Swal.fire({ title: 'Created', text: 'Event created successfully!', icon: 'success', timer: 1500, showConfirmButton: false });
            await loadEvents();
        } catch (error) {
            console.error("Error creating event", error);
            Swal.fire({ title: 'Error', text: 'Failed to create event', icon: 'error', confirmButtonColor: '#0C3C67' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleEditClick = (e, event) => {
        e.stopPropagation();
        setEditEventId(event.id);
        setEditEventName(event.name || '');
        setEditEventDate(event.date || '');
        setEditEventLocation(event.location || '');
        setEditEventCoverFile(null);
        setShowEditModal(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setIsUploading(true);
        try {
            let updates = {
                name: editEventName,
                date: editEventDate,
                location: editEventLocation
            };

            if (editEventCoverFile) {
                const coverUrl = await uploadToCloudinary(editEventCoverFile);
                updates.coverUrl = coverUrl;
            }

            await updateEvent(editEventId, updates);

            setShowEditModal(false);
            Swal.fire({ title: 'Updated', text: 'Event updated successfully!', icon: 'success', timer: 1500, showConfirmButton: false });
            await loadEvents();
        } catch (error) {
            console.error("Error updating event", error);
            Swal.fire({ title: 'Error', text: 'Failed to update event', icon: 'error', confirmButtonColor: '#0C3C67' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        const result = await Swal.fire({
            title: 'Delete Entire Event?',
            text: "This will permanently delete the event AND all associated photos. This cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#0C3C67',
            confirmButtonText: 'Yes, DELETE EVERYTHING'
        });

        if (!result.isConfirmed) return;

        setIsUploading(true);
        try {
            await deleteEvent(eventId);
            setShowEditModal(false);
            Swal.fire({ title: 'Deleted', text: 'Event and all photos were wiped.', icon: 'success', timer: 1500, showConfirmButton: false });
            await loadEvents();
        } catch (error) {
            console.error("Error deleting event", error);
            Swal.fire({ title: 'Error', text: 'Failed to delete event', icon: 'error', confirmButtonColor: '#0C3C67' });
        } finally {
            setIsUploading(false);
        }
    };

    const openEventAdmin = (eventId) => {
        navigate(`/admin/event/${eventId}`);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-brand-navy">Dashboard</h2>
                    <p className="text-gray-500">Manage your events and galleries</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-brand-navy text-white px-6 py-2 rounded-lg font-semibold hover:bg-opacity-90 transition-all shadow-md flex items-center gap-2"
                    >
                        <span>+</span> New Event
                    </button>
                    <button
                        onClick={handleLogout}
                        className="bg-white border-2 border-brand-charcoal text-brand-charcoal px-4 py-2 rounded-lg font-semibold hover:bg-gray-50 transition-all"
                    >
                        Sign Out
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-10 h-10 border-4 border-brand-gold border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.length === 0 ? (
                        <div className="col-span-full glass-panel p-12 text-center rounded-2xl">
                            <p className="text-gray-500 text-lg mb-4">No events found. Create your first event to get started.</p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="text-brand-navy font-semibold underline"
                            >
                                Create Event
                            </button>
                        </div>
                    ) : (
                        events.map(event => (
                            <div
                                key={event.id}
                                onClick={() => openEventAdmin(event.id)}
                                className="glass-panel rounded-2xl overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 border-b-4 border-brand-gold group"
                            >
                                <div className="h-40 bg-brand-charcoal relative overflow-hidden">
                                    {event.coverUrl ? (
                                        <img src={event.coverUrl.replace('/upload/', '/upload/w_500,q_auto,f_auto/')} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Cover" />
                                    ) : (
                                        <div className="absolute inset-0 opacity-20 bg-[url('/assets/pattern.png')] bg-cover"></div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pb-2 z-10">
                                        <h3 className="font-bold text-xl text-white truncate drop-shadow-md">{event.name}</h3>
                                    </div>

                                    {/* Edit Button overlay */}
                                    <button
                                        onClick={(e) => handleEditClick(e, event)}
                                        className="absolute top-3 right-3 bg-white/90 text-brand-navy p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-gold hover:text-white z-20"
                                        title="Edit Event"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="p-4 bg-white relative z-20">
                                    <p className="text-sm text-gray-600 mb-1">📅 {new Date(event.date || Date.now()).toLocaleDateString()}</p>
                                    <p className="text-sm text-gray-600">📍 {event.location || 'N/A'}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Create Event Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="glass-panel bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-black">✕</button>
                        <h3 className="text-2xl font-bold text-brand-navy mb-6 text-center">Create New Event</h3>
                        <form onSubmit={handleCreateEvent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                                <input required type="text" value={newEventName} onChange={e => setNewEventName(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" placeholder="e.g. 11th Patotsav" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input required type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                <input required type="text" value={newEventLocation} onChange={e => setNewEventLocation(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" placeholder="e.g. Loyadham, NJ" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image (Optional)</label>
                                <input type="file" accept="image/*" onChange={e => setNewEventCoverFile(e.target.files[0])} className="w-full px-4 py-2 border rounded-lg bg-gray-50 text-sm" />
                            </div>
                            <button disabled={isUploading} type="submit" className="w-full bg-brand-navy text-white py-3 rounded-lg font-bold mt-4 hover:bg-brand-charcoal transition-colors disabled:opacity-50">
                                {isUploading ? 'Saving...' : 'Create Event'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Event Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="glass-panel bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
                        <button onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-black">✕</button>
                        <h3 className="text-2xl font-bold text-brand-navy mb-6 text-center">Edit Event</h3>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                                <input required type="text" value={editEventName} onChange={e => setEditEventName(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input required type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                <input required type="text" value={editEventLocation} onChange={e => setEditEventLocation(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-gold outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Update Cover Image (Optional)</label>
                                <input type="file" accept="image/*" onChange={e => setEditEventCoverFile(e.target.files[0])} className="w-full px-4 py-2 border rounded-lg bg-gray-50 text-sm" />
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button disabled={isUploading} type="submit" className="flex-1 bg-brand-navy text-white py-3 rounded-lg font-bold hover:bg-brand-charcoal transition-colors disabled:opacity-50">
                                    {isUploading ? 'Saving Details...' : 'Save Changes'}
                                </button>
                                <button type="button" onClick={() => handleDeleteEvent(editEventId)} disabled={isUploading} className="bg-red-50 text-red-600 px-6 py-3 rounded-lg font-bold border border-red-200 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50">
                                    Delete Event
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
