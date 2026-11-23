import React from 'react';
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { BookOpen, Shield, LogOut, User as UserIcon, Home, Compass, Layers } from 'lucide-react';

export const Layout: React.FC = () => {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-green-600 to-emerald-500 flex items-center justify-center text-white font-black text-xl shadow-sm">
                S
              </div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                SANZAR
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname === '/' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Home
              </Link>
              <Link
                to="/learn"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname.startsWith('/learn') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Learn
              </Link>
              <Link
                to="/dictionary"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname.startsWith('/dictionary') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dictionary
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                    location.pathname.startsWith('/admin') ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-emerald-700 hover:bg-emerald-50/50'
                  }`}
                >
                  <Shield className="w-4 h-4" /> Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Link to="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 text-sm font-medium">
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <span className="hidden sm:inline-block max-w-[120px] truncate">{profile?.display_name || user.email?.split('@')[0]}</span>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 SANZAR. All rights reserved. Learn Today, Lead Tomorrow.</p>
          <div className="flex items-center gap-4">
            <span>Offline-Ready Android App Available</span>
            <span>•</span>
            <span>Cloudflare Pages &amp; Worker Powered</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
