'use client';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Loading, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

interface Stats { users: number; active1d: number; active7d: number; new7d: number; studyHours7d: number; exams7d: number; posts7d: number; openReports: number; publishedBooks: number }

function Dashboard() {
  const { data, error, reload } = useLoad(() => api<Stats>('/v1/admin/stats'));
  if (!data) return <Loading error={error} onRetry={reload} />;
  const tiles: [string, number | string][] = [
    ['Students', data.users], ['Active today', data.active1d], ['Active this week', data.active7d], ['New this week', data.new7d],
    ['Study hours (7 days)', data.studyHours7d], ['Exams taken (7 days)', data.exams7d], ['Posts (7 days)', data.posts7d], ['Published books', data.publishedBooks],
  ];
  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid">{tiles.map(([k, v]) => <div key={k} className="card stat"><b>{v}</b><span>{k}</span></div>)}</div>
      {data.openReports > 0 && <p style={{ marginTop: 16 }}><Link href="/moderation/">{data.openReports} open report(s) need review →</Link></p>}
    </>
  );
}

export default function Page() {
  return <Shell><Dashboard /></Shell>;
}
