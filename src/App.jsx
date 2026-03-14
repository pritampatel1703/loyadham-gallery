import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import EventAdmin from './pages/EventAdmin';
import EventLanding from './pages/EventLanding';
import GuestSelfie from './pages/GuestSelfie';
import GalleryView from './pages/GalleryView';
import GuestHome from './pages/GuestHome';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full flex flex-col font-sans bg-brand-light">
        {/* Simple Global Header matching Loyadham */}
        <header className="shrink-0 bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center border-b-4 border-brand-navy">
            <Link to="/" className="text-2xl font-bold text-brand-navy flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-brand-gold">❖</span> Loyadham Gallery
            </Link>
            <Link to="/admin" className="text-sm font-semibold text-gray-500 hover:text-brand-navy transition-colors">
              Admin Portal →
            </Link>
          </div>
        </header>

        <main className="flex-grow shrink-0 max-w-7xl w-full mx-auto px-4 py-8">
          <Routes>
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/event/:eventId" element={<EventAdmin />} />

            {/* Guest/Event Routes */}
            <Route path="/" element={<GuestHome />} />
            <Route path="/event/:eventId" element={<EventLanding />} />
            <Route path="/event/:eventId/scan" element={<GuestSelfie />} />
            <Route path="/event/:eventId/gallery" element={<GalleryView />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Global Footer */}
        <footer className="shrink-0 w-full bg-white border-t border-gray-200 py-6 mt-auto flex justify-center">
          <div className="w-full max-w-7xl px-4 text-center">
            <p className="text-sm text-gray-500">
              Copyright © {new Date().getFullYear()}, Shree Swaminarayan Mandir Loyadham. All Rights Reserved.
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
