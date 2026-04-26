import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../config/firebase";
import { ALLOWED_ADMINS } from "../config/admins";

export const loginAdmin = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userEmail = userCredential.user.email?.toLowerCase();

        if (!ALLOWED_ADMINS.includes(userEmail)) {
            await logoutAdmin();
            throw new Error("unauthorized_email");
        }

        return userCredential.user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
};

export const loginWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const userEmail = result.user.email?.toLowerCase();

        // Check if the email is in the allowed list
        if (!ALLOWED_ADMINS.includes(userEmail)) {
            await logoutAdmin();
            throw new Error("unauthorized_email");
        }
        return result.user;
    } catch (error) {
        console.error("Google Login Error:", error);
        throw error;
    }
};

export const logoutAdmin = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
        throw error;
    }
};

export const resetPassword = async (email) => {
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (error) {
        console.error("Password Reset Error:", error);
        throw error;
    }
};
