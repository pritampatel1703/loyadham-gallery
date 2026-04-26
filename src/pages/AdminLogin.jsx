import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin, loginWithGoogle, resetPassword } from '../utils/auth';
import { ALLOWED_ADMINS } from '../config/admins';

const AdminLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            await loginAdmin(email, password);
            navigate('/admin');
        } catch (err) {
            if (err.message === "unauthorized_email") {
                setError('This email is not authorized as an Admin.');
            } else {
                setError('Invalid email or password.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setMessage('');
        setLoading(true);
        try {
            await loginWithGoogle();
            navigate('/admin');
        } catch (err) {
            if (err.message === "unauthorized_email") {
                setError('This Google account is not authorized as an Admin.');
            } else {
                setError('Google sign-in failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!email) {
            setError('Please enter your email address first to reset the password.');
            return;
        }
        setError('');
        setMessage('');
        setLoading(true);
        try {
            await resetPassword(email);
            setMessage('Password reset email sent! Please check your inbox.');
        } catch (err) {
            setError('Failed to send reset email. Please ensure the email is correct.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center pt-20 pb-40">
            <div className="glass-panel p-10 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
                {/* Decorative Top Border */}
                <div className="absolute top-0 left-0 w-full h-2 bg-brand-gold"></div>

                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-brand-navy mb-2">Admin Portal</h2>
                    <div className="h-1 w-16 bg-brand-gold mx-auto rounded-full mb-4"></div>
                    <p className="text-sm text-gray-500">Secure access for event organizers</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-lg text-sm mb-6 text-center">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="bg-green-50 text-green-600 border border-green-200 p-3 rounded-lg text-sm mb-6 text-center">
                        {message}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-brand-charcoal mb-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-gold focus:border-transparent outline-none transition-all"
                            placeholder="admin@loyadham.in"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-brand-charcoal">Password</label>
                            <button 
                                type="button" 
                                onClick={handleResetPassword}
                                className="text-sm text-brand-navy hover:text-brand-gold transition-colors"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-gold focus:border-transparent outline-none transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-navy text-white rounded-lg py-3 font-semibold hover:bg-brand-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
                    >
                        {loading ? 'Authenticating...' : 'Sign In with Email'}
                    </button>

                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">or</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full bg-white border border-gray-300 text-gray-700 rounded-lg py-3 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Sign in with Google
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
