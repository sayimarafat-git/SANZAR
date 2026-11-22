'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { BookForm } from '@/components/BookForm';
import { Errors, Loading, Modal, Status, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { loadContent, type Book, type Subject } from '@/lib/content';
import { isId, LEVELS, slugify } from '@/lib/model';

function SubjectForm({ subject, subjects, onDone }: { subject: Subject | null; subjects: Subject[]; onDone: () => void }) {
  const isNew = !subject;
  const [f, setF] = useState({
    id: subject?.id ?? '', name_en: subject?.name_en ?? '', name_bn: subject?.name_bn ?? '',
    name_zh: subject?.name_zh ?? '', color: subject?.color ?? '#247754', sort: String(subject?.sort ?? 0),
  });
  const { busy, errors, setErrors, save } = useSaver();
  const submit = async () => {
    const id = isNew ? f.id || slugify(f.name_en) : subject.id;
    const errs = [!isId(id) && 'ID may use letters, digits, dot, dash and underscore.', f.name_en.trim().length < 2 && 'Name must be at least 2 characters.'].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (isNew && subjects.some((s) => s.id === id)) return setErrors([`A subject with id "${id}" already exists.`]);
    if (await save(() => api(`/v1/admin/subjects/${id}`, { method: 'PUT', body: {
      name_en: f.name_en.trim(), name_bn: f.name_bn.trim(), name_zh: f.name_zh.trim(),
      color: f.color, sort: Number(f.sort) || 0,
    } }))) onDone();
  };
  return (
    <div className="stack">
      <div className="fields">
        <label>Name<input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></label>
        <label>ID <small>{isNew ? 'leave empty to make one from the name' : 'cannot be changed'}</small><input value={isNew ? f.id : subject.id} disabled={!isNew} placeholder={slugify(f.name_en)} onChange={(e) => setF({ ...f, id: e.target.value })} /></label>
        <label>Bengali name<input value={f.name_bn} onChange={(e) => setF({ ...f, name_bn: e.target.value })} /></label>
        <label>Chinese name<input value={f.name_zh} onChange={(e) => setF({ ...f, name_zh: e.target.value })} /></label>
        <label>Order<input type="number" min={0} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></label>
        <label>Colour<input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 60 }} /></label>
      </div>
      <Errors list={errors} />
      <button className="primary" onClick={submit} disabled={busy}>Save subject</button>
    </div>
  );
}

function Books() {
  const { data, error, reload } = useLoad(loadContent);
  const [editing, setEditing] = useState<Partial<Book> | null | undefined>(undefined);
  const [editingSubject, setEditingSubject] = useState<Subject | null | undefined>(undefined);
  const [q, setQ] = useState('');
  if (!data) return <Loading error={error} onRetry={reload} />;
  const subject = (id: string) => data.subjects.find((s) => s.id === id)?.name_en ?? id;
  const list = data.books.filter((b) => !q || b.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="top"><h1>Books &amp; chapters</h1><button className="primary" onClick={() => setEditing(null)}>New book</button></div>
      <input placeholder="Search books" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 12 }} />
      <div className="tablewrap">
        <table>
          <thead><tr><th>Book</th><th>Subject</th><th>Classes</th><th>Chapters</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/content/book/?id=${encodeURIComponent(b.id)}`}><b>{b.title}</b></Link><br /><small className="muted">{b.id}</small></td>
                <td>{subject(b.subject_id)}</td>
                <td>{b.levels.map((l) => LEVELS.find((x) => x.id === l)?.name ?? l).join(', ')}</td>
                <td>{data.chapters.filter((c) => c.book_id === b.id).length}</td>
                <td><Status s={b.status} /></td>
                <td><button onClick={() => setEditing(b)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && <Modal title={editing ? `Edit ${editing.title}` : 'New book'} onClose={() => setEditing(undefined)}><BookForm book={editing} content={data} onDone={() => { setEditing(undefined); reload(); }} /></Modal>}
      <div className="top" style={{ marginTop: 28 }}><h2>Subjects</h2><button className="primary" onClick={() => setEditingSubject(null)}>New subject</button></div>
      {!data.subjects.length && <p className="muted">Add a subject before creating books. The new platform starts without imported course data.</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Subject</th><th>ID</th><th>Books</th><th /></tr></thead>
        <tbody>{data.subjects.map((s) => (
          <tr key={s.id}><td><b>{s.name_en}</b></td><td><small className="muted">{s.id}</small></td><td>{data.books.filter((b) => b.subject_id === s.id).length}</td><td><button onClick={() => setEditingSubject(s)}>Edit</button></td></tr>
        ))}</tbody>
      </table></div>
      {editingSubject !== undefined && <Modal title={editingSubject ? `Edit ${editingSubject.name_en}` : 'New subject'} onClose={() => setEditingSubject(undefined)}><SubjectForm subject={editingSubject} subjects={data.subjects} onDone={() => { setEditingSubject(undefined); reload(); }} /></Modal>}
    </>
  );
}

export default function Page() {
  return <Shell min="content_admin"><Books /></Shell>;
}
