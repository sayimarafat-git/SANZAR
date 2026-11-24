import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { LEVELS, fmtTime } from '../../lib/models';
import { ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';
import type { AdminContent } from './AdminContentPage';

const fromLocalDt = (v: string) => (v ? new Date(v).getTime() : null);
const toLocalDt = (ms: number | null | undefined) => {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const AdminAnnouncementsPage: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });
  const cfgQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ config: Record<string, unknown> }>('/v1/config'),
  });

  const [bannerText, setBannerText] = useState('');
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerExpires, setBannerExpires] = useState('');
  const [bannerBusy, setBannerBusy] = useState(false);

  useEffect(() => {
    if (!cfgQuery.data) return;
    const b = cfgQuery.data.config.banner as { text?: string; enabled?: boolean; expires_at?: number | null } | undefined;
    if (b && typeof b === 'object') {
      setBannerText(typeof b.text === 'string' ? b.text : '');
      setBannerEnabled(b.enabled !== false);
      setBannerExpires(toLocalDt(b.expires_at ?? null));
    } else {
      setBannerText(typeof cfgQuery.data.config.notice === 'string' ? cfgQuery.data.config.notice : '');
      setBannerEnabled(true);
      setBannerExpires('');
    }
  }, [cfgQuery.data]);

  const saveBanner = async () => {
    setErr(null);
    setBannerBusy(true);
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
      void qc.invalidateQueries({ queryKey: ['config'] });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBannerBusy(false);
    }
  };

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushLevel, setPushLevel] = useState('');
  const [pushBusy, setPushBusy] = useState(false);

  const publish = async () => {
    if (title.trim().length < 2 || !body.trim()) {
      setErr('Write a title and a message.');
      return;
    }
    const expMs = fromLocalDt(expiresAt);
    if (expMs != null && Number.isNaN(expMs)) {
      setErr('Invalid expiration time.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/announcements', {
        method: 'POST',
        bodyJson: { title: title.trim(), body: body.trim(), expires_at: expMs },
      });
      toast('Published to every student');
      setTitle('');
      setBody('');
      setExpiresAt('');
      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendPush = async () => {
    if (pushTitle.trim().length < 2) {
      setErr('Push notification title must be at least 2 characters.');
      return;
    }
    setErr(null);
    setPushBusy(true);
    try {
      const res = await apiRequest<{ sent: number }>('/v1/admin/notifications', {
        method: 'POST',
        bodyJson: {
          title: pushTitle.trim(),
          body: pushBody.trim(),
          ...(pushLevel ? { level_id: pushLevel } : {}),
        },
      });
      toast(`Push notification sent to ${res.sent} user(s)`);
      setPushTitle('');
      setPushBody('');
      setPushLevel('');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Announcements &amp; Push Notifications</h1>

      {/* Student Home Top Banner (moved from Settings) */}
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
          disabled={bannerBusy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
        >
          Save banner
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="sanzar-card p-5 space-y-3 text-xs font-semibold text-sanzar-text2">
          <h2 className="text-base font-bold text-sanzar-text">New announcement</h2>
          <label className="block space-y-1">
            <span>Title</span>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span>Message</span>
            <textarea
              rows={4}
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span>Expires at <small className="font-normal text-sanzar-muted">(optional)</small></span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <div>
            <button
              onClick={publish}
              disabled={busy}
              className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
            >
              Publish announcement
            </button>
          </div>
        </div>

        <div className="sanzar-card p-5 space-y-3 text-xs font-semibold text-sanzar-text2">
          <h2 className="text-base font-bold text-sanzar-text">Push notifications</h2>
          <label className="block space-y-1">
            <span>Title</span>
            <input
              value={pushTitle}
              maxLength={120}
              onChange={(e) => setPushTitle(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span>Message <small className="font-normal text-sanzar-muted">(optional)</small></span>
            <textarea
              rows={4}
              value={pushBody}
              maxLength={500}
              onChange={(e) => setPushBody(e.target.value)}
              className="sanzar-input text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span>Audience</span>
            <select
              value={pushLevel}
              onChange={(e) => setPushLevel(e.target.value)}
              className="sanzar-input text-sm"
            >
              <option value="">All students</option>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} learners
                </option>
              ))}
            </select>
          </label>
          <div>
            <button
              onClick={sendPush}
              disabled={pushBusy}
              className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
            >
              Send push notification
            </button>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-sanzar-danger font-semibold">{err}</p>}

      <h2 className="text-lg font-bold">Published announcements</h2>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-3">
          {q.data.announcements.map((a) => {
            const expired = a.expires_at != null && a.expires_at <= Date.now();
            return (
              <div key={a.id} className="sanzar-card p-5 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{a.title}</b>
                    {a.expires_at != null && (
                      <span className={`sanzar-pill ${expired ? 'archived' : 'published'}`}>
                        {expired ? 'Expired' : `Expires ${fmtTime(a.expires_at)}`}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-sanzar-muted">{fmtTime(a.created_at)}</span>
                </div>
              <p className="text-sm text-sanzar-text2 whitespace-pre-wrap">{a.body}</p>
              {confirmId === a.id ? (
                <div className="flex items-center gap-2 text-xs">
                  <span>Delete for everyone?</span>
                  <button
                    onClick={async () => {
                      await apiRequest(`/v1/admin/announcements/${a.id}`, { method: 'DELETE' });
                      toast('Deleted');
                      setConfirmId(null);
                      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
                    }}
                    className="px-3 py-1 rounded-lg border border-sanzar-danger text-sanzar-danger font-semibold"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="px-3 py-1 rounded-lg border border-sanzar-border font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(a.id)}
                  className="px-3 py-1 rounded-lg border border-sanzar-danger text-sanzar-danger text-xs font-semibold"
                >
                  Delete
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
