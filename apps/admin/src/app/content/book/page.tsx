'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Errors, Loading, Modal, Status, useLoad, useSaver } from '@/components/ui';
import { api } from '@/lib/api';
import { loadContent, type Chapter } from '@/lib/content';
import { isId } from '@/lib/model';

function ChapterForm({ bookId, chapter, nextNumber, onDone }: { bookId: string; chapter: Chapter | null; nextNumber: number; onDone: () => void }) {
  const [n, setN] = useState(String(chapter?.number ?? nextNumber));
  const [title, setTitle] = useState(chapter?.title ?? '');
  const [status, setStatus] = useState(chapter?.status ?? 'published');
  const id = chapter?.id ?? `${bookId}-${String(Number(n) || 0).padStart(2, '0')}`;
  const { busy, errors, setErrors, save } = useSaver();
  return (
    <div className="stack">
      <div className="fields">
        <label>Number<input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} /></label>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>draft</option><option>published</option><option>archived</option></select></label>
        <label>ID<input value={id} disabled /></label>
      </div>
      <Errors list={errors} />
      <button className="primary" disabled={busy} onClick={async () => {
        if (!title.trim()) return setErrors(['Title is required.']);
        if (!isId(id)) return setErrors(['Invalid id.']);
        if (await save(() => api(`/v1/admin/chapters/${id}`, { method: 'PUT', body: { book_id: bookId, number: Number(n), title: title.trim(), status } }))) onDone();
      }}>Save chapter</button>
    </div>
  );
}

function BookPage() {
  const id = useSearchParams().get('id') ?? '';
  const { data, error, reload } = useLoad(loadContent);
  const [editing, setEditing] = useState<Chapter | null | undefined>(undefined);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const book = data.books.find((b) => b.id === id);
  if (!book) return <div className="errors">Book not found. <Link href="/content/">Back</Link></div>;
  const chapters = data.chapters.filter((c) => c.book_id === id);
  const hasNotes = new Set(data.notes.map((n) => n.chapter_id));
  return (
    <>
      <p><Link href="/content/">← Books</Link></p>
      <div className="top"><h1>{book.title} <Status s={book.status} /></h1><button className="primary" onClick={() => setEditing(null)}>New chapter</button></div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>#</th><th>Chapter</th><th>Notes</th><th>Materials</th><th>Questions</th><th>Status</th><th /></tr></thead>
          <tbody>
            {chapters.map((c) => (
              <tr key={c.id}>
                <td>{c.number}</td>
                <td><Link href={`/content/chapter/?id=${encodeURIComponent(c.id)}`}><b>{c.title}</b></Link></td>
                <td>{hasNotes.has(c.id) ? '✓' : '—'}</td>
                <td>{data.resources.filter((r) => r.chapter_id === c.id).length}</td>
                <td>{data.questionCounts[c.id] ?? 0}</td>
                <td><Status s={c.status} /></td>
                <td><button onClick={() => setEditing(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && (
        <Modal title={editing ? `Edit chapter ${editing.number}` : 'New chapter'} onClose={() => setEditing(undefined)}>
          <ChapterForm bookId={id} chapter={editing} nextNumber={Math.max(0, ...chapters.map((c) => c.number)) + 1} onDone={() => { setEditing(undefined); reload(); }} />
        </Modal>
      )}
    </>
  );
}

export default function Page() {
  return <Shell min="content_admin"><Suspense><BookPage /></Suspense></Shell>;
}
