'use client';
import { useState } from 'react';
import { Errors, useSaver } from './ui';
import { api } from '@/lib/api';
import type { Book, Content } from '@/lib/content';
import { LEVELS, isId, slugify } from '@/lib/model';

export function BookForm({ book, content, onDone }: { book: Partial<Book> | null; content: Content; onDone: () => void }) {
  const isNew = !book?.id;
  const [f, setF] = useState({
    id: book?.id ?? '', title: book?.title ?? '', subject_id: book?.subject_id ?? content.subjects[0]?.id ?? '', edition: book?.edition ?? '', author: book?.author ?? '',
    c1: book?.cover_c1 ?? '#0b523b', c2: book?.cover_c2 ?? '#247754', featured: book?.featured_rank?.toString() ?? '', sort: String(book?.sort ?? 0),
    status: book?.status ?? 'draft', levels: book?.levels ?? [],
  });
  const { busy, errors, setErrors, save } = useSaver();
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    const id = isNew ? f.id || slugify(f.title) : f.id;
    const errs = [!isId(id) && 'ID may use letters, digits, dot, dash and underscore.', f.title.trim().length < 2 && 'Title is too short.', !f.subject_id && 'Create a subject before adding books.', !f.levels.length && 'Choose at least one class.'].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (isNew && content.books.some((b) => b.id === id)) return setErrors([`A book with id "${id}" already exists.`]);
    const ok = await save(() => api(`/v1/admin/books/${id}`, { method: 'PUT', body: {
      title: f.title.trim(), subject_id: f.subject_id, edition: f.edition, author: f.author, cover: [f.c1, f.c2], levels: f.levels,
      featured_rank: f.featured === '' ? null : Number(f.featured), sort: Number(f.sort) || 0, status: f.status,
    } }));
    if (ok) onDone();
  };
  return (
    <div className="stack">
      <div className="fields">
        <label>Title<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>ID <small>{isNew ? 'leave empty to make one from the title' : 'cannot be changed'}</small><input value={isNew ? f.id : book!.id} disabled={!isNew} placeholder={slugify(f.title)} onChange={(e) => set('id', e.target.value)} /></label>
        <label>Subject<select value={f.subject_id} onChange={(e) => set('subject_id', e.target.value)}>{content.subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</select></label>
        <label>Edition<input value={f.edition} onChange={(e) => set('edition', e.target.value)} /></label>
        <label>Author / board<input value={f.author} onChange={(e) => set('author', e.target.value)} /></label>
        <label>Status<select value={f.status} onChange={(e) => set('status', e.target.value)}><option>draft</option><option>published</option><option>archived</option></select></label>
        <label>Featured rank <small>empty = not featured</small><input type="number" min={1} value={f.featured} onChange={(e) => set('featured', e.target.value)} /></label>
        <label>Order<input type="number" min={0} value={f.sort} onChange={(e) => set('sort', e.target.value)} /></label>
        <label>Cover colours<span className="row"><input type="color" value={f.c1} onChange={(e) => set('c1', e.target.value)} style={{ width: 60 }} /><input type="color" value={f.c2} onChange={(e) => set('c2', e.target.value)} style={{ width: 60 }} /></span></label>
      </div>
      <fieldset className="row" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Classes</legend>
        {LEVELS.map((l) => (
          <label key={l.id} className="row" style={{ fontWeight: 500 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.levels.includes(l.id)} onChange={(e) => set('levels', e.target.checked ? [...f.levels, l.id] : f.levels.filter((x) => x !== l.id))} />{l.name}
          </label>
        ))}
      </fieldset>
      <Errors list={errors} />
      <div className="row"><button className="primary" onClick={submit} disabled={busy || !content.subjects.length}>Save book</button></div>
    </div>
  );
}

