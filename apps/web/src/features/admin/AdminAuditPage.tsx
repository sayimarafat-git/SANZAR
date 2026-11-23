import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { fmtTime } from '../../lib/models';
import { ErrorRetry, LoadingState } from '../../components/SanzarUI';

interface Entry {
  id: string;
  actor_uid: string;
  actor_email: string | null;
  action: string;
  target: string;
  detail_json: string;
  created_at: number;
}

export const AdminAuditPage: React.FC = () => {
  const q = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => apiRequest<{ entries: Entry[] }>('/v1/admin/audit'),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Audit log</h1>
      <p className="text-xs text-sanzar-muted">Every admin change, newest first (last 100).</p>
      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">When</th>
              <th className="p-3 font-semibold">Who</th>
              <th className="p-3 font-semibold">Action</th>
              <th className="p-3 font-semibold">Target</th>
              <th className="p-3 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {q.data.entries.map((e) => (
              <tr key={e.id} className="border-b border-sanzar-border last:border-0">
                <td className="p-3 text-xs whitespace-nowrap">{fmtTime(e.created_at)}</td>
                <td className="p-3 text-xs">{e.actor_email ?? e.actor_uid}</td>
                <td className="p-3">
                  <code className="text-xs bg-sanzar-surface2 px-1.5 py-0.5 rounded">{e.action}</code>
                </td>
                <td className="p-3 text-xs">{e.target}</td>
                <td className="p-3 text-xs text-sanzar-muted">
                  {e.detail_json === '{}' ? '' : e.detail_json}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
