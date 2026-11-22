'use client';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { loadContent } from '@/lib/content';
import { fmtTime } from '@/lib/model';

function Announcements() {
  const { data, error, reload } = useLoad(loadContent);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const { busy, errors, setErrors, save } = useSaver();
  return (
    <>
      <h1>Announcements</h1>
      <div className="card stack">
        <label>Title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Message<textarea value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} /></label>
        <Errors list={errors} />
        <div><button className="primary" disabled={busy} onClick={async () => {
          if (title.trim().length < 2 || !body.trim()) return setErrors(['Write a title and a message.']);
          if (await save(() => api('/v1/admin/announcements', { method: 'POST', body: { title: title.trim(), body: body.trim() } }), 'Published to every student')) { setTitle(''); setBody(''); reload(); }
        }}>Publish</button></div>
      </div>
      <h2>Published</h2>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="stack">{data.announcements.map((a) => (
          <div key={a.id} className="card">
            <div className="top"><b>{a.title}</b><span className="muted">{fmtTime(a.created_at)}</span></div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
            {confirm === a.id
              ? <span className="row">Delete for everyone? <button className="danger" onClick={async () => { if (await save(() => api(`/v1/admin/announcements/${a.id}`, { method: 'DELETE' }), 'Deleted')) reload(); setConfirm(null); }}>Delete</button><button onClick={() => setConfirm(null)}>Cancel</button></span>
              : <button className="danger" onClick={() => setConfirm(a.id)}>Delete</button>}
          </div>
        ))}</div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell min="admin"><Announcements /></Shell>;
}
