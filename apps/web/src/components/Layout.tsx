import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  BookOpen,
  ClipboardCheck,
  TrendingUp,
  Users,
  Sparkles,
  Shield,
  Bell,
  Sun,
  Moon,
  Monitor,
  Globe,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useSettings, type ThemeMode } from '../lib/settings-context';
import { apiRequest } from '../lib/api-client';
import type { AppNotification } from '../lib/models';
import { BrandMark, useToast } from './SanzarUI';

export const Layout: React.FC = () => {
  const { user, profile, isStaff, guestMode, signOut } = useAuth();
  const { lang, setLang, themeMode, setThemeMode, t } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: AppNotification[]; unread: number }>('/v1/notifications'),
    enabled: !!user,
    staleTime: 60_000,
  });

  const unread = notifQuery.data?.unread ?? 0;
  const notifications = notifQuery.data?.notifications ?? [];

  const handleMarkRead = async () => {
    try {
      await apiRequest('/v1/notifications/read', { method: 'POST', bodyJson: {} });
      await qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      toast(t('err.generic'));
    }
  };

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    setThemeMode(order[(order.indexOf(themeMode) + 1) % order.length]);
  };

  const navItems = [
    { to: '/', label: t('home'), icon: Home, end: true },
    { to: '/library', label: t('library'), icon: BookOpen },
    { to: '/exams', label: t('exams'), icon: ClipboardCheck },
    { to: '/progress', label: t('progress'), icon: TrendingUp },
    { to: '/community', label: t('community'), icon: Users },
    { to: '/tutor', label: t('tutor'), icon: Sparkles },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-sanzar-bg text-sanzar-text pb-16 md:pb-0">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-sanzar-surface/95 backdrop-blur border-b border-sanzar-border">
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

            {/* Theme switcher */}
            <button
              onClick={cycleTheme}
              title={`${t('theme')}: ${themeMode}`}
              className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-sanzar-text2 hover:text-sanzar-primary transition"
            >
              {themeMode === 'dark' ? (
                <Moon className="w-4 h-4" />
              ) : themeMode === 'light' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Monitor className="w-4 h-4" />
              )}
            </button>

            {/* Notifications */}
            {user && (
              <div className="relative">
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
                        {notifications.slice(0, 10).map((n) => (
                          <div
                            key={n.id}
                            className={`p-2.5 rounded-xl text-xs ${
                              n.read ? 'bg-sanzar-surface2/60' : 'bg-sanzar-primarySoft/60 border border-sanzar-border'
                            }`}
                          >
                            <p className={`font-semibold ${n.read ? 'text-sanzar-text2' : 'text-sanzar-text'}`}>
                              {n.title}
                            </p>
                            {n.body && <p className="text-sanzar-muted mt-0.5">{n.body}</p>}
                          </div>
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
                <button
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  title={t('signOut')}
                  className="p-2 text-sanzar-muted hover:text-sanzar-danger rounded-xl hover:bg-sanzar-surface2 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
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

      {/* Main Content + Right Navigation Panel */}
      <div className="flex-1 flex w-full max-w-7xl mx-auto">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>

        {/* Desktop Right Navigation Panel */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-l border-sanzar-border bg-sanzar-surface sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 justify-between">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-sanzar-primarySoft text-sanzar-primary'
                      : 'text-sanzar-text2 hover:bg-sanzar-surface2 hover:text-sanzar-text'
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
                `px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-sanzar-primarySoft text-sanzar-primary'
                    : 'text-sanzar-text2 hover:bg-sanzar-surface2 hover:text-sanzar-text'
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
                  `mt-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 ${
                    isActive
                      ? 'bg-sanzar-primary text-sanzar-onPrimary'
                      : 'text-sanzar-primary bg-sanzar-primarySoft/50 hover:bg-sanzar-primarySoft'
                  }`
                }
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>{t('adminDashboard')}</span>
              </NavLink>
            )}
          </nav>

          <div className="pt-4 border-t border-sanzar-border text-xs text-sanzar-muted space-y-1 px-1">
            <p className="font-semibold text-sanzar-text2 truncate">
              {profile?.display_name || user?.email?.split('@')[0] || 'SANZAR'}
            </p>
            <p className="truncate">{t('tagline')}</p>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="hidden md:block border-t border-sanzar-border bg-sanzar-surface py-5 mt-auto">
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

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sanzar-surface/95 backdrop-blur border-t border-sanzar-border flex items-center justify-around h-16 px-1">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold ${
                isActive ? 'text-sanzar-primary' : 'text-sanzar-muted'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="truncate max-w-[64px]">{item.label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/tutor"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl text-[11px] font-semibold ${
              isActive ? 'text-sanzar-primary' : 'text-sanzar-muted'
            }`
          }
        >
          <Sparkles className="w-5 h-5" />
          <span className="truncate max-w-[64px]">{t('tutor')}</span>
        </NavLink>
      </nav>
    </div>
  );
};
