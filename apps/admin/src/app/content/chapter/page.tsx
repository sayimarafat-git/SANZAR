'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, Modal, Status, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { loadContent, type Content, type Resource } from '@/lib/content';
import { fmtTime, isHttps, isId, parseTerms, slugify, validateQuestion, validateSections, type NoteSection } from '@/lib/model';

interface NotesRes { chapterId: string; current: number | null; versions: { version: number; sections: NoteSection[]; createdBy: string; createdAt: number }[] }

function NotesEditor({ chapterId }: { chapterId: string }) {
  const { data, error, reload } = useLoad(() => api<NotesRes>(`/v1/admin/notes/${chapterId}`), [chapterId]);
  const [sections, setSections] = useState<(NoteSection & { termsText: string })[] | null>(null);
  const { busy, errors, setErrors, save } = useSaver();
  useEffect(() => {
    if (!data) return;
    const cur = data.versions.find((v) => v.version === data.current);
    setSections((cur?.sections ?? []).map((s) => ({ ...s, page: s.page ?? null, terms: s.terms ?? [], termsText: (s.terms ?? []).join(', ') })));
  }, [data]);
  if (!data || !sections) return <Loading error={error} onRetry={reload} />;
  const upd = (i: number, k: string, v: unknown) => setSections(sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, d: number) => { const a = [...sections]; [a[i], a[i + d]] = [a[i + d], a[i]]; setSections(a); };
  const submit = async () => {
    const clean = sections.map((s) => ({ heading: s.heading.trim(), page: s.page, text: s.text.trim(), terms: parseTerms(s.termsText) }));
    const errs = validateSections(clean);
    if (errs.length) return setErrors(errs);
    if (await save(() => api(`/v1/admin/notes/${chapterId}`, { method: 'PUT', body: { sections: clean } }), 'Notes saved as a new version')) reload();
  };
  return (
    <div className="stack">
      <p className="muted">Current version: {data.current ?? 'none'} · Saving creates a new version; students and the AI Tutor see it immediately. Bangla search terms help the tutor find this section.</p>
      {sections.map((s, i) => (
        <div key={i} className="section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Section {i + 1}</b>
            <span className="row">
              <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button className="danger" onClick={() => setSections(sections.filter((_, j) => j !== i))}>Remove</button>
            </span>
          </div>
          <div className="fields">
            <label>Heading<input value={s.heading} onChange={(e) => upd(i, 'heading', e.target.value)} /></label>
            <label>Book page<input type="number" min={1} value={s.page ?? ''} onChange={(e) => upd(i, 'page', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label>Bangla search terms <small>comma separated</small><input value={s.termsText} onChange={(e) => upd(i, 'termsText', e.target.value)} /></label>
          </div>
          <label>Text<textarea value={s.text} onChange={(e) => upd(i, 'text', e.target.value)} /></label>
        </div>
      ))}
      <div className="row">
        <button onClick={() => setSections([...sections, { heading: '', page: null, text: '', terms: [], termsText: '' }])}>Add section</button>
        <button className="primary" onClick={submit} disabled={busy}>Save notes</button>
      </div>
      <Errors list={errors} />
      {data.versions.length > 1 && (
        <details>
          <summary>Version history ({data.versions.length})</summary>
          <table><tbody>
            {data.versions.map((v) => (
              <tr key={v.version}>
                <td>v{v.version}</td><td>{fmtTime(v.createdAt)}</td><td>{v.sections.length} sections</td>
                <td>{v.version === data.current ? <span className="pill published">current</span> : (
                  <button onClick={async () => { if (await save(() => api(`/v1/admin/notes/${chapterId}/rollback`, { method: 'POST', body: { version: v.version } }), `Restored v${v.version}`)) reload(); }}>Restore</button>
                )}</td>
              </tr>
            ))}
          </tbody></table>
        </details>
      )}
    </div>
  );
}

function ResourceForm({ chapterId, res, onDone }: { chapterId: string; res: Resource | null; onDone: () => void }) {
  const [f, setF] = useState({ id: res?.id ?? '', type: res?.type ?? 'pdf', title: res?.title ?? '', url: res?.url ?? '', pages: res?.pages?.toString() ?? '', licence: res?.licence ?? '', status: res?.status ?? 'published', note: '' });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { busy, errors, setErrors, save } = useSaver();
  const submit = async () => {
    const id = res?.id ?? (f.id || `${chapterId}-${f.type}-${slugify(f.title).slice(0, 20) || Date.now().toString(36)}`);
    const errs = [!isId(id) && 'Invalid id.', !isHttps(f.url) && 'Link must start with https://', f.title.trim().length < 2 && 'Add a title.'].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (await save(() => api(`/v1/admin/resources/${id}`, { method: 'PUT', body: {
      chapter_id: chapterId, type: f.type, title: f.title.trim(), url: f.url.trim(), pages: f.pages ? Number(f.pages) : null, licence: f.licence, status: f.status, change_note: f.note,
    } }))) onDone();
  };
  return (
    <div className="stack">
      <div className="fields">
        <label>Type<select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="pdf">PDF</option><option value="video">Video</option><option value="ppt">Slides</option><option value="link">Link</option></select></label>
        <label>Title<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>Status<select value={f.status} onChange={(e) => set('status', e.target.value)}><option>draft</option><option>published</option><option>archived</option></select></label>
        {f.type === 'pdf' && <label>Pages<input type="number" min={1} value={f.pages} onChange={(e) => set('pages', e.target.value)} /></label>}
      </div>
      <label>Link <small>https only. PDFs must be a direct file link; YouTube and Google Drive videos open in their apps.</small><input value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></label>
      <label>Licence / source <small>who owns it and permission to share</small><input value={f.licence} onChange={(e) => set('licence', e.target.value)} /></label>
      {res && <label>Change note <small>saved with a new version when the link changes</small><input value={f.note} onChange={(e) => set('note', e.target.value)} /></label>}
      <Errors list={errors} />
      <button className="primary" onClick={submit} disabled={busy}>Save material</button>
    </div>
  );
}

interface Q { id: string; text: string; options: string[]; answer: number; explanation: string; status: string; current_version: number; difficulty: number }

function QuestionForm({ chapterId, q, onDone }: { chapterId: string; q: Q | null; onDone: () => void }) {
  const [text, setText] = useState(q?.text ?? '');
  const [options, setOptions] = useState<string[]>(q?.options ?? ['', '', '', '']);
  const [answer, setAnswer] = useState<number | null>(q?.answer ?? null);
  const [explanation, setExplanation] = useState(q?.explanation ?? '');
  const [status, setStatus] = useState(q?.status ?? 'published');
  const { busy, errors, setErrors, save } = useSaver();
  const submit = async () => {
    const errs = validateQuestion({ text, options, answer });
    if (errs.length) return setErrors(errs);
    const id = q?.id ?? `${chapterId}-q${Date.now().toString(36)}`;
    if (await save(() => api(`/v1/admin/questions/${id}`, { method: 'PUT', body: { chapter_id: chapterId, text: text.trim(), options: options.map((o) => o.trim()), answer, explanation: explanation.trim(), status } }))) onDone();
  };
  return (
    <div className="stack">
      <label>Question<textarea style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} /></label>
      {options.map((o, i) => (
        <div key={i} className="row">
          <input type="radio" name="answer" style={{ width: 'auto' }} checked={answer === i} onChange={() => setAnswer(i)} aria-label={`Option ${i + 1} is correct`} />
          <input value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1, width: 'auto' }} />
          {options.length > 2 && <button onClick={() => { setOptions(options.filter((_, j) => j !== i)); setAnswer(answer === i ? null : answer !== null && answer > i ? answer - 1 : answer); }} aria-label="Remove option">✕</button>}
        </div>
      ))}
      {options.length < 6 && <button onClick={() => setOptions([...options, ''])} style={{ justifySelf: 'start' }}>Add option</button>}
      <p className="muted">Select the circle next to the correct option.</p>
      <label>Explanation <small>shown after the exam</small><textarea style={{ minHeight: 60 }} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></label>
      <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>draft</option><option>published</option><option>archived</option></select></label>
      {q && <p className="muted">Editing saves version {q.current_version + 1}. Past exam results keep the version students saw.</p>}
      <Errors list={errors} />
      <button className="primary" onClick={submit} disabled={busy}>Save question</button>
    </div>
  );
}

function ChapterPage() {
  const id = useSearchParams().get('id') ?? '';
  const content = useLoad(loadContent);
  const qs = useLoad(() => api<{ questions: Q[] }>(`/v1/admin/questions?chapter=${encodeURIComponent(id)}`), [id]);
  const [res, setRes] = useState<Resource | null | undefined>(undefined);
  const [q, setQ] = useState<Q | null | undefined>(undefined);
  const { save } = useSaver();
  const c: Content | null = content.data;
  if (!c) return <Loading error={content.error} onRetry={content.reload} />;
  const ch = c.chapters.find((x) => x.id === id);
  if (!ch) return <div className="errors">Chapter not found. <Link href="/content/">Back</Link></div>;
  const book = c.books.find((b) => b.id === ch.book_id);
  const resources = c.resources.filter((r) => r.chapter_id === id);
  return (
    <>
      <p><Link href={`/content/book/?id=${encodeURIComponent(ch.book_id)}`}>← {book?.title}</Link></p>
      <h1>Chapter {ch.number}: {ch.title} <Status s={ch.status} /></h1>

      <h2>Notes</h2>
      <div className="card"><NotesEditor chapterId={id} /></div>

      <div className="top"><h2>Study materials</h2><button onClick={() => setRes(null)}>Add material</button></div>
      {resources.length === 0 ? <p className="muted">No PDFs, videos or slides yet.</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Title</th><th>Type</th><th>Version</th><th>Status</th><th /></tr></thead>
          <tbody>{resources.map((r) => (
            <tr key={r.id}>
              <td><b>{r.title || r.id}</b><br /><a href={r.url ?? '#'} target="_blank" rel="noreferrer noopener"><small>{r.url}</small></a></td>
              <td>{r.type}</td>
              <td>v{r.current_version}{r.versions.length > 1 && (
                <details><summary><small>history</small></summary>{r.versions.map((v) => (
                  <div key={v.version} className="row"><small>v{v.version} · {fmtTime(v.created_at)}</small>{v.version !== r.current_version && (
                    <button onClick={async () => { if (await save(() => api(`/v1/admin/resources/${r.id}/rollback`, { method: 'POST', body: { version: v.version } }), `Restored v${v.version}`)) content.reload(); }}>Restore</button>
                  )}</div>
                ))}</details>
              )}</td>
              <td><Status s={r.status} /></td>
              <td><button onClick={() => setRes(r)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      <div className="top"><h2>Questions</h2><button onClick={() => setQ(null)}>Add question</button></div>
      {!qs.data ? <Loading error={qs.error} onRetry={qs.reload} /> : qs.data.questions.length === 0 ? <p className="muted">No questions yet. A chapter quiz needs at least 3.</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Question</th><th>Correct answer</th><th>Status</th><th /></tr></thead>
          <tbody>{qs.data.questions.map((x) => (
            <tr key={x.id}><td>{x.text}</td><td>{x.options[x.answer]}</td><td><Status s={x.status} /></td><td><button onClick={() => setQ(x)}>Edit</button></td></tr>
          ))}</tbody>
        </table></div>
      )}

      {res !== undefined && <Modal title={res ? 'Edit material' : 'Add material'} onClose={() => setRes(undefined)}><ResourceForm chapterId={id} res={res} onDone={() => { setRes(undefined); content.reload(); }} /></Modal>}
      {q !== undefined && <Modal title={q ? 'Edit question' : 'Add question'} onClose={() => setQ(undefined)}><QuestionForm chapterId={id} q={q} onDone={() => { setQ(undefined); qs.reload(); content.reload(); }} /></Modal>}
    </>
  );
}

export default function Page() {
  return <Shell min="content_admin"><Suspense><ChapterPage /></Suspense></Shell>;
}
