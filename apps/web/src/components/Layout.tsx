import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  BookOpen,
  BookA,
  ClipboardCheck,
  TrendingUp,
  Users,
  Sparkles,
  Shield,
  Bell,
  Sun,
  Moon,
  Globe,
  LogOut,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/settings-context';
import { apiRequest } from '../lib/api-client';
import type { AppNotification } from '../lib/models';
import { AmbientBackdrop, BrandMark, useToast } from './SanzarUI';
import { FirstVisitOnboarding, PostLoginOnboarding, postOnboardedKey } from './OnboardingFlow';
import { FloatingTutorWidget } from './FloatingTutorWidget';

type NotifData = { notifications: AppNotification[]; unread: number };

export const Layout: React.FC = () => {
  const { user, profile, profileLoaded, loading, isStaff, guestMode, signOut } = useAuth();
  const { lang, setLang, themeMode, setThemeMode, t } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const qc = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const notifWrapRef = useRef<HTMLDivElement>(null);

  const [firstOnbDismissed, setFirstOnbDismissed] = useState(
    () => localStorage.getItem('sanzar.onboarded') === '1'
  );
  const [postOnbDone, setPostOnbDone] = useState(false);

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<NotifData>('/v1/notifications'),
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const unread = notifQuery.data?.unread ?? 0;
  const notifications = notifQuery.data?.notifications ?? [];

  const handleMarkRead = async () => {
    qc.setQueryData<NotifData>(['notifications'], (prev) =>
      prev ? { notifications: prev.notifications.map((n) => ({ ...n, read: true })), unread: 0 } : prev
    );
    try {
      await apiRequest('/v1/notifications/read', { method: 'POST', bodyJson: {} });
    } catch {
      await qc.invalidateQueries({ queryKey: ['notifications'] });
      toast(t('err.generic'));
    }
  };

  const handleMarkOneRead = async (n: AppNotification) => {
    if (n.read) return;
    qc.setQueryData<NotifData>(['notifications'], (prev) => {
      if (!prev) return prev;
      const next = prev.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      return { notifications: next, unread: next.filter((x) => !x.read).length };
    });
    try {
      await apiRequest('/v1/notifications/read', { method: 'POST', bodyJson: { id: n.id } });
    } catch {
      await qc.invalidateQueries({ queryKey: ['notifications'] });
      toast(t('err.generic'));
    }
  };

  const toggleTheme = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };

  const navItems = [
    { to: '/', label: t('home'), icon: Home, end: true },
    { to: '/library', label: t('library'), icon: BookOpen },
    { to: '/dictionary', label: t('dictionary'), icon: BookA },
    { to: '/exams', label: t('exams'), icon: ClipboardCheck },
    { to: '/progress', label: t('progress'), icon: TrendingUp },
    { to: '/community', label: t('community'), icon: Users },
  ];

  const hideTutorFab = ['/login', '/register', '/forgot-password'].includes(location.pathname);
  const showFirstVisitOnboarding = !loading && !user && !firstOnbDismissed;
  const showPostLoginOnboarding =
    !!user &&
    profileLoaded &&
    !!profile &&
    !profile.onboarding_completed &&
    localStorage.getItem(postOnboardedKey(user.uid)) !== '1' &&
    !postOnbDone;

  return (
    <div className="min-h-screen flex flex-col text-sanzar-text pb-24 md:pb-0 relative">
      <AmbientBackdrop />
      {/* Top Navbar (iOS Frosted Glass) */}
      <header className="sticky top-0 z-40 sanzar-glass-bar border-x-0 border-t-0 rounded-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <BrandMark size={36} />
              <div className="leading-tight">
                <span className="font-extrabold text-lg tracking-tight block">SANZAR</span>
                <span className="hidden lg:block text-[11px] text-sanzar-muted font-medium">
                  {t('tagline')}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <div className="relative flex items-center">
              <Globe className="w-4 h-4 text-sanzar-muted absolute left-2.5 pointer-events-none" />
              <select
                aria-label={t('language')}
                value={lang}
                onChange={(e) => {
                  const v = e.target.value as 'bn' | 'en' | 'zh';
                  setLang(v);
                  if (user) {
                    apiRequest('/v1/me', { method: 'PATCH', bodyJson: { locale: v } }).catch(() => {});
                  }
                }}
                className="pl-8 pr-2 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-xs font-semibold text-sanzar-text cursor-pointer"
              >
                <option value="bn">বাংলা</option>
                <option value="en">EN</option>
                <option value="zh">中文</option>
              </select>
            </div>

            {/* Theme switcher (Light / Dark) */}
            <button
              onClick={toggleTheme}
              title={themeMode === 'dark' ? t('themeDark') : t('themeLight')}
              aria-label={themeMode === 'dark' ? t('themeDark') : t('themeLight')}
              className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-sanzar-text2 hover:text-sanzar-primary transition"
            >
              {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            {user && (
              <div ref={notifWrapRef} className="relative">
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label={t('notifications')}
                  className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-sanzar-text2 hover:text-sanzar-primary transition relative"
                >
                  <Bell className="w-4 h-4" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-sanzar-danger text-white text-[10px] font-bold flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sanzar-card shadow-xl p-3 z-50">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-sanzar-border">
                      <span className="font-bold text-sm">{t('notifications')}</span>
                      {unread > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkRead}
                          className="text-xs font-semibold text-sanzar-primary hover:underline"
                        >
                          {t('markAllRead')}
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-sanzar-muted py-4 text-center">{t('noNotifications')}</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto space-y-2">
                        {notifications.slice(0, 15).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => void handleMarkOneRead(n)}
                            className={`w-full text-left p-2.5 rounded-xl text-xs transition flex items-start gap-2 ${
                              n.read
                                ? 'bg-sanzar-surface2/60 hover:bg-sanzar-surface2'
                                : 'bg-sanzar-primarySoft/70 border border-sanzar-primary/25 hover:bg-sanzar-primarySoft'
                            }`}
                          >
                            {!n.read && <span className="w-2 h-2 rounded-full bg-sanzar-primary shrink-0 mt-1" />}
                            <div className="min-w-0 flex-1">
                              <p className={`font-semibold ${n.read ? 'text-sanzar-text2' : 'text-sanzar-text'}`}>
                                {n.title}
                              </p>
                              {n.body && <p className="text-sanzar-muted mt-0.5">{n.body}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Auth / Profile */}
            {user ? (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-sanzar-surface2 text-sm font-semibold"
                >
                  <div className="w-7 h-7 rounded-full bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center font-bold text-xs">
                    {(profile?.display_name || user.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:inline-block max-w-[110px] truncate">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-sm font-semibold text-sanzar-text2 hover:bg-sanzar-surface2 rounded-xl transition"
                >
                  {t('signIn')}
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-1.5 text-sm font-semibold text-sanzar-onPrimary bg-sanzar-primary rounded-xl shadow-sm hover:opacity-95 transition hidden sm:inline-block"
                >
                  {t('getStarted')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Guest banner */}
      {!user && guestMode && (
        <div className="bg-sanzar-primarySoft border-b border-sanzar-border text-sanzar-primary text-xs font-semibold py-2 px-4 text-center flex items-center justify-center gap-3">
          <span>{t('guestMode')}</span>
          <Link to="/login" className="underline font-bold">
            {t('signIn')}
          </Link>
        </div>
      )}

      {/* Left Navigation Panel + Main Content (iOS Glass Shell) */}
      <div className="flex-1 flex w-full max-w-7xl mx-auto">
        {/* Desktop Left Navigation Panel */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 sticky top-20 h-[calc(100vh-6rem)] my-4 ml-4 lg:ml-6 rounded-[22px] sanzar-glass overflow-y-auto p-3.5 justify-between">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-sanzar-primarySoft text-sanzar-primary shadow-sm ring-1 ring-white/40 dark:ring-white/10'
                      : 'text-sanzar-text2 hover:bg-white/45 dark:hover:bg-white/5 hover:text-sanzar-text'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-sanzar-primarySoft text-sanzar-primary shadow-sm ring-1 ring-white/40 dark:ring-white/10'
                    : 'text-sanzar-text2 hover:bg-white/45 dark:hover:bg-white/5 hover:text-sanzar-text'
                }`
              }
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              <span>{t('profile')}</span>
            </NavLink>

            {isStaff && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `mt-2 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-sanzar-primary text-sanzar-onPrimary shadow-sm'
                      : 'text-sanzar-primary bg-sanzar-primarySoft/80 hover:bg-sanzar-primarySoft'
                  }`
                }
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>{t('adminDashboard')}</span>
              </NavLink>
            )}
          </nav>

          <div className="pt-4 border-t border-sanzar-border text-xs text-sanzar-muted space-y-1 px-1.5">
            <p className="font-semibold text-sanzar-text2 truncate">
              {profile?.display_name || user?.email?.split('@')[0] || 'SANZAR'}
            </p>
            <p className="truncate">{t('tagline')}</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="hidden md:block sanzar-glass-bar border-x-0 border-b-0 rounded-none py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-sanzar-muted gap-2">
          <p>© 2026 SANZAR — {t('tagline')}</p>
          <div className="flex items-center gap-3">
            {isStaff && (
              <Link to="/admin" className="text-sanzar-primary font-semibold hover:underline">
                {t('adminDashboard')}
              </Link>
            )}
            <Link to="/profile" className="hover:underline flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5" /> {t('profile')}
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile Floating Glass Bottom Dock (Tutor moved to floating bottom-right corner) */}
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 rounded-[24px] sanzar-glass-bar flex items-center justify-around h-16 px-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-semibold ${
                isActive ? 'text-sanzar-primary' : 'text-sanzar-muted'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            <span className="truncate max-w-[52px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom-right Floating AI Tutor Chatbot Widget & Button */}
      <FloatingTutorWidget open={tutorOpen && !hideTutorFab} onClose={() => setTutorOpen(false)} />
      {!hideTutorFab && (
        <button
          type="button"
          onClick={() => setTutorOpen((v) => !v)}
          aria-expanded={tutorOpen}
          aria-label={t('tutor')}
          className="fixed right-5 bottom-24 md:bottom-6 z-40 px-4 py-3 rounded-2xl bg-brand-grad text-white font-bold text-sm shadow-xl hover:scale-[1.03] active:scale-[0.98] transition flex items-center gap-2 ring-1 ring-white/30"
        >
          {tutorOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
          <span className="hidden sm:inline">{t('tutor')}</span>
        </button>
      )}

      {/* First-visit & Post-login Onboarding Flows */}
      {showFirstVisitOnboarding && (
        <FirstVisitOnboarding
          onDone={(goTo) => {
            setFirstOnbDismissed(true);
            if (goTo) navigate(goTo);
          }}
        />
      )}
      {showPostLoginOnboarding && (
        <PostLoginOnboarding onCompleted={() => setPostOnbDone(true)} />
      )}
    </div>
  );
};
