import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBPebaoNhlTPznrnp55dzmDv5rMjw24enU",
    authDomain: "loyadham-gallery-2b8d5.firebaseapp.com",
    projectId: "loyadham-gallery-2b8d5",
    storageBucket: "loyadham-gallery-2b8d5.firebasestorage.app",
    messagingSenderId: "308350552590",
    appId: "1:308350552590:web:b4f1a6174e0cf95a9b8a5f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
