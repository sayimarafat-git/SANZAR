import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  LogOut,
  Trash2,
  Shield,
  TrendingUp,
  ClipboardCheck,
  Trophy,
  CloudOff,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings, type ThemeMode } from '../../lib/settings-context';
import { apiRequest, fetchCatalogWithCache } from '../../lib/api-client';
import { localizedName, type Lang } from '../../lib/i18n';
import { LEVELS, type AppNotification } from '../../lib/models';
import { Modal, useToast } from '../../components/SanzarUI';

export const ProfilePage: React.FC = () => {
  const { user, profile, isStaff, guestMode, updateProfile, deleteAccount, signOut } = useAuth();
  const { lang, setLang, themeMode, setThemeMode, t } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
  });

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: AppNotification[]; unread: number }>('/v1/notifications'),
    enabled: !!user,
  });

  const [name, setName] = useState(profile?.display_name || '');
  const [levelId, setLevelId] = useState(profile?.level_id || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [group, setGroup] = useState(profile?.grp || '');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(
    profile?.profile_visibility || 'private'
  );
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name || '');
    setLevelId(profile.level_id || '');
    setInstitution(profile.institution || '');
    setGroup(profile.grp || '');
    setVisibility(profile.profile_visibility || 'private');
  }, [profile]);

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('profile')}</h1>
        <p className="text-sm text-sanzar-text2">
          {guestMode ? t('guestMode') : t('tagline')}
        </p>
        <Link
          to="/login"
          className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
        >
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const levels = catQuery.data?.catalog.levels?.length
    ? catQuery.data.catalog.levels
    : LEVELS.map((l) => ({ id: l.id, name_en: l.name, name_bn: l.name_bn, name_zh: l.name_zh }));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast(t('err.name'));
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        display_name: name.trim(),
        institution: institution.trim(),
        ...(group.trim().length >= 2 ? { grp: group.trim() } : {}),
        ...(levelId ? { level_id: levelId } : {}),
        profile_visibility: visibility,
      });
      toast(t('saved'));
    } catch {
      toast(t('err.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('profile')}</h1>
        {catQuery.data?.offline && (
          <span className="sanzar-pill gap-1">
            <CloudOff className="w-3.5 h-3.5" /> {t('offline')}
          </span>
        )}
      </div>

      {/* Header Card */}
      <div className="sanzar-card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-sanzar-primarySoft text-sanzar-primary font-black text-2xl flex items-center justify-center shrink-0">
          {(profile?.display_name || user.email || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-lg truncate">{profile?.display_name || user.email}</h2>
          <p className="text-sm text-sanzar-muted truncate">{profile?.email || user.email}</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {levelId && (
              <span className="sanzar-pill">
                {localizedName(levels.find((l) => l.id === levelId), lang, levelId)}
              </span>
            )}
            {isStaff && <span className="sanzar-pill published">{profile?.role}</span>}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/progress" className="sanzar-card p-3.5 flex items-center gap-2.5 text-sm font-semibold hover:border-sanzar-primary/50">
          <TrendingUp className="w-4 h-4 text-sanzar-primary" /> {t('progress')}
        </Link>
        <Link to="/exams" className="sanzar-card p-3.5 flex items-center gap-2.5 text-sm font-semibold hover:border-sanzar-primary/50">
          <ClipboardCheck className="w-4 h-4 text-sanzar-primary" /> {t('exams')}
        </Link>
        <Link to="/progress?tab=leaderboard" className="sanzar-card p-3.5 flex items-center gap-2.5 text-sm font-semibold hover:border-sanzar-primary/50">
          <Trophy className="w-4 h-4 text-sanzar-primary" /> {t('leaderboard')}
        </Link>
        {isStaff && (
          <Link to="/admin" className="sanzar-card p-3.5 flex items-center gap-2.5 text-sm font-semibold text-sanzar-primary hover:border-sanzar-primary">
            <Shield className="w-4 h-4" /> {t('adminDashboard')}
          </Link>
        )}
      </div>

      {/* Edit Profile Form */}
      <form onSubmit={saveProfile} className="sanzar-card p-6 space-y-4">
        <h2 className="font-bold text-base">{t('editProfile')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('class')}</span>
            <select
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              className="sanzar-input text-sm"
            >
              <option value="">—</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {localizedName(l, lang, l.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('institution')}</span>
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              maxLength={100}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('group')}</span>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              maxLength={40}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2 sm:col-span-2">
            <span>{t('visibility')}</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'followers' | 'private')}
              className="sanzar-input text-sm"
            >
              <option value="public">{t('visPublic')}</option>
              <option value="followers">{t('visFollowers')}</option>
              <option value="private">{t('visPrivate')}</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm disabled:opacity-50"
        >
          {saving ? '…' : t('save')}
        </button>
      </form>

      {/* App Settings (Language & Theme) */}
      <div className="sanzar-card p-6 space-y-4">
        <h2 className="font-bold text-base">{t('settings')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('language')}</span>
            <select
              value={lang}
              onChange={(e) => {
                const v = e.target.value as Lang;
                setLang(v);
                void updateProfile({ locale: v }).catch(() => {});
              }}
              className="sanzar-input text-sm"
            >
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>{t('theme')}</span>
            <select
              value={themeMode}
              onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
              className="sanzar-input text-sm"
            >
              <option value="system">{t('themeSystem')}</option>
              <option value="light">{t('themeLight')}</option>
              <option value="dark">{t('themeDark')}</option>
            </select>
          </label>
        </div>
      </div>

      {/* Notifications Summary */}
      <div className="sanzar-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-sanzar-primary" /> {t('notifications')}
          </h2>
          {(notifQuery.data?.unread ?? 0) > 0 && (
            <button
              onClick={async () => {
                await apiRequest('/v1/notifications/read', { method: 'POST', bodyJson: {} });
                await notifQuery.refetch();
              }}
              className="text-xs font-semibold text-sanzar-primary hover:underline"
            >
              {t('markAllRead')}
            </button>
          )}
        </div>
        {(notifQuery.data?.notifications.length ?? 0) === 0 ? (
          <p className="text-xs text-sanzar-muted">{t('noNotifications')}</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {notifQuery.data!.notifications.slice(0, 10).map((n) => (
              <div key={n.id} className="p-3 rounded-xl bg-sanzar-surface2 text-xs">
                <p className="font-bold">{n.title}</p>
                {n.body && <p className="text-sanzar-muted mt-0.5">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div className="sanzar-card p-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="px-4 py-2 rounded-xl border border-sanzar-border font-semibold text-sm flex items-center gap-2 hover:bg-sanzar-surface2"
        >
          <LogOut className="w-4 h-4" /> {t('signOut')}
        </button>
        <button
          onClick={() => setDeleteOpen(true)}
          className="px-4 py-2 rounded-xl border border-sanzar-danger text-sanzar-danger font-semibold text-sm flex items-center gap-2 hover:bg-sanzar-danger/10"
        >
          <Trash2 className="w-4 h-4" /> {t('deleteAccount')}
        </button>
      </div>

      {deleteOpen && (
        <Modal title={t('deleteAccount')} onClose={() => setDeleteOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-sanzar-text2">{t('deleteConfirm')}</p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              className="sanzar-input text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold"
              >
                {t('cancel')}
              </button>
              <button
                disabled={deleteText.trim() !== 'DELETE'}
                onClick={async () => {
                  try {
                    await deleteAccount();
                    navigate('/');
                  } catch {
                    toast(t('recentLogin'));
                  }
                }}
                className="px-4 py-2 rounded-xl bg-sanzar-danger text-white text-sm font-semibold disabled:opacity-40"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
