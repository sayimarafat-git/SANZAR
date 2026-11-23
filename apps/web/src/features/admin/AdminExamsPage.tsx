import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { isId, slugify } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, StatusPill, useToast } from '../../components/SanzarUI';
import type { AdminContent, AdminExam } from './AdminContentPage';

const toLocal = (ms: number | null) =>
  ms ? new Date(ms + 6 * 3600_000).toISOString().slice(0, 16) : '';
const fromLocal = (v: string) => (v ? Date.parse(`${v}:00+06:00`) : null);

export const AdminExamsPage: React.FC = () => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => apiRequest<AdminContent>('/v1/admin/content'),
  });
  const [editing, setEditing] = useState<AdminExam | null | undefined>(undefined);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const data = q.data;
  const where = (e: AdminExam) =>
    e.book_id
      ? data.books.find((b) => b.id === e.book_id)?.title
      : (() => {
          const ch = data.chapters.find((c) => c.id === e.chapter_id);
          return ch
            ? `${data.books.find((b) => b.id === ch.book_id)?.title} · ch ${ch.number}`
            : e.chapter_id;
        })();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Exams</h1>
        <button
          onClick={() => setEditing(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          New exam
        </button>
      </div>

      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">Exam</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">For</th>
              <th className="p-3 font-semibold">Questions</th>
              <th className="p-3 font-semibold">Time</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.exams.map((e) => (
              <tr key={e.id} className="border-b border-sanzar-border last:border-0">
                <td className="p-3">
                  <b>{e.title}</b>
                  <div className="text-xs text-sanzar-muted">{e.id}</div>
                </td>
                <td className="p-3">{e.type === 'model' ? 'Model test' : 'Chapter quiz'}</td>
                <td className="p-3">{where(e)}</td>
                <td className="p-3">{e.question_count}</td>
                <td className="p-3">{Math.round(e.duration_sec / 60)} min</td>
                <td className="p-3"><StatusPill s={e.status} /></td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => setEditing(e)}
                    className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <Modal title={editing ? 'Edit exam' : 'New exam'} onClose={() => setEditing(undefined)}>
          <ExamForm
            exam={editing}
            c={data}
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

const ExamForm: React.FC<{ exam: AdminExam | null; c: AdminContent; onDone: () => void }> = ({
  exam,
  c,
  onDone,
}) => {
  const toast = useToast();
  const [f, setF] = useState({
    id: exam?.id ?? '',
    title: exam?.title ?? '',
    type: exam?.type ?? 'model',
    book_id: exam?.book_id ?? c.books[0]?.id ?? '',
    chapter_id: exam?.chapter_id ?? c.chapters[0]?.id ?? '',
    minutes: String(Math.round((exam?.duration_sec ?? 1200) / 60)),
    count: String(exam?.question_count ?? 20),
    pass: String(exam?.pass_pct ?? 60),
    status: exam?.status ?? 'draft',
    opens: toLocal(exam?.opens_at ?? null),
    closes: toLocal(exam?.closes_at ?? null),
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id = exam?.id ?? (f.id || slugify(`${f.type === 'model' ? 'mt' : 'cq'} ${f.title}`));
    const errs = [!isId(id) && 'Invalid id.', f.title.trim().length < 2 && 'Add a title.'].filter(Boolean) as string[];
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/exams/${id}`, {
        method: 'PUT',
        bodyJson: {
          title: f.title.trim(),
          type: f.type,
          book_id: f.type === 'model' ? f.book_id : null,
          chapter_id: f.type === 'chapter_quiz' ? f.chapter_id : null,
          duration_sec: Math.round(Number(f.minutes) * 60),
          question_count: Number(f.count),
          pass_pct: Number(f.pass),
          status: f.status,
          opens_at: fromLocal(f.opens),
          closes_at: fromLocal(f.closes),
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
    <div className="space-y-4 text-xs font-semibold text-sanzar-text2">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Title</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Type</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="sanzar-input text-sm">
            <option value="model">Model test (whole book)</option>
            <option value="chapter_quiz">Chapter quiz</option>
          </select>
        </label>
        {f.type === 'model' ? (
          <label className="space-y-1 sm:col-span-2">
            <span>Book</span>
            <select value={f.book_id} onChange={(e) => setF({ ...f, book_id: e.target.value })} className="sanzar-input text-sm">
              {c.books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="space-y-1 sm:col-span-2">
            <span>Chapter</span>
            <select value={f.chapter_id} onChange={(e) => setF({ ...f, chapter_id: e.target.value })} className="sanzar-input text-sm">
              {c.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {c.books.find((b) => b.id === ch.book_id)?.title} · {ch.number}. {ch.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1">
          <span>Duration (minutes)</span>
          <input type="number" min={1} max={360} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Questions per attempt</span>
          <input type="number" min={1} max={200} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Pass mark %</span>
          <input type="number" min={1} max={100} value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} className="sanzar-input text-sm" />
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
          <span>Opens (Bangladesh time)</span>
          <input type="datetime-local" value={f.opens} onChange={(e) => setF({ ...f, opens: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Closes</span>
          <input type="datetime-local" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} className="sanzar-input text-sm" />
        </label>
      </div>
      {errors.length > 0 && (
        <div className="text-sanzar-danger">{errors.join(' ')}</div>
      )}
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        Save exam
      </button>
    </div>
  );
};
