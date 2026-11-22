'use client';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, Status, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtTime } from '@/lib/model';

interface Report { id: string; target_type: string; target_id: string; reason: string; status: string; created_at: number; post_text: string | null; post_status: string | null; comment_text: string | null }

function Moderation() {
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useLoad(() => api<{ reports: Report[] }>(`/v1/admin/reports?status=${status}`), [status]);
  const { busy, errors, save } = useSaver();
  const act = async (r: Report, action: string) => { if (await save(() => api(`/v1/admin/reports/${r.id}`, { method: 'PUT', body: { action } }), action === 'remove' ? 'Removed' : action === 'restore' ? 'Restored' : 'Dismissed')) reload(); };
  // Group reports of the same item together.
  const groups = new Map<string, Report[]>();
  for (const r of data?.reports ?? []) groups.set(`${r.target_type}:${r.target_id}`, [...(groups.get(`${r.target_type}:${r.target_id}`) ?? []), r]);
  return (
    <>
      <div className="top"><h1>Moderation</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="open">Open</option><option value="actioned">Removed</option><option value="dismissed">Dismissed</option></select>
      </div>
      <p className="muted">A post is hidden automatically after 3 reports from different students. Remove it, or restore it if the reports were wrong.</p>
      <Errors list={errors} />
      {!data ? <Loading error={error} onRetry={reload} /> : groups.size === 0 ? <p>Nothing to review.</p> : (
        <div className="stack">
          {[...groups.values()].map((rs) => {
            const r = rs[0];
            return (
              <div key={r.id} className="card stack">
                <div className="row"><b>{r.target_type}</b>{r.post_status && <Status s={r.post_status} />}<span className="muted">{rs.length} report(s) · {fmtTime(r.created_at)}</span></div>
                <blockquote style={{ margin: 0, padding: '8px 12px', borderLeft: '3px solid var(--border)' }}>{r.post_text ?? r.comment_text ?? <span className="muted">{r.target_id}</span>}</blockquote>
                <ul style={{ margin: 0 }}>{rs.map((x) => <li key={x.id}>{x.reason}</li>)}</ul>
                {status === 'open' && (
                  <div className="row">
                    {(r.target_type === 'post' || r.target_type === 'comment') && <button className="danger" disabled={busy} onClick={() => act(r, 'remove')}>Remove</button>}
                    {r.post_status === 'held' && <button disabled={busy} onClick={() => act(r, 'restore')}>Restore</button>}
                    <button disabled={busy} onClick={() => act(r, 'dismiss')}>Dismiss</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell min="moderator"><Moderation /></Shell>;
}
