'use client';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, Modal, Status, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { loadContent, type Content, type Exam } from '@/lib/content';
import { isId, slugify } from '@/lib/model';

const toLocal = (ms: number | null) => (ms ? new Date(ms + 6 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? Date.parse(`${v}:00+06:00`) : null); // times are entered in Bangladesh time

function ExamForm({ exam, c, onDone }: { exam: Exam | null; c: Content; onDone: () => void }) {
  const [f, setF] = useState({
    id: exam?.id ?? '', title: exam?.title ?? '', type: exam?.type ?? 'model', book_id: exam?.book_id ?? c.books[0]?.id ?? '', chapter_id: exam?.chapter_id ?? c.chapters[0]?.id ?? '',
    minutes: String(Math.round((exam?.duration_sec ?? 1200) / 60)), count: String(exam?.question_count ?? 20), pass: String(exam?.pass_pct ?? 60), status: exam?.status ?? 'draft',
    opens: toLocal(exam?.opens_at ?? null), closes: toLocal(exam?.closes_at ?? null),
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { busy, errors, setErrors, save } = useSaver();
  const submit = async () => {
    const id = exam?.id ?? (f.id || slugify(`${f.type === 'model' ? 'mt' : 'cq'} ${f.title}`));
    const errs = [!isId(id) && 'Invalid id.', f.title.trim().length < 2 && 'Add a title.'].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (await save(() => api(`/v1/admin/exams/${id}`, { method: 'PUT', body: {
      title: f.title.trim(), type: f.type, book_id: f.type === 'model' ? f.book_id : null, chapter_id: f.type === 'chapter_quiz' ? f.chapter_id : null,
      duration_sec: Math.round(Number(f.minutes) * 60), question_count: Number(f.count), pass_pct: Number(f.pass), status: f.status, opens_at: fromLocal(f.opens), closes_at: fromLocal(f.closes),
    } }))) onDone();
  };
  return (
    <div className="stack">
      <div className="fields">
        <label>Title<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>Type<select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="model">Model test (whole book)</option><option value="chapter_quiz">Chapter quiz</option></select></label>
        {f.type === 'model'
          ? <label>Book<select value={f.book_id} onChange={(e) => set('book_id', e.target.value)}>{c.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
          : <label>Chapter<select value={f.chapter_id} onChange={(e) => set('chapter_id', e.target.value)}>{c.chapters.map((ch) => <option key={ch.id} value={ch.id}>{c.books.find((b) => b.id === ch.book_id)?.title} · {ch.number}. {ch.title}</option>)}</select></label>}
        <label>Duration (minutes)<input type="number" min={1} max={360} value={f.minutes} onChange={(e) => set('minutes', e.target.value)} /></label>
        <label>Questions per attempt <small>picked at random</small><input type="number" min={1} max={200} value={f.count} onChange={(e) => set('count', e.target.value)} /></label>
        <label>Pass mark %<input type="number" min={1} max={100} value={f.pass} onChange={(e) => set('pass', e.target.value)} /></label>
        <label>Opens <small>Bangladesh time, optional</small><input type="datetime-local" value={f.opens} onChange={(e) => set('opens', e.target.value)} /></label>
        <label>Closes <small>optional</small><input type="datetime-local" value={f.closes} onChange={(e) => set('closes', e.target.value)} /></label>
        <label>Status<select value={f.status} onChange={(e) => set('status', e.target.value)}><option>draft</option><option>published</option><option>archived</option></select></label>
      </div>
      <Errors list={errors} />
      <button className="primary" onClick={submit} disabled={busy}>Save exam</button>
    </div>
  );
}

function Exams() {
  const { data, error, reload } = useLoad(loadContent);
  const [editing, setEditing] = useState<Exam | null | undefined>(undefined);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const where = (e: Exam) => e.book_id ? data.books.find((b) => b.id === e.book_id)?.title : (() => { const ch = data.chapters.find((c) => c.id === e.chapter_id); return ch ? `${data.books.find((b) => b.id === ch.book_id)?.title} · ch ${ch.number}` : e.chapter_id; })();
  return (
    <>
      <div className="top"><h1>Exams</h1><button className="primary" onClick={() => setEditing(null)}>New exam</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Exam</th><th>Type</th><th>For</th><th>Questions</th><th>Time</th><th>Status</th><th /></tr></thead>
        <tbody>{data.exams.map((e) => (
          <tr key={e.id}><td><b>{e.title}</b><br /><small className="muted">{e.id}</small></td><td>{e.type === 'model' ? 'Model test' : 'Chapter quiz'}</td><td>{where(e)}</td>
            <td>{e.question_count}</td><td>{Math.round(e.duration_sec / 60)} min</td><td><Status s={e.status} /></td><td><button onClick={() => setEditing(e)}>Edit</button></td></tr>
        ))}</tbody>
      </table></div>
      {editing !== undefined && <Modal title={editing ? 'Edit exam' : 'New exam'} onClose={() => setEditing(undefined)}><ExamForm exam={editing} c={data} onDone={() => { setEditing(undefined); reload(); }} /></Modal>}
    </>
  );
}

export default function Page() {
  return <Shell min="content_admin"><Exams /></Shell>;
}
