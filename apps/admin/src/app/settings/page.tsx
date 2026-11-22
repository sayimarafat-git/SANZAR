'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';

const XP_FIELDS: [string, string][] = [['resourceComplete', 'Finishing notes or a material'], ['quizCorrect', 'Each correct exam answer'], ['dailyGoal', 'Reaching the daily goal'], ['post', 'First community post of the day']];
const DEFAULT_XP: Record<string, number> = { resourceComplete: 10, quizCorrect: 5, dailyGoal: 20, post: 5 };

function Settings() {
  const { data, error, reload } = useLoad(() => api<{ config: Record<string, unknown> }>('/v1/config'));
  const [xp, setXp] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const { busy, errors, setErrors, save } = useSaver();
  useEffect(() => {
    if (!data) return;
    const cur = { ...DEFAULT_XP, ...((data.config.xp as Record<string, number>) ?? {}) };
    setXp(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, String(v)])));
    setNotice(typeof data.config.notice === 'string' ? data.config.notice : '');
  }, [data]);
  if (!data) return <Loading error={error} onRetry={reload} />;
  return (
    <>
      <h1>Settings</h1>
      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>XP points</h2>
        <div className="fields">{XP_FIELDS.map(([k, label]) => <label key={k}>{label}<input type="number" min={0} max={1000} value={xp[k] ?? ''} onChange={(e) => setXp({ ...xp, [k]: e.target.value })} /></label>)}</div>
        <p className="muted">Changes apply to new activity only. Points already earned are not recalculated.</p>
        <div><button className="primary" disabled={busy} onClick={async () => {
          const vals = Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, Number(v)]));
          if (Object.values(vals).some((v) => !Number.isInteger(v) || v < 0 || v > 1000)) return setErrors(['XP values must be whole numbers from 0 to 1000.']);
          await save(() => api('/v1/admin/config/xp', { method: 'PUT', body: { value: vals } }));
        }}>Save XP</button></div>
      </div>
      <div className="card stack" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Notice banner</h2>
        <label>Shown at the top of the app <small>leave empty to hide</small><input value={notice} maxLength={300} onChange={(e) => setNotice(e.target.value)} /></label>
        <div><button className="primary" disabled={busy} onClick={() => save(() => api('/v1/admin/config/notice', { method: 'PUT', body: { value: notice.trim() } }))}>Save notice</button></div>
      </div>
      <Errors list={errors} />
    </>
  );
}

export default function Page() {
  return <Shell min="admin"><Settings /></Shell>;
}
