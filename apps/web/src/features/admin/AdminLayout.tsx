import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { atLeast, type Role } from '../../lib/models';
import { AmbientBackdrop, BrandMark, LoadingState } from '../../components/SanzarUI';

const NAV: { to: string; label: string; min: Role; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', min: 'moderator', end: true },
  { to: '/admin/content', label: 'Content', min: 'content_admin' },
  { to: '/admin/dictionary', label: 'Dictionary', min: 'content_admin' },
  { to: '/admin/exams', label: 'Exams', min: 'content_admin' },
  { to: '/admin/users', label: 'Users', min: 'admin' },
  { to: '/admin/moderation', label: 'Moderation', min: 'moderator' },
  { to: '/admin/announcements', label: 'Announcements', min: 'admin' },
  { to: '/admin/audit', label: 'Audit', min: 'admin' },
  { to: '/admin/settings', label: 'Settings', min: 'admin' },
];

export const AdminLayout: React.FC = () => {
  const { user, profile, loading, isStaff } = useAuth();
  const { themeMode, setThemeMode, t } = useSettings();

  if (loading) return <LoadingState />;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="sanzar-card p-8 max-w-sm w-full text-center space-y-4">
          <div className="flex items-center justify-center gap-2.5">
            <BrandMark size={36} />
            <span className="font-extrabold text-lg">Sanzar Admin</span>
          </div>
          <p className="text-sm text-sanzar-muted">Sign in with a staff account to access the Admin Dashboard.</p>
          <Link
            to="/login"
            className="block w-full py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="sanzar-card p-8 max-w-md w-full space-y-4">
          <h1 className="text-xl font-bold">No access</h1>
          <p className="text-sm text-sanzar-text2">
            {profile?.email || user.email} is a student account ({profile?.role || 'student'}). Ask the owner to give you a staff role.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Student App
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[248px_1fr] text-sanzar-text relative">
      <AmbientBackdrop />
      <aside className="sanzar-glass md:m-4 md:mr-0 md:rounded-[22px] p-4 md:sticky md:top-4 md:h-[calc(100vh-2rem)] overflow-y-auto flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 font-extrabold px-1.5 mb-5">
            <BrandMark size={34} />
            <div className="leading-tight">
              <span className="block text-sm">Sanzar</span>
              <span className="block text-xs font-medium text-sanzar-muted">Admin</span>
            </div>
          </div>

          <nav className="flex md:flex-col flex-wrap gap-1">
            {NAV.filter((n) => atLeast(profile?.role, n.min)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `block px-3.5 py-2.5 rounded-2xl text-sm font-medium transition ${
                    isActive
                      ? 'bg-sanzar-primarySoft text-sanzar-primary font-semibold shadow-sm ring-1 ring-white/40 dark:ring-white/10'
                      : 'text-sanzar-text2 hover:bg-white/45 dark:hover:bg-white/5 hover:text-sanzar-primary'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-3 pt-3 border-t border-sanzar-border">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="text-xs text-sanzar-muted space-y-1 min-w-0">
              <p className="truncate font-semibold text-sanzar-text2">
                {profile?.display_name || profile?.email}
              </p>
              <span className="sanzar-pill">{profile?.role}</span>
            </div>
            <button
              type="button"
              onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              title={themeMode === 'dark' ? t('themeDark') : t('themeLight')}
              aria-label={t('theme')}
              className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-sanzar-text2 hover:text-sanzar-primary transition shrink-0"
            >
              {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-sanzar-border text-xs font-semibold hover:bg-white/45 dark:hover:bg-white/5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Student App
          </Link>
        </div>
      </aside>

      <main className="p-6 md:px-8 min-w-0 max-w-6xl w-full">
        <Outlet />
      </main>
    </div>
  );
};

export const RoleGuard: React.FC<{ min: Role; children: React.ReactNode }> = ({ min, children }) => {
  const { profile } = useAuth();
  if (!atLeast(profile?.role, min)) {
    return (
      <div className="p-4 rounded-xl border border-sanzar-danger/40 bg-sanzar-danger/10 text-sanzar-danger text-sm">
        Your role ({profile?.role}) cannot open this page.
      </div>
    );
  }
  return <>{children}</>;
};
