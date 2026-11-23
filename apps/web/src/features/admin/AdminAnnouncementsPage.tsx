import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { fmtTime } from '../../lib/models';
import { ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';
import type { AdminContent } from './AdminContentPage';

export const AdminAnnouncementsPage: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (title.trim().length < 2 || !body.trim()) {
      setErr('Write a title and a message.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/announcements', {
        method: 'POST',
        bodyJson: { title: title.trim(), body: body.trim() },
      });
      toast('Published to every student');
      setTitle('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Announcements</h1>
      <div className="sanzar-card p-5 space-y-3 text-xs font-semibold text-sanzar-text2">
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
        {err && <p className="text-sanzar-danger">{err}</p>}
        <div>
          <button
            onClick={publish}
            disabled={busy}
            className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      <h2 className="text-lg font-bold">Published</h2>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-3">
          {q.data.announcements.map((a) => (
            <div key={a.id} className="sanzar-card p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <b className="text-sm">{a.title}</b>
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
          ))}
        </div>
      )}
    </div>
  );
};
