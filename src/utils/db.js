import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "firebase/firestore";
import { db } from "../config/firebase";

export const getEvents = async () => {
    const eventsCol = collection(db, 'events');
    const eventSnapshot = await getDocs(eventsCol);
    return eventSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createEvent = async (eventData) => {
    const eventsCol = collection(db, 'events');
    const docRef = await addDoc(eventsCol, {
        ...eventData,
        createdAt: serverTimestamp()
    });
    return docRef.id;
};

export const getEventById = async (eventId) => {
    const eventRef = doc(db, 'events', eventId);
    const eventSnap = await getDoc(eventRef);

    if (eventSnap.exists()) {
        return { id: eventSnap.id, ...eventSnap.data() };
    } else {
        return null;
    }
};

export const updateEvent = async (eventId, eventData) => {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, eventData);
};

export const savePhotoMetadata = async (eventId, photoUrl, descriptors) => {
    const photosCol = collection(db, `events/${eventId}/photos`);
    const docRef = await addDoc(photosCol, {
        url: photoUrl,
        // Firestore doesn't support nested arrays. 
        // We must stringify the array of 128-dimensional float arrays.
        descriptors: JSON.stringify(descriptors),
        uploadedAt: serverTimestamp()
    });
    return docRef.id;
};

export const getEventPhotos = async (eventId) => {
    const photosCol = collection(db, `events/${eventId}/photos`);
    const photoSnapshot = await getDocs(photosCol);
    return photoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const deleteEventPhoto = async (eventId, photoId) => {
    const photoRef = doc(db, `events/${eventId}/photos`, photoId);
    await deleteDoc(photoRef);
};

export const deleteEvent = async (eventId) => {
    // 1. Delete all photos in the subcollection first
    const photosCol = collection(db, `events/${eventId}/photos`);
    const photoSnapshot = await getDocs(photosCol);
    for (const d of photoSnapshot.docs) {
        await deleteDoc(d.ref);
    }

    // 2. Delete the event document
    const eventRef = doc(db, 'events', eventId);
    await deleteDoc(eventRef);
};
