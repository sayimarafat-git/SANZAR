import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { fmtTime } from '../../lib/models';
import { ErrorRetry, LoadingState, StatusPill, useToast } from '../../components/SanzarUI';

interface Report {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: number;
  post_text: string | null;
  post_status: string | null;
  comment_text: string | null;
}

export const AdminModerationPage: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => apiRequest<{ reports: Report[] }>(`/v1/admin/reports?status=${status}`),
  });

  const act = async (r: Report, action: string) => {
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/reports/${r.id}`, {
        method: 'PUT',
        bodyJson: { action },
      });
      toast(action === 'remove' ? 'Removed' : action === 'restore' ? 'Restored' : 'Dismissed');
      void qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const groups = new Map<string, Report[]>();
  for (const r of q.data?.reports ?? []) {
    const key = `${r.target_type}:${r.target_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Moderation</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="sanzar-input text-sm w-auto"
        >
          <option value="open">Open</option>
          <option value="actioned">Removed</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>
      <p className="text-xs text-sanzar-muted">
        A post is hidden automatically after 3 reports from different students. Remove it, or restore it if the reports were wrong.
      </p>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : groups.size === 0 ? (
        <p className="text-sm text-sanzar-muted">Nothing to review.</p>
      ) : (
        <div className="space-y-3">
          {[...groups.values()].map((rs) => {
            const r = rs[0];
            return (
              <div key={r.id} className="sanzar-card p-5 space-y-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <b className="text-sm uppercase">{r.target_type}</b>
                  {r.post_status && <StatusPill s={r.post_status} />}
                  <span className="text-xs text-sanzar-muted">
                    {rs.length} report(s) · {fmtTime(r.created_at)}
                  </span>
                </div>
                <blockquote className="pl-3 border-l-2 border-sanzar-border text-sm">
                  {r.post_text ?? r.comment_text ?? <span className="text-sanzar-muted">{r.target_id}</span>}
                </blockquote>
                <ul className="list-disc pl-5 text-xs text-sanzar-text2 space-y-0.5">
                  {rs.map((x) => (
                    <li key={x.id}>{x.reason}</li>
                  ))}
                </ul>
                {status === 'open' && (
                  <div className="flex gap-2">
                    {(r.target_type === 'post' || r.target_type === 'comment') && (
                      <button
                        disabled={busy}
                        onClick={() => act(r, 'remove')}
                        className="px-3.5 py-1.5 rounded-xl border border-sanzar-danger text-sanzar-danger text-xs font-semibold"
                      >
                        Remove
                      </button>
                    )}
                    {r.post_status === 'held' && (
                      <button
                        disabled={busy}
                        onClick={() => act(r, 'restore')}
                        className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold"
                      >
                        Restore
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => act(r, 'dismiss')}
                      className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
