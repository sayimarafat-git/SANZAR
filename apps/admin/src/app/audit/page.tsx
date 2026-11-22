'use client';
import { Shell } from '@/components/Shell';
import { Loading, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtTime } from '@/lib/model';

interface Entry { id: string; actor_uid: string; actor_email: string | null; action: string; target: string; detail_json: string; created_at: number }

function Audit() {
  const { data, error, reload } = useLoad(() => api<{ entries: Entry[] }>('/v1/admin/audit'));
  if (!data) return <Loading error={error} onRetry={reload} />;
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Every admin change, newest first (last 100).</p>
      <div className="tablewrap"><table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{data.entries.map((e) => (
          <tr key={e.id}><td>{fmtTime(e.created_at)}</td><td>{e.actor_email ?? e.actor_uid}</td><td><code>{e.action}</code></td><td>{e.target}</td><td><small className="muted">{e.detail_json === "{}" ? "" : e.detail_json}</small></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

export default function Page() {
  return <Shell min="admin"><Audit /></Shell>;
}
