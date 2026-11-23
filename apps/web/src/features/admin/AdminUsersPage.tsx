import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth-context';
import { apiRequest, errorText } from '../../lib/api-client';
import { ROLES, ROLE_RANK, fmtTime, type Role } from '../../lib/models';
import { ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';

interface AdminUserRow {
  uid: string;
  email: string;
  display_name: string;
  role: Role;
  level_id: string;
  blocked: number;
  created_at: number;
  last_seen_at: number | null;
}

export const AdminUsersPage: React.FC = () => {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [qInput, setQInput] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () =>
      apiRequest<{ users: AdminUserRow[] }>(
        `/v1/admin/users?limit=100${search ? `&q=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const canEdit = (u: AdminUserRow) =>
    me && u.uid !== me.uid && ROLE_RANK[u.role] < ROLE_RANK[me.role];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Users &amp; roles</h1>
      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(qInput.trim());
        }}
      >
        <input
          placeholder="Search name or email"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="sanzar-input text-sm"
        />
        <button className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold">
          Search
        </button>
      </form>
      <p className="text-xs text-sanzar-muted">
        Only the super admin can change roles. Admins can block students and lower roles.
      </p>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="sanzar-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Class</th>
                <th className="p-3 font-semibold">Joined</th>
                <th className="p-3 font-semibold">Last seen</th>
                <th className="p-3 font-semibold">Role</th>
                <th className="p-3 font-semibold">Blocked</th>
              </tr>
            </thead>
            <tbody>
              {q.data.users.map((u) => (
                <tr key={u.uid} className="border-b border-sanzar-border last:border-0">
                  <td className="p-3">
                    <b>{u.display_name || '—'}</b>
                    <div className="text-xs text-sanzar-muted">{u.email}</div>
                  </td>
                  <td className="p-3">{u.level_id || '—'}</td>
                  <td className="p-3 text-xs">{fmtTime(u.created_at)}</td>
                  <td className="p-3 text-xs">{fmtTime(u.last_seen_at)}</td>
                  <td className="p-3">
                    {me?.role === 'super_admin' && u.uid !== me.uid ? (
                      <select
                        value={u.role}
                        disabled={busy}
                        onChange={async (e) => {
                          setBusy(true);
                          try {
                            await apiRequest(`/v1/admin/users/${u.uid}/role`, {
                              method: 'PUT',
                              bodyJson: { role: e.target.value },
                            });
                            toast('Role changed');
                            void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
                          } catch (err) {
                            toast(errorText(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="sanzar-input text-xs py-1"
                      >
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="sanzar-pill">{u.role}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!u.blocked}
                      disabled={busy || !canEdit(u)}
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await apiRequest(`/v1/admin/users/${u.uid}/block`, {
                            method: 'PUT',
                            bodyJson: { blocked: e.target.checked },
                          });
                          toast(e.target.checked ? 'Blocked' : 'Unblocked');
                          void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
                        } catch (err) {
                          toast(errorText(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
