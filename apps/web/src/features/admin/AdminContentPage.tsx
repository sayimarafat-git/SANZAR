import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import {
  LEVELS,
  fmtTime,
  isHttps,
  isId,
  parseTerms,
  slugify,
  validateQuestion,
  validateSections,
  type NoteSection,
} from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, StatusPill, BookCover, useToast } from '../../components/SanzarUI';

export interface AdminBook {
  id: string;
  title: string;
  subject_id: string;
  edition: string;
  author: string;
  cover_c1: string;
  cover_c2: string;
  cover_image?: string | null;
  cover_ratio?: number | null;
  featured_rank: number | null;
  sort: number;
  status: string;
  levels: string[];
}

export interface AdminChapter {
  id: string;
  book_id: string;
  number: number;
  title: string;
  sort: number;
  status: string;
  is_whole_chapter?: number;
  thumbnail_url?: string | null;
}

export interface AdminResourceVersion {
  version: number;
  url: string;
  change_note: string;
  created_at: number;
}

export interface AdminResource {
  id: string;
  chapter_id: string;
  type: string;
  title: string;
  sort: number;
  current_version: number;
  pages: number | null;
  licence: string;
  status: string;
  url: string | null;
  thumbnail_url?: string | null;
  versions: AdminResourceVersion[];
}

export interface AdminExam {
  id: string;
  title: string;
  type: string;
  book_id: string | null;
  chapter_id: string | null;
  level_id?: string | null;
  time_zone?: string | null;
  duration_sec: number;
  question_count: number;
  pass_pct: number;
  xp_reward?: number | null;
  status: string;
  opens_at: number | null;
  closes_at: number | null;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  expires_at?: number | null;
  created_at: number;
}

export interface AdminSubject {
  id: string;
  name_en: string;
  name_bn: string;
  name_zh?: string;
  icon?: string;
  color?: string;
  sort?: number;
  thumbnail_url?: string | null;
}

export interface AdminQaItem {
  id: string;
  chapter_id: string;
  question: string;
  answer: string;
  sort: number;
  status: string;
}

export interface AdminContent {
  levels: { id: string; name_en: string }[];
  subjects: AdminSubject[];
  books: AdminBook[];
  chapters: AdminChapter[];
  resources: AdminResource[];
  notes: { chapter_id: string; current_version: number; latest: number; updated_at: number }[];
  exams: AdminExam[];
  announcements: AdminAnnouncement[];
  questionCounts: Record<string, number>;
}

const ErrorsBox: React.FC<{ list: string[] }> = ({ list }) =>
  list.length ? (
    <div className="p-3 rounded-xl bg-sanzar-danger/10 border border-sanzar-danger/30 text-sanzar-danger text-xs">
      <ul className="list-disc pl-4 space-y-0.5">
        {list.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  ) : null;

const isValidThumbValue = (v: string) => !v || isHttps(v) || v.startsWith('data:image/');

async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
  // If already small enough (< 160 KB) or SVG, keep directly
  if (dataUrl.length < 160_000 || file.type === 'image/svg+xml') return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unsupported image format'));
    el.src = dataUrl;
  });
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
}

const ThumbnailField: React.FC<{ value: string; onChange: (val: string) => void; className?: string }> = ({
  value,
  onChange,
  className = '',
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (err) {
      setUploadErr(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <span className="block">
        Thumbnail <small className="font-normal text-sanzar-muted">(optional — upload any image or paste https:// URL)</small>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 cursor-pointer text-xs font-semibold transition shrink-0">
          {uploading ? 'Processing…' : 'Upload image'}
          <input type="file" accept="image/*" onChange={(e) => void onFile(e)} className="hidden" />
        </label>
        <input
          value={value.startsWith('data:image/') ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={value.startsWith('data:image/') ? 'Uploaded image ready (or paste URL to replace)' : 'https://…'}
          className="sanzar-input text-xs flex-1 min-w-[160px]"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-2.5 py-1.5 rounded-xl border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10 shrink-0"
          >
            Remove
          </button>
        )}
      </div>
      {uploadErr && <p className="text-sanzar-danger text-[11px]">{uploadErr}</p>}
      {value && isValidThumbValue(value) && (
        <img
          src={value}
          alt="Thumbnail preview"
          className="h-16 w-24 object-cover rounded-xl border border-sanzar-border bg-sanzar-surface2"
        />
      )}
    </div>
  );
};

export const AdminContentPage: React.FC<{ view?: 'books' | 'book' | 'chapter' }> = ({ view = 'books' }) => {
  const { bookId, chapterId } = useParams();
  if (view === 'book' && bookId) return <BookDetailView bookId={bookId} />;
  if (view === 'chapter' && chapterId) return <ChapterDetailView chapterId={chapterId} />;
  return <BooksAndSubjectsView />;
};

/* ---------------- BOOKS & SUBJECTS ---------------- */
const BooksAndSubjectsView: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });
  const [editingBook, setEditingBook] = useState<Partial<AdminBook> | null | undefined>(undefined);
  const [editingSubject, setEditingSubject] = useState<AdminSubject | null | undefined>(undefined);
  const [search, setSearch] = useState('');

  const deleteBook = async (b: AdminBook) => {
    if (!window.confirm(`Delete book "${b.title}" and all its chapters/materials?`)) return;
    try {
      await apiRequest(`/v1/admin/books/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      toast('Book deleted');
      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
    } catch (e) {
      toast(errorText(e));
    }
  };

  const deleteSubject = async (s: AdminSubject) => {
    if (!window.confirm(`Delete subject "${s.name_en}"?`)) return;
    try {
      await apiRequest(`/v1/admin/subjects/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      toast('Subject deleted');
      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
    } catch (e) {
      toast(errorText(e));
    }
  };

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const data = q.data;
  const subName = (id: string) => data.subjects.find((s) => s.id === id)?.name_en ?? id;
  const books = data.books.filter(
    (b) => !search || b.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Books &amp; chapters</h1>
        <button
          onClick={() => setEditingBook(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          New book
        </button>
      </div>

      <input
        placeholder="Search books"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sanzar-input max-w-xs text-sm"
      />

      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">Book</th>
              <th className="p-3 font-semibold">Subject</th>
              <th className="p-3 font-semibold">Learning languages</th>
              <th className="p-3 font-semibold">Chapters</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id} className="border-b border-sanzar-border last:border-0">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <BookCover
                      colors={[b.cover_c1, b.cover_c2]}
                      title={b.title}
                      imageUrl={b.cover_image}
                      aspectRatio={b.cover_ratio}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/admin/content/book/${encodeURIComponent(b.id)}`}
                        className="font-bold text-sanzar-primary hover:underline"
                      >
                        {b.title}
                      </Link>
                      <div className="text-xs text-sanzar-muted">{b.id}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3">{subName(b.subject_id)}</td>
                <td className="p-3 text-xs">
                  {b.levels.map((l) => LEVELS.find((x) => x.id === l)?.name ?? l).join(', ')}
                </td>
                <td className="p-3">{data.chapters.filter((c) => c.book_id === b.id).length}</td>
                <td className="p-3">
                  <StatusPill s={b.status} />
                </td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <Link
                    to={`/admin/content/book/${encodeURIComponent(b.id)}`}
                    className="inline-block px-3 py-1 rounded-lg border border-sanzar-primary/50 text-sanzar-primary text-xs font-semibold hover:bg-sanzar-primarySoft"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => setEditingBook(b)}
                    className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void deleteBook(b)}
                    className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Subjects */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <h2 className="text-lg font-bold">Subjects</h2>
        <button
          onClick={() => setEditingSubject(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          New subject
        </button>
      </div>
      {!data.subjects.length && (
        <p className="text-xs text-sanzar-muted">Add a subject before creating books.</p>
      )}
      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">Subject</th>
              <th className="p-3 font-semibold">ID</th>
              <th className="p-3 font-semibold">Books</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((s) => (
              <tr key={s.id} className="border-b border-sanzar-border last:border-0">
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => setEditingSubject(s)}
                    className="font-bold text-sanzar-primary hover:underline text-left"
                  >
                    {s.name_en}
                  </button>
                </td>
                <td className="p-3 text-xs text-sanzar-muted">{s.id}</td>
                <td className="p-3">{data.books.filter((b) => b.subject_id === s.id).length}</td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => setEditingSubject(s)}
                    className="px-3 py-1 rounded-lg border border-sanzar-primary/50 text-sanzar-primary text-xs font-semibold hover:bg-sanzar-primarySoft"
                  >
                    Manage
                  </button>
                  <button
                    onClick={() => void deleteSubject(s)}
                    className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingBook !== undefined && (
        <Modal
          title={editingBook ? `Edit ${editingBook.title}` : 'New book'}
          onClose={() => setEditingBook(undefined)}
        >
          <BookForm
            book={editingBook}
            content={data}
            onDone={() => {
              setEditingBook(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
            }}
          />
        </Modal>
      )}

      {editingSubject !== undefined && (
        <Modal
          title={editingSubject ? `Edit ${editingSubject.name_en}` : 'New subject'}
          onClose={() => setEditingSubject(undefined)}
        >
          <SubjectForm
            subject={editingSubject}
            subjects={data.subjects}
            onDone={() => {
              setEditingSubject(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
            }}
          />
        </Modal>
      )}
    </div>
  );
};

const BookForm: React.FC<{ book: Partial<AdminBook> | null; content: AdminContent; onDone: () => void }> = ({
  book,
  content,
  onDone,
}) => {
  const toast = useToast();
  const isNew = !book?.id;
  const [f, setF] = useState({
    id: book?.id ?? '',
    title: book?.title ?? '',
    subject_id: book?.subject_id ?? content.subjects[0]?.id ?? '__custom__',
    custom_subject: '',
    edition: book?.edition ?? '',
    author: book?.author ?? '',
    c1: book?.cover_c1 ?? '#0b523b',
    c2: book?.cover_c2 ?? '#247754',
    cover_image: book?.cover_image ?? (null as string | null),
    cover_ratio: book?.cover_ratio ?? (null as number | null),
    featured: book?.featured_rank?.toString() ?? '',
    sort: String(book?.sort ?? 0),
    status: book?.status ?? 'draft',
    levels: book?.levels?.length ? [book.levels[0]] : ([] as string[]),
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [detectBusy, setDetectBusy] = useState(false);

  const bookChapters = book?.id ? content.chapters.filter((c) => c.book_id === book.id).map((c) => c.id) : [];
  const firstDocRes = bookChapters.length
    ? content.resources.find((r) => bookChapters.includes(r.chapter_id) && (r.type === 'pdf' || r.type === 'ppt') && r.url)
    : undefined;

  const detectFromFile = async (file: File) => {
    setDetectBusy(true);
    setErrors([]);
    try {
      const { extractThumbnailFromFile } = await import('../../lib/thumbnail-extractor');
      const res = await extractThumbnailFromFile(file, f.title);
      setF((prev) => ({ ...prev, cover_image: res.coverImage, cover_ratio: res.coverRatio }));
      toast('Detected page 1 thumbnail & aspect ratio');
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setDetectBusy(false);
    }
  };

  const detectFromBookUrl = async () => {
    if (!firstDocRes?.url) return;
    setDetectBusy(true);
    setErrors([]);
    try {
      const { extractThumbnailFromUrl } = await import('../../lib/thumbnail-extractor');
      const res = await extractThumbnailFromUrl(firstDocRes.url, firstDocRes.type as 'pdf' | 'ppt', f.title);
      setF((prev) => ({ ...prev, cover_image: res.coverImage, cover_ratio: res.coverRatio }));
      toast('Detected thumbnail from material');
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setDetectBusy(false);
    }
  };

  const submit = async () => {
    const id = isNew ? f.id || slugify(f.title) : f.id;
    const isCustomSub = f.subject_id === '__custom__';
    const customSubName = f.custom_subject.trim();
    const customSubId = customSubName ? slugify(customSubName) : '';
    const resolvedSubjectId = isCustomSub ? customSubId : f.subject_id;

    const errs = [
      !isId(id) && 'ID may use letters, digits, dot, dash and underscore.',
      f.title.trim().length < 2 && 'Title is too short.',
      isCustomSub
        ? (customSubName.length < 2 || !isId(customSubId)) && 'Enter a valid custom subject name (e.g. All-in-One).'
        : !f.subject_id && 'Choose a subject or enter a custom subject.',
      f.levels.length !== 1 && 'Choose one learning language.',
    ].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (isNew && content.books.some((b) => b.id === id)) {
      return setErrors([`A book with id "${id}" already exists.`]);
    }
    setBusy(true);
    setErrors([]);
    try {
      // Auto-create custom subject if it doesn't exist yet
      if (isCustomSub && !content.subjects.some((s) => s.id === customSubId)) {
        await apiRequest(`/v1/admin/subjects/${encodeURIComponent(customSubId)}`, {
          method: 'PUT',
          bodyJson: {
            name_en: customSubName,
            name_bn: customSubName,
            name_zh: '',
            icon: 'book',
            color: f.c1 || '#176B4B',
            sort: content.subjects.length,
          },
        });
      }
      await apiRequest(`/v1/admin/books/${id}`, {
        method: 'PUT',
        bodyJson: {
          title: f.title.trim(),
          subject_id: resolvedSubjectId,
          edition: f.edition,
          author: f.author,
          cover: [f.c1, f.c2],
          cover_image: f.cover_image,
          cover_ratio: f.cover_ratio,
          levels: f.levels,
          featured_rank: f.featured === '' ? null : Number(f.featured),
          sort: Number(f.sort) || 0,
          status: f.status,
        },
      });
      toast('Saved');
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
        <label className="space-y-1">
          <span>Title</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>ID <small className="font-normal text-sanzar-muted">{isNew ? '(optional)' : '(locked)'}</small></span>
          <input
            value={isNew ? f.id : book!.id}
            disabled={!isNew}
            placeholder={slugify(f.title)}
            onChange={(e) => setF({ ...f, id: e.target.value })}
            className="sanzar-input text-sm"
          />
        </label>
        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span>Subject</span>
            <select
              value={f.subject_id}
              onChange={(e) => setF({ ...f, subject_id: e.target.value })}
              className="sanzar-input text-sm"
            >
              {content.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name_en}</option>
              ))}
              <option value="__custom__">+ Custom subject…</option>
            </select>
          </label>
          {f.subject_id === '__custom__' && (
            <input
              value={f.custom_subject}
              onChange={(e) => setF({ ...f, custom_subject: e.target.value })}
              placeholder="e.g. All-in-One, Comprehensive, HSK 1 Full"
              className="sanzar-input text-sm"
            />
          )}
        </div>
        <label className="space-y-1">
          <span>Edition</span>
          <input value={f.edition} onChange={(e) => setF({ ...f, edition: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Author / board</span>
          <input value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Status</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="sanzar-input text-sm">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>Featured rank</span>
          <input type="number" min={1} value={f.featured} onChange={(e) => setF({ ...f, featured: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Order</span>
          <input type="number" min={0} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <span>Fallback cover colours</span>
          <div className="flex gap-2">
            <input type="color" value={f.c1} onChange={(e) => setF({ ...f, c1: e.target.value })} className="w-16 h-9 rounded border border-sanzar-border" />
            <input type="color" value={f.c2} onChange={(e) => setF({ ...f, c2: e.target.value })} className="w-16 h-9 rounded border border-sanzar-border" />
          </div>
        </div>
      </div>

      {/* Auto Thumbnail & Aspect Ratio Section */}
      <div className="p-3.5 rounded-xl bg-sanzar-surface2 border border-sanzar-border space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sanzar-text2">Auto Thumbnail (PDF Page 1 / PPT Slide 1)</span>
          {f.cover_ratio != null && (
            <span className="sanzar-pill">Ratio {f.cover_ratio.toFixed(2)}:1</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <BookCover
            colors={[f.c1, f.c2]}
            title={f.title || 'Book'}
            imageUrl={f.cover_image}
            aspectRatio={f.cover_ratio}
            size="md"
          />
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface cursor-pointer font-semibold hover:border-sanzar-primary transition">
              <span>{detectBusy ? 'Detecting…' : 'Detect from PDF / PPT file'}</span>
              <input
                type="file"
                disabled={detectBusy}
                accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void detectFromFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {firstDocRes?.url && (
                <button
                  type="button"
                  disabled={detectBusy}
                  onClick={detectFromBookUrl}
                  className="px-3 py-1 rounded-lg border border-sanzar-primary/40 text-sanzar-primary font-semibold hover:bg-sanzar-primarySoft transition disabled:opacity-50"
                >
                  Auto-detect from material URL
                </button>
              )}
              {f.cover_image && (
                <button
                  type="button"
                  onClick={() => setF({ ...f, cover_image: null, cover_ratio: null })}
                  className="px-3 py-1 rounded-lg border border-sanzar-border text-sanzar-muted font-semibold hover:text-sanzar-danger transition"
                >
                  Clear thumbnail
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-sanzar-text2">Learning language</legend>
        <div className="flex flex-wrap gap-3">
          {LEVELS.map((l) => (
            <label key={l.id} className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
              <input
                type="radio"
                name="book-learning-language"
                checked={f.levels[0] === l.id}
                onChange={() => setF({ ...f, levels: [l.id] })}
              />
              {l.name}
            </label>
          ))}
        </div>
      </fieldset>

      <ErrorsBox list={errors} />
      <button
        onClick={submit}
        disabled={busy || !content.subjects.length}
        className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
      >
        Save book
      </button>
    </div>
  );
};

const SubjectForm: React.FC<{ subject: AdminSubject | null; subjects: AdminSubject[]; onDone: () => void }> = ({
  subject,
  subjects,
  onDone,
}) => {
  const toast = useToast();
  const isNew = !subject;
  const [f, setF] = useState({
    id: subject?.id ?? '',
    name_en: subject?.name_en ?? '',
    color: subject?.color ?? '#247754',
    sort: String(subject?.sort ?? 0),
    thumbnail_url: subject?.thumbnail_url ?? '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const rawName = f.name_en.trim();
    const id = isNew ? f.id || slugify(rawName) || `sub-${Date.now().toString(36)}` : subject!.id;
    const thumb = f.thumbnail_url.trim();
    const errs = [
      !isId(id) && 'ID may use letters, digits, dot, dash and underscore.',
      rawName.length < 2 && 'Name must be at least 2 characters.',
      thumb && !isValidThumbValue(thumb) && 'Thumbnail must be an uploaded image or https:// URL',
    ].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    if (isNew && subjects.some((s) => s.id === id)) return setErrors([`A subject with id "${id}" already exists.`]);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/subjects/${id}`, {
        method: 'PUT',
        bodyJson: {
          name_en: rawName,
          name_bn: '',
          name_zh: '',
          color: f.color,
          sort: Number(f.sort) || 0,
          thumbnail_url: thumb || null,
        },
      });
      toast('Saved');
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
        <label className="space-y-1 sm:col-span-2">
          <span>Name (any language)</span>
          <input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>ID <small className="font-normal text-sanzar-muted">{isNew ? '(auto or custom ASCII)' : '(locked)'}</small></span>
          <input
            value={isNew ? f.id : subject!.id}
            disabled={!isNew}
            placeholder={slugify(f.name_en) || 'subject-id'}
            onChange={(e) => setF({ ...f, id: e.target.value })}
            className="sanzar-input text-sm"
          />
        </label>
        <label className="space-y-1">
          <span>Order</span>
          <input type="number" min={0} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Colour</span>
          <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="w-16 h-9 rounded border border-sanzar-border" />
        </label>
        <ThumbnailField
          value={f.thumbnail_url}
          onChange={(val) => setF({ ...f, thumbnail_url: val })}
          className="sm:col-span-2"
        />
      </div>
      <ErrorsBox list={errors} />
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        Save subject
      </button>
    </div>
  );
};

/* ---------------- BOOK DETAIL (WHOLE BOOK & CHAPTERS) ---------------- */
const BookDetailView: React.FC<{ bookId: string }> = ({ bookId }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });
  const [editing, setEditing] = useState<AdminChapter | null | undefined>(undefined);
  const [creatingWhole, setCreatingWhole] = useState(false);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const data = q.data;
  const book = data.books.find((b) => b.id === bookId);
  if (!book) {
    return (
      <div className="space-y-3">
        <p className="text-sanzar-danger">Book not found.</p>
        <Link to="/admin/content" className="text-sm text-sanzar-primary font-semibold hover:underline">
          ← Back
        </Link>
      </div>
    );
  }
  const allChapters = data.chapters.filter((c) => c.book_id === bookId);
  const wholeBookId = `${bookId}-full`;
  const wholeBook = allChapters.find((c) => c.id === wholeBookId || c.number === 0);
  const chapters = allChapters.filter((c) => c.id !== wholeBook?.id);
  const hasNotes = new Set(data.notes.map((n) => n.chapter_id));

  const openWholeBook = async () => {
    if (wholeBook) {
      navigate(`/admin/content/chapter/${encodeURIComponent(wholeBook.id)}`);
      return;
    }
    setCreatingWhole(true);
    try {
      await apiRequest(`/v1/admin/chapters/${wholeBookId}`, {
        method: 'PUT',
        bodyJson: { book_id: bookId, number: 0, title: `${book.title} — Full Edition`, status: 'published' },
      });
      await qc.invalidateQueries({ queryKey: ['admin', 'content'] });
      toast('Whole book content enabled');
      navigate(`/admin/content/chapter/${encodeURIComponent(wholeBookId)}`);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setCreatingWhole(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/admin/content" className="text-sm font-semibold text-sanzar-primary hover:underline">
        ← Books
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">{book.title}</h1>
          <StatusPill s={book.status} />
        </div>
        <button
          onClick={() => setEditing(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          New chapter
        </button>
      </div>

      {/* Whole Book Content Option */}
      <div className="sanzar-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={openWholeBook}
            disabled={creatingWhole}
            className="font-bold text-sm text-sanzar-primary hover:underline text-left disabled:opacity-50"
          >
            Whole Book Content
          </button>
          <p className="text-xs text-sanzar-muted">
            Add notes, PDFs/videos/links, and questions for the whole book at once (shown to learners as &ldquo;Full Edition&rdquo;) — or add separate chapters below.
          </p>
          {wholeBook && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-sanzar-text2">
              <span>Notes: {hasNotes.has(wholeBook.id) ? '✓' : '—'}</span>
              <span>Materials: {data.resources.filter((r) => r.chapter_id === wholeBook.id).length}</span>
              <span>Questions: {data.questionCounts[wholeBook.id] ?? 0}</span>
              <StatusPill s={wholeBook.status} />
            </div>
          )}
        </div>
        <button
          onClick={openWholeBook}
          disabled={creatingWhole}
          className="px-4 py-2 rounded-xl border border-sanzar-primary text-sanzar-primary text-sm font-semibold hover:bg-sanzar-primarySoft transition disabled:opacity-50"
        >
          {creatingWhole ? '…' : wholeBook ? 'Manage whole book' : 'Add whole book content'}
        </button>
      </div>

      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">#</th>
              <th className="p-3 font-semibold">Chapter</th>
              <th className="p-3 font-semibold">Notes</th>
              <th className="p-3 font-semibold">Materials</th>
              <th className="p-3 font-semibold">Quiz</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {chapters.map((c) => (
              <tr key={c.id} className="border-b border-sanzar-border last:border-0">
                <td className="p-3">{c.number}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/admin/content/chapter/${encodeURIComponent(c.id)}`}
                      className="font-bold text-sanzar-primary hover:underline"
                    >
                      {c.title}
                    </Link>
                    {!!c.is_whole_chapter && <span className="sanzar-pill text-[10px]">Whole chapter</span>}
                  </div>
                </td>
                <td className="p-3">{hasNotes.has(c.id) ? '✓' : '—'}</td>
                <td className="p-3">{data.resources.filter((r) => r.chapter_id === c.id).length}</td>
                <td className="p-3">{data.questionCounts[c.id] ?? 0}</td>
                <td className="p-3"><StatusPill s={c.status} /></td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <Link
                    to={`/admin/content/chapter/${encodeURIComponent(c.id)}`}
                    className="inline-block px-3 py-1 rounded-lg border border-sanzar-primary/50 text-sanzar-primary text-xs font-semibold hover:bg-sanzar-primarySoft"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => setEditing(c)}
                    className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Delete chapter "${c.title}" and all its materials, notes, quiz & Q&A?`)) return;
                      try {
                        await apiRequest(`/v1/admin/chapters/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
                        toast('Chapter deleted');
                        void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
                      } catch (e) {
                        toast(errorText(e));
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <Modal
          title={editing ? `Edit chapter ${editing.number}` : 'New chapter'}
          onClose={() => setEditing(undefined)}
        >
          <ChapterForm
            bookId={bookId}
            chapter={editing}
            nextNumber={Math.max(0, ...chapters.map((c) => c.number)) + 1}
            onDone={() => {
              setEditing(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
            }}
          />
        </Modal>
      )}
    </div>
  );
};

const ChapterForm: React.FC<{ bookId: string; chapter: AdminChapter | null; nextNumber: number; onDone: () => void }> = ({
  bookId,
  chapter,
  nextNumber,
  onDone,
}) => {
  const toast = useToast();
  const [n, setN] = useState(String(chapter?.number ?? nextNumber));
  const [title, setTitle] = useState(chapter?.title ?? '');
  const [status, setStatus] = useState(chapter?.status ?? 'published');
  const [isWholeChapter, setIsWholeChapter] = useState(Boolean(chapter?.is_whole_chapter));
  const [thumbnailUrl, setThumbnailUrl] = useState(chapter?.thumbnail_url ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const id = chapter?.id ?? `${bookId}-${String(Number(n) || 0).padStart(2, '0')}`;

  const submit = async () => {
    const thumb = thumbnailUrl.trim();
    if (!title.trim()) return setErrors(['Title is required.']);
    if (!isId(id)) return setErrors(['Invalid id.']);
    if (thumb && !isValidThumbValue(thumb)) return setErrors(['Thumbnail must be an uploaded image or https:// URL']);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/chapters/${id}`, {
        method: 'PUT',
        bodyJson: {
          book_id: bookId,
          number: Number(n),
          title: title.trim(),
          status,
          is_whole_chapter: isWholeChapter,
          thumbnail_url: thumb || null,
        },
      });
      toast('Saved');
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
        <label className="space-y-1">
          <span>Number</span>
          <input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="sanzar-input text-sm">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>ID</span>
          <input value={id} disabled className="sanzar-input text-sm opacity-60" />
        </label>
        <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} className="sm:col-span-2" />
        <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isWholeChapter}
            onChange={(e) => setIsWholeChapter(e.target.checked)}
            className="accent-sanzar-primary"
          />
          <span>Whole chapter (single unit — no separate lessons needed)</span>
        </label>
      </div>
      <ErrorsBox list={errors} />
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        Save chapter
      </button>
    </div>
  );
};

/* ---------------- CHAPTER DETAIL (NOTES, MATERIALS, QUESTIONS) ---------------- */
interface AdminQuestion {
  id: string;
  text: string;
  options: string[];
  answer: number;
  explanation: string;
  xp_points?: number | null;
  status: string;
  current_version: number;
  difficulty: number;
}

const ChapterDetailView: React.FC<{ chapterId: string }> = ({ chapterId }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const contentQ = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });
  const qsQ = useQuery({
    queryKey: ['admin', 'questions', chapterId],
    queryFn: () =>
      apiRequest<{ questions: AdminQuestion[] }>(
        `/v1/admin/questions?chapter=${encodeURIComponent(chapterId)}`
      ),
  });
  const qaQ = useQuery({
    queryKey: ['admin', 'qa', chapterId],
    queryFn: () =>
      apiRequest<{ items: AdminQaItem[] }>(
        `/v1/admin/qa?chapter=${encodeURIComponent(chapterId)}`
      ),
  });

  const [resModal, setResModal] = useState<AdminResource | null | undefined>(undefined);
  const [qModal, setQModal] = useState<AdminQuestion | null | undefined>(undefined);
  const [qaModal, setQaModal] = useState<AdminQaItem | null | undefined>(undefined);

  if (contentQ.isLoading) return <LoadingState />;
  if (contentQ.isError || !contentQ.data) {
    return <ErrorRetry message={errorText(contentQ.error)} onRetry={() => contentQ.refetch()} />;
  }

  const c = contentQ.data;
  const ch = c.chapters.find((x) => x.id === chapterId);
  if (!ch) return <ErrorRetry message="Chapter not found." />;
  const book = c.books.find((b) => b.id === ch.book_id);
  const resources = c.resources.filter((r) => r.chapter_id === chapterId);

  return (
    <div className="space-y-6">
      <Link
        to={`/admin/content/book/${encodeURIComponent(ch.book_id)}`}
        className="text-sm font-semibold text-sanzar-primary hover:underline"
      >
        ← {book?.title}
      </Link>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-extrabold">
          {ch.number === 0 ? `Whole Book: ${ch.title}` : `Chapter ${ch.number}: ${ch.title}`}
        </h1>
        {!!ch.is_whole_chapter && <span className="sanzar-pill">Whole chapter</span>}
        <StatusPill s={ch.status} />
      </div>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Notes</h2>
        <div className="sanzar-card p-5">
          <NotesEditor chapterId={chapterId} />
        </div>
      </section>

      {/* Study materials */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Study materials</h2>
          <button
            onClick={() => setResModal(null)}
            className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
          >
            Add material
          </button>
        </div>
        {resources.length === 0 ? (
          <p className="text-xs text-sanzar-muted">No PDFs, videos or slides yet.</p>
        ) : (
          <div className="sanzar-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                  <th className="p-3 font-semibold">Title</th>
                  <th className="p-3 font-semibold">Type</th>
                  <th className="p-3 font-semibold">Version</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id} className="border-b border-sanzar-border last:border-0">
                    <td className="p-3">
                      <b>{r.title || r.id}</b>
                      <div className="text-xs text-sanzar-muted truncate max-w-xs">{r.url}</div>
                    </td>
                    <td className="p-3">{r.type}</td>
                    <td className="p-3 text-xs">
                      v{r.current_version}
                      {r.versions.length > 1 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-sanzar-primary">history</summary>
                          <div className="space-y-1 mt-1">
                            {r.versions.map((v) => (
                              <div key={v.version} className="flex items-center gap-2">
                                <span>v{v.version} · {fmtTime(v.created_at)}</span>
                                {v.version !== r.current_version && (
                                  <button
                                    onClick={async () => {
                                      await apiRequest(`/v1/admin/resources/${r.id}/rollback`, {
                                        method: 'POST',
                                        bodyJson: { version: v.version },
                                      });
                                      toast(`Restored v${v.version}`);
                                      void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
                                    }}
                                    className="px-2 py-0.5 rounded border border-sanzar-border text-[11px] font-semibold"
                                  >
                                    Restore
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="p-3"><StatusPill s={r.status} /></td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setResModal(r)}
                        className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Delete material "${r.title || r.id}"?`)) return;
                          try {
                            await apiRequest(`/v1/admin/resources/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
                            toast('Material deleted');
                            void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
                          } catch (e) {
                            toast(errorText(e));
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quiz (Multiple-Choice) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Quiz</h2>
          <button
            onClick={() => setQModal(null)}
            className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
          >
            Add quiz question
          </button>
        </div>
        {qsQ.isLoading ? (
          <LoadingState />
        ) : (qsQ.data?.questions.length ?? 0) === 0 ? (
          <p className="text-xs text-sanzar-muted">No quiz questions yet. A chapter quiz needs at least 3.</p>
        ) : (
          <div className="sanzar-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                  <th className="p-3 font-semibold">Quiz Question</th>
                  <th className="p-3 font-semibold">Correct option</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {qsQ.data!.questions.map((x) => (
                  <tr key={x.id} className="border-b border-sanzar-border last:border-0">
                    <td className="p-3">{x.text}</td>
                    <td className="p-3">{x.options[x.answer]}</td>
                    <td className="p-3"><StatusPill s={x.status} /></td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setQModal(x)}
                        className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Delete this quiz question?')) return;
                          try {
                            await apiRequest(`/v1/admin/questions/${encodeURIComponent(x.id)}`, { method: 'DELETE' });
                            toast('Quiz question deleted');
                            void qc.invalidateQueries({ queryKey: ['admin', 'questions', chapterId] });
                            void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
                          } catch (e) {
                            toast(errorText(e));
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Question & Answer (Q&A) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Question &amp; Answer (Q&amp;A)</h2>
          <button
            onClick={() => setQaModal(null)}
            className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
          >
            Add Q&amp;A
          </button>
        </div>
        {qaQ.isLoading ? (
          <LoadingState />
        ) : (qaQ.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-sanzar-muted">No Q&amp;A pairs yet. Add written questions and model answers for this chapter.</p>
        ) : (
          <div className="sanzar-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                  <th className="p-3 font-semibold">Question</th>
                  <th className="p-3 font-semibold">Answer</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {qaQ.data!.items.map((item) => (
                  <tr key={item.id} className="border-b border-sanzar-border last:border-0">
                    <td className="p-3 font-medium max-w-xs">{item.question}</td>
                    <td className="p-3 text-xs text-sanzar-text2 max-w-md truncate">{item.answer}</td>
                    <td className="p-3"><StatusPill s={item.status} /></td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setQaModal(item)}
                        className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Delete this Q&A item?')) return;
                          try {
                            await apiRequest(`/v1/admin/qa/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                            toast('Q&A deleted');
                            void qc.invalidateQueries({ queryKey: ['admin', 'qa', chapterId] });
                          } catch (e) {
                            toast(errorText(e));
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {qaModal !== undefined && (
        <Modal title={qaModal ? 'Edit Q&A' : 'Add Q&A'} onClose={() => setQaModal(undefined)}>
          <QaForm
            chapterId={chapterId}
            item={qaModal}
            onDone={() => {
              setQaModal(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'qa', chapterId] });
            }}
          />
        </Modal>
      )}

      {resModal !== undefined && (
        <Modal title={resModal ? 'Edit material' : 'Add material'} onClose={() => setResModal(undefined)}>
          <ResourceForm
            chapterId={chapterId}
            book={book}
            res={resModal}
            onDone={() => {
              setResModal(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
            }}
          />
        </Modal>
      )}

      {qModal !== undefined && (
        <Modal title={qModal ? 'Edit question' : 'Add question'} onClose={() => setQModal(undefined)}>
          <QuestionForm
            chapterId={chapterId}
            q={qModal}
            onDone={() => {
              setQModal(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'questions', chapterId] });
              void qc.invalidateQueries({ queryKey: ['admin', 'content'] });
            }}
          />
        </Modal>
      )}
    </div>
  );
};

interface NotesRes {
  chapterId: string;
  current: number | null;
  versions: { version: number; sections: NoteSection[]; createdBy: string; createdAt: number }[];
}

const NotesEditor: React.FC<{ chapterId: string }> = ({ chapterId }) => {
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'notes', chapterId],
    queryFn: () => apiRequest<NotesRes>(`/v1/admin/notes/${chapterId}`),
  });
  const [sections, setSections] = useState<(NoteSection & { termsText: string })[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const cur = q.data.versions.find((v) => v.version === q.data.current);
    setSections(
      (cur?.sections ?? []).map((s) => ({
        ...s,
        page: s.page ?? null,
        terms: s.terms ?? [],
        termsText: (s.terms ?? []).join(', '),
      }))
    );
  }, [q.data]);

  if (q.isLoading || !sections) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const upd = (i: number, k: string, v: unknown) =>
    setSections(sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, d: number) => {
    const a = [...sections];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    setSections(a);
  };

  const submit = async () => {
    const clean = sections.map((s) => ({
      heading: s.heading.trim(),
      page: s.page,
      text: s.text.trim(),
      terms: parseTerms(s.termsText),
    }));
    const errs = validateSections(clean);
    if (errs.length) return setErrors(errs);
    setBusy(true);
    setErrors([]);
    try {
      await apiRequest(`/v1/admin/notes/${chapterId}`, {
        method: 'PUT',
        bodyJson: { sections: clean },
      });
      toast('Notes saved as a new version');
      void q.refetch();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-sanzar-muted">
        Current version: {q.data.current ?? 'none'} · Saving creates a new version; students and the AI Tutor see it immediately.
      </p>
      {sections.map((s, i) => (
        <div key={i} className="p-3.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 space-y-3">
          <div className="flex items-center justify-between">
            <b className="text-sm">Section {i + 1}</b>
            <div className="flex gap-1.5">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="px-2 py-1 rounded border border-sanzar-border text-xs">↑</button>
              <button disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="px-2 py-1 rounded border border-sanzar-border text-xs">↓</button>
              <button
                onClick={() => setSections(sections.filter((_, j) => j !== i))}
                className="px-2.5 py-1 rounded border border-sanzar-danger text-sanzar-danger text-xs font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-xs font-semibold text-sanzar-text2">
            <label className="space-y-1">
              <span>Heading</span>
              <input value={s.heading} onChange={(e) => upd(i, 'heading', e.target.value)} className="sanzar-input text-sm" />
            </label>
            <label className="space-y-1">
              <span>Book page</span>
              <input
                type="number"
                min={1}
                value={s.page ?? ''}
                onChange={(e) => upd(i, 'page', e.target.value === '' ? null : Number(e.target.value))}
                className="sanzar-input text-sm"
              />
            </label>
            <label className="space-y-1">
              <span>Bangla search terms</span>
              <input value={s.termsText} onChange={(e) => upd(i, 'termsText', e.target.value)} className="sanzar-input text-sm" />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
            <span>Text</span>
            <textarea rows={4} value={s.text} onChange={(e) => upd(i, 'text', e.target.value)} className="sanzar-input text-sm" />
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => setSections([...sections, { heading: '', page: null, text: '', terms: [], termsText: '' }])}
          className="px-4 py-2 rounded-xl border border-sanzar-border text-xs font-semibold"
        >
          Add section
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold disabled:opacity-50"
        >
          Save notes
        </button>
      </div>
      <ErrorsBox list={errors} />
      {q.data.versions.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-sanzar-primary">
            Version history ({q.data.versions.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {q.data.versions.map((v) => (
              <div key={v.version} className="flex items-center justify-between p-2 rounded-lg bg-sanzar-surface2">
                <span>
                  v{v.version} · {fmtTime(v.createdAt)} · {v.sections.length} sections
                </span>
                {v.version === q.data.current ? (
                  <StatusPill s="published" />
                ) : (
                  <button
                    onClick={async () => {
                      await apiRequest(`/v1/admin/notes/${chapterId}/rollback`, {
                        method: 'POST',
                        bodyJson: { version: v.version },
                      });
                      toast(`Restored v${v.version}`);
                      void q.refetch();
                    }}
                    className="px-2.5 py-1 rounded border border-sanzar-border font-semibold"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

const ResourceForm: React.FC<{ chapterId: string; book?: AdminBook; res: AdminResource | null; onDone: () => void }> = ({
  chapterId,
  book,
  res,
  onDone,
}) => {
  const toast = useToast();
  const [f, setF] = useState({
    id: res?.id ?? '',
    type: res?.type ?? 'pdf',
    title: res?.title ?? '',
    url: res?.url ?? '',
    licence: res?.licence ?? '',
    status: res?.status ?? 'published',
    thumbnail_url: res?.thumbnail_url ?? '',
    note: '',
  });
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [autoThumb, setAutoThumb] = useState(() => !book?.cover_image);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id =
      res?.id ??
      (f.id || `${chapterId}-${f.type}-${slugify(f.title).slice(0, 20) || Date.now().toString(36)}`);
    const trimmedUrl = f.url.trim();
    const trimmedThumb = f.thumbnail_url.trim();
    const errs = [
      !isId(id) && 'Invalid id.',
      f.type === 'link' && !trimmedUrl && 'Link is required.',
      trimmedUrl && !isHttps(trimmedUrl) && 'Link must start with https://',
      trimmedThumb && !isValidThumbValue(trimmedThumb) && 'Thumbnail must be an uploaded image or https:// URL',
      f.title.trim().length < 2 && 'Add a title.',
    ].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/resources/${id}`, {
        method: 'PUT',
        bodyJson: {
          chapter_id: chapterId,
          type: f.type,
          title: f.title.trim(),
          url: trimmedUrl,
          licence: f.licence,
          status: f.status,
          thumbnail_url: trimmedThumb || null,
          change_note: f.note,
        },
      });
      if ((f.type === 'pdf' || f.type === 'ppt') && book && (localFile || (autoThumb && trimmedUrl))) {
        try {
          const { extractThumbnailFromFile, extractThumbnailFromUrl } = await import('../../lib/thumbnail-extractor');
          const thumb = localFile
            ? await extractThumbnailFromFile(localFile, f.title)
            : await extractThumbnailFromUrl(trimmedUrl, f.type as 'pdf' | 'ppt', f.title);
          await apiRequest(`/v1/admin/books/${encodeURIComponent(book.id)}/cover`, {
            method: 'PATCH',
            bodyJson: { cover_image: thumb.coverImage, cover_ratio: thumb.coverRatio },
          });
          toast('Saved material & updated book thumbnail');
        } catch (thumbErr) {
          toast(`Material saved (thumbnail skipped: ${errorText(thumbErr)})`);
        }
      } else {
        toast('Saved');
      }
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-xs font-semibold text-sanzar-text2">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Type</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="sanzar-input text-sm">
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
            <option value="ppt">Slides</option>
            <option value="link">Link</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>Title</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span>Status</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="sanzar-input text-sm">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span>
          Link (https://){' '}
          {f.type !== 'link' && <small className="font-normal text-sanzar-muted">(optional)</small>}
        </span>
        <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" className="sanzar-input text-sm" />
      </label>
      <ThumbnailField value={f.thumbnail_url} onChange={(val) => setF({ ...f, thumbnail_url: val })} />
      {(f.type === 'pdf' || f.type === 'ppt') && book && (
        <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoThumb || !!localFile}
              onChange={(e) => setAutoThumb(e.target.checked)}
              className="accent-sanzar-primary"
            />
            <span>Set page 1 as book thumbnail &amp; match aspect ratio</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="px-3 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface cursor-pointer hover:border-sanzar-primary transition">
              <span>{localFile ? localFile.name : 'Pick PDF / PPT file for thumbnail (optional)'}</span>
              <input
                type="file"
                accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setLocalFile(file);
                  if (file) setAutoThumb(true);
                }}
              />
            </label>
            {localFile && (
              <button type="button" onClick={() => setLocalFile(null)} className="text-sanzar-danger hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      <label className="block space-y-1">
        <span>Licence / source</span>
        <input value={f.licence} onChange={(e) => setF({ ...f, licence: e.target.value })} className="sanzar-input text-sm" />
      </label>
      {res && (
        <label className="block space-y-1">
          <span>Change note</span>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="sanzar-input text-sm" />
        </label>
      )}
      <ErrorsBox list={errors} />
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        {busy ? 'Saving…' : 'Save material'}
      </button>
    </div>
  );
};

const QuestionForm: React.FC<{ chapterId: string; q: AdminQuestion | null; onDone: () => void }> = ({
  chapterId,
  q,
  onDone,
}) => {
  const toast = useToast();
  const [text, setText] = useState(q?.text ?? '');
  const [options, setOptions] = useState<string[]>(q?.options ?? ['', '', '', '']);
  const [answer, setAnswer] = useState<number | null>(q?.answer ?? null);
  const [explanation, setExplanation] = useState(q?.explanation ?? '');
  const [xpPoints, setXpPoints] = useState(q?.xp_points != null ? String(q.xp_points) : '');
  const [status, setStatus] = useState(q?.status ?? 'published');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const errs = validateQuestion({ text, options, answer });
    if (xpPoints.trim() !== '') {
      const n = Number(xpPoints);
      if (!Number.isInteger(n) || n < 0 || n > 1000) errs.push('XP points must be a whole number (0–1000).');
    }
    if (errs.length) return setErrors(errs);
    const id = q?.id ?? `${chapterId}-q${Date.now().toString(36)}`;
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/questions/${id}`, {
        method: 'PUT',
        bodyJson: {
          chapter_id: chapterId,
          text: text.trim(),
          options: options.map((o) => o.trim()),
          answer,
          explanation: explanation.trim(),
          xp_points: xpPoints.trim() === '' ? null : Number(xpPoints),
          status,
        },
      });
      toast('Saved');
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-xs font-semibold text-sanzar-text2">
      <label className="block space-y-1">
        <span>Question</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className="sanzar-input text-sm" />
      </label>
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="radio" name="answer" checked={answer === i} onChange={() => setAnswer(i)} />
          <input
            value={o}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
            className="sanzar-input text-sm flex-1"
          />
          {options.length > 2 && (
            <button
              onClick={() => {
                setOptions(options.filter((_, j) => j !== i));
                setAnswer(answer === i ? null : answer !== null && answer > i ? answer - 1 : answer);
              }}
              className="px-2 py-1 rounded border border-sanzar-border text-xs"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <button onClick={() => setOptions([...options, ''])} className="text-sanzar-primary hover:underline">
          + Add option
        </button>
      )}
      <label className="block space-y-1">
        <span>Explanation</span>
        <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} className="sanzar-input text-sm" />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span>XP points <small className="font-normal text-sanzar-muted">(blank = default)</small></span>
          <input
            type="number"
            min={0}
            max={1000}
            value={xpPoints}
            onChange={(e) => setXpPoints(e.target.value)}
            placeholder="Default"
            className="sanzar-input text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="sanzar-input text-sm">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
      </div>
      <ErrorsBox list={errors} />
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        Save question
      </button>
    </div>
  );
};


const QaForm: React.FC<{ chapterId: string; item: AdminQaItem | null; onDone: () => void }> = ({
  chapterId,
  item,
  onDone,
}) => {
  const toast = useToast();
  const [question, setQuestion] = useState(item?.question ?? '');
  const [answer, setAnswer] = useState(item?.answer ?? '');
  const [sort, setSort] = useState(String(item?.sort ?? 0));
  const [status, setStatus] = useState(item?.status ?? 'published');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const errs = [
      question.trim().length < 2 && 'Question must be at least 2 characters.',
      !answer.trim() && 'Answer is required.',
    ].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    const id = item?.id ?? `${chapterId}-qa-${Date.now().toString(36)}`;
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/qa/${encodeURIComponent(id)}`, {
        method: 'PUT',
        bodyJson: {
          chapter_id: chapterId,
          question: question.trim(),
          answer: answer.trim(),
          sort: Number(sort) || 0,
          status,
        },
      });
      toast('Q&A saved');
      onDone();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-xs font-semibold text-sanzar-text2">
      <label className="block space-y-1">
        <span>Question</span>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Write the question…"
          className="sanzar-input text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span>Answer</span>
        <textarea
          rows={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write the full answer…"
          className="sanzar-input text-sm"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Order</span>
          <input type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="sanzar-input text-sm">
            <option>draft</option>
            <option>published</option>
            <option>archived</option>
          </select>
        </label>
      </div>
      <ErrorsBox list={errors} />
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50">
        Save Q&amp;A
      </button>
    </div>
  );
};
