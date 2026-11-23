import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';

const XP_FIELDS: [string, string][] = [
  ['resourceComplete', 'Finishing notes or a material'],
  ['quizCorrect', 'Each correct exam answer'],
  ['dailyGoal', 'Reaching the daily goal'],
  ['post', 'First community post of the day'],
];
const DEFAULT_XP: Record<string, number> = {
  resourceComplete: 10,
  quizCorrect: 5,
  dailyGoal: 20,
  post: 5,
};

const toLocalDt = (ms: number | null | undefined) => {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const AdminSettingsPage: React.FC = () => {
  const toast = useToast();
  const q = useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ config: Record<string, unknown> }>('/v1/config'),
  });

  const [xp, setXp] = useState<Record<string, string>>({});
  const [bannerText, setBannerText] = useState('');
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerExpires, setBannerExpires] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const cur = { ...DEFAULT_XP, ...((q.data.config.xp as Record<string, number>) ?? {}) };
    setXp(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, String(v)])));
    const b = q.data.config.banner as { text?: string; enabled?: boolean; expires_at?: number | null } | undefined;
    if (b && typeof b === 'object') {
      setBannerText(typeof b.text === 'string' ? b.text : '');
      setBannerEnabled(b.enabled !== false);
      setBannerExpires(toLocalDt(b.expires_at ?? null));
    } else {
      setBannerText(typeof q.data.config.notice === 'string' ? q.data.config.notice : '');
      setBannerEnabled(true);
      setBannerExpires('');
    }
  }, [q.data]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const saveXp = async () => {
    const vals = Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, Number(v)]));
    if (Object.values(vals).some((v) => !Number.isInteger(v) || v < 0 || v > 1000)) {
      setErr('XP values must be whole numbers from 0 to 1000.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/config/xp', { method: 'PUT', bodyJson: { value: vals } });
      toast('Saved');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveBanner = async () => {
    setErr(null);
    setBusy(true);
    try {
      const exp = bannerExpires ? new Date(bannerExpires).getTime() : null;
      await apiRequest('/v1/admin/config/banner', {
        method: 'PUT',
        bodyJson: {
          value: {
            enabled: bannerEnabled,
            text: bannerText.trim(),
            expires_at: exp && !Number.isNaN(exp) ? exp : null,
          },
        },
      });
      toast('Banner saved');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const runMigrate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ applied?: string[] }>('/v1/admin/migrate', {
        method: 'POST',
        bodyJson: {},
      });
      toast(res.applied?.length ? `Applied: ${res.applied.join(', ')}` : 'Schema up to date');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <div className="sanzar-card p-5 space-y-4">
        <h2 className="text-lg font-bold">XP points</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
          {XP_FIELDS.map(([k, label]) => (
            <label key={k} className="space-y-1">
              <span>{label}</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={xp[k] ?? ''}
                onChange={(e) => setXp({ ...xp, [k]: e.target.value })}
                className="sanzar-input text-sm"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-sanzar-muted">
          Changes apply to new activity only. Points already earned are not recalculated.
        </p>
        <button
          onClick={saveXp}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
        >
          Save XP
        </button>
      </div>

      <div className="sanzar-card p-5 space-y-3 text-xs font-semibold text-sanzar-text2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-sanzar-text">Banner</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bannerEnabled}
              onChange={(e) => setBannerEnabled(e.target.checked)}
              className="accent-sanzar-primary"
            />
            <span>Active</span>
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span>
              Banner message <small className="font-normal text-sanzar-muted">(shown at the top of student home)</small>
            </span>
            <input
              value={bannerText}
              maxLength={300}
              onChange={(e) => setBannerText(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span>Expires at <small className="font-normal text-sanzar-muted">(optional)</small></span>
            <input
              type="datetime-local"
              value={bannerExpires}
              onChange={(e) => setBannerExpires(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
        </div>
        <button
          onClick={saveBanner}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
        >
          Save banner
        </button>
      </div>

      <div className="sanzar-card p-5 space-y-3">
        <h2 className="text-lg font-bold">Database migrations</h2>
        <p className="text-xs text-sanzar-muted">
          Apply pending D1 SQL schema migrations (owner / super_admin only).
        </p>
        <button
          onClick={runMigrate}
          disabled={busy}
          className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold hover:bg-sanzar-surface2"
        >
          Run migrations
        </button>
      </div>

      {err && <div className="text-sm text-sanzar-danger">{err}</div>}
    </div>
  );
};
