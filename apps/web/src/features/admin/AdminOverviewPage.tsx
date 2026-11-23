import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { ErrorRetry, LoadingState } from '../../components/SanzarUI';

interface Stats {
  users: number;
  active1d: number;
  active7d: number;
  new7d: number;
  studyHours7d: number;
  exams7d: number;
  posts7d: number;
  openReports: number;
  publishedBooks: number;
}

export const AdminOverviewPage: React.FC = () => {
  const q = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiRequest<Stats>('/v1/admin/stats'),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) {
    return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;
  }

  const data = q.data;
  const tiles: [string, number | string][] = [
    ['Students', data.users],
    ['Active today', data.active1d],
    ['Active this week', data.active7d],
    ['New this week', data.new7d],
    ['Study hours (7 days)', data.studyHours7d],
    ['Exams taken (7 days)', data.exams7d],
    ['Posts (7 days)', data.posts7d],
    ['Published books', data.publishedBooks],
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="sanzar-card p-4">
            <b className="block text-2xl font-extrabold">{value}</b>
            <span className="text-xs text-sanzar-muted font-medium">{label}</span>
          </div>
        ))}
      </div>
      {data.openReports > 0 && (
        <p className="text-sm font-semibold">
          <Link to="/admin/moderation" className="text-sanzar-primary hover:underline">
            {data.openReports} open report(s) need review →
          </Link>
        </p>
      )}
    </div>
  );
};
