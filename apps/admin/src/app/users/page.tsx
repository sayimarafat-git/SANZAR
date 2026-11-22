'use client';
import { useState } from 'react';
import { Shell, useMe } from '@/components/Shell';
import { Errors, Loading, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLES, ROLE_RANK, fmtTime, type Role } from '@/lib/model';

interface U { uid: string; email: string; display_name: string; role: Role; level_id: string; blocked: number; created_at: number; last_seen_at: number | null }

function Users() {
  const me = useMe();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, reload } = useLoad(() => api<{ users: U[] }>(`/v1/admin/users?limit=100${search ? `&q=${encodeURIComponent(search)}` : ''}`), [search]);
  const { busy, errors, save } = useSaver();
  const canEdit = (u: U) => u.uid !== me.uid && ROLE_RANK[u.role] < ROLE_RANK[me.role];
  return (
    <>
      <h1>Users &amp; roles</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }} style={{ marginBottom: 12 }}>
        <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <button>Search</button>
      </form>
      <p className="muted">Only the super admin can change roles. Admins can block students and lower roles. Blocked users can read but cannot post or change anything.</p>
      <Errors list={errors} />
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>User</th><th>Class</th><th>Joined</th><th>Last seen</th><th>Role</th><th>Blocked</th></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.uid}>
              <td><b>{u.display_name || '—'}</b><br /><small className="muted">{u.email}</small></td>
              <td>{u.level_id}</td><td>{fmtTime(u.created_at)}</td><td>{fmtTime(u.last_seen_at)}</td>
              <td>{me.role === 'super_admin' && u.uid !== me.uid ? (
                <select value={u.role} disabled={busy} aria-label={`Role for ${u.email}`} onChange={async (e) => { if (await save(() => api(`/v1/admin/users/${u.uid}/role`, { method: 'PUT', body: { role: e.target.value } }), 'Role changed')) reload(); }}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              ) : <span className="pill">{u.role}</span>}</td>
              <td><input type="checkbox" style={{ width: 'auto' }} aria-label={`Block ${u.email}`} checked={!!u.blocked} disabled={busy || !canEdit(u)}
                onChange={async (e) => { if (await save(() => api(`/v1/admin/users/${u.uid}/block`, { method: 'PUT', body: { blocked: e.target.checked } }), e.target.checked ? 'Blocked' : 'Unblocked')) reload(); }} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell min="admin"><Users /></Shell>;
}
