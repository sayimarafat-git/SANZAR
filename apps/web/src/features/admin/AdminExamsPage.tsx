import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { isId, LEVELS, slugify } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, StatusPill, useToast } from '../../components/SanzarUI';
import type { AdminContent, AdminExam } from './AdminContentPage';

const getBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: 'Asia/Dhaka', label: 'Asia/Dhaka (Bangladesh, UTC+6)' },
  { id: 'Asia/Shanghai', label: 'Asia/Shanghai (China, UTC+8)' },
  { id: 'Asia/Kolkata', label: 'Asia/Kolkata (India, UTC+5:30)' },
  { id: 'Asia/Riyadh', label: 'Asia/Riyadh (Saudi Arabia, UTC+3)' },
  { id: 'Asia/Dubai', label: 'Asia/Dubai (UAE, UTC+4)' },
  { id: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { id: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan, UTC+9)' },
  { id: 'Europe/London', label: 'Europe/London (UK)' },
  { id: 'America/New_York', label: 'America/New_York (US Eastern)' },
  { id: 'America/Los_Angeles', label: 'America/Los_Angeles (US Pacific)' },
  { id: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

const formatInTimeZone = (ms: number | null | undefined, timeZone: string): string => {
  if (!ms) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(ms));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch {
    return new Date(ms).toISOString().slice(0, 16);
  }
};

const parseInTimeZone = (value: string, timeZone: string): number | null => {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, ys, ms, ds, hs, mins] = m;
  const targetAsUtc = Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), 0, 0);
  try {
    const getOffsetMs = (utcMs: number) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(new Date(utcMs));
      const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      const zonedAsUtc = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
        0
      );
      return zonedAsUtc - utcMs;
    };
    let guess = targetAsUtc - getOffsetMs(targetAsUtc);
    guess = targetAsUtc - getOffsetMs(guess);
    return guess;
  } catch {
    return targetAsUtc;
  }
};

const languageLabel = (levelId?: string | null): string => {
  if (!levelId) return 'All learners';
  return LEVELS.find((l) => l.id === levelId)?.name ?? levelId;
};

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Exams &amp; Quizzes</h1>
          <p className="text-xs text-sanzar-muted mt-0.5">
            Create chapter quizzes or full-book model tests for targeted language learners.
          </p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          New exam / quiz
        </button>
      </div>

      <div className="sanzar-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
              <th className="p-3 font-semibold">Exam / Quiz</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Target</th>
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
                <td className="p-3">
                  <span className="sanzar-pill">{languageLabel(e.level_id)}</span>
                  {e.time_zone && <div className="text-[11px] text-sanzar-muted mt-1">{e.time_zone}</div>}
                </td>
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
        <Modal title={editing ? 'Edit exam / quiz' : 'New exam / quiz'} onClose={() => setEditing(undefined)}>
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
  const browserTz = useMemo(() => getBrowserTimeZone(), []);
  const initialTz = exam?.time_zone || browserTz;

  const [f, setF] = useState({
    id: exam?.id ?? '',
    title: exam?.title ?? '',
    type: exam?.type ?? 'chapter_quiz',
    level_id: exam?.level_id ?? '',
    book_id: exam?.book_id ?? c.books[0]?.id ?? '',
    chapter_id: exam?.chapter_id ?? c.chapters[0]?.id ?? '',
    minutes: String(Math.round((exam?.duration_sec ?? 1200) / 60)),
    count: String(exam?.question_count ?? 20),
    pass: String(exam?.pass_pct ?? 60),
    xp: exam?.xp_reward != null ? String(exam.xp_reward) : '',
    status: exam?.status ?? 'draft',
    time_zone: initialTz,
    opens: formatInTimeZone(exam?.opens_at ?? null, initialTz),
    closes: formatInTimeZone(exam?.closes_at ?? null, initialTz),
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const timeZoneOptions = useMemo(() => {
    const presetMap = new Map(COMMON_TIME_ZONES.map((z) => [z.id, z.label]));
    const pinned: { id: string; label: string }[] = [];
    const seen = new Set<string>();

    const addPinned = (id: string, label?: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      pinned.push({ id, label: label ?? presetMap.get(id) ?? id });
    };

    addPinned(browserTz, `${browserTz} (Your region)`);
    if (exam?.time_zone) addPinned(exam.time_zone);
    for (const z of COMMON_TIME_ZONES) addPinned(z.id, z.label);

    const allSupported =
      ((Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []).filter(
        (z) => !seen.has(z)
      );

    return { pinned, allSupported };
  }, [browserTz, exam?.time_zone]);

  const visibleBooks = useMemo(
    () => (f.level_id ? c.books.filter((b) => !b.levels.length || b.levels.includes(f.level_id)) : c.books),
    [c.books, f.level_id]
  );

  const visibleChapters = useMemo(() => {
    const allowedBookIds = new Set(visibleBooks.map((b) => b.id));
    return c.chapters.filter((ch) => allowedBookIds.has(ch.book_id));
  }, [c.chapters, visibleBooks]);

  const handleLevelChange = (nextLevel: string) => {
    const nextBooks = nextLevel
      ? c.books.filter((b) => !b.levels.length || b.levels.includes(nextLevel))
      : c.books;
    const nextBookIds = new Set(nextBooks.map((b) => b.id));
    const nextChapters = c.chapters.filter((ch) => nextBookIds.has(ch.book_id));
    setF((prev) => ({
      ...prev,
      level_id: nextLevel,
      book_id: nextBookIds.has(prev.book_id) ? prev.book_id : nextBooks[0]?.id ?? '',
      chapter_id: nextChapters.some((ch) => ch.id === prev.chapter_id)
        ? prev.chapter_id
        : nextChapters[0]?.id ?? '',
    }));
  };

  const submit = async () => {
    const id = exam?.id ?? (f.id || slugify(`${f.type === 'model' ? 'mt' : 'cq'} ${f.title}`));
    const opensAt = parseInTimeZone(f.opens, f.time_zone);
    const closesAt = parseInTimeZone(f.closes, f.time_zone);
    const errs = [
      !isId(id) && 'Invalid id.',
      f.title.trim().length < 2 && 'Add a title.',
      f.type === 'model' && !f.book_id && 'Select a book for this model test.',
      f.type === 'chapter_quiz' && !f.chapter_id && 'Select a chapter for this quiz.',
      opensAt && closesAt && closesAt <= opensAt && 'Closing time must be after opening time.',
    ].filter(Boolean) as string[];
    if (f.xp.trim() !== '') {
      const n = Number(f.xp);
      if (!Number.isInteger(n) || n < 0 || n > 10000) errs.push('XP reward must be 0–10000.');
    }
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/exams/${id}`, {
        method: 'PUT',
        bodyJson: {
          title: f.title.trim(),
          type: f.type,
          level_id: f.level_id || null,
          book_id: f.type === 'model' ? f.book_id : null,
          chapter_id: f.type === 'chapter_quiz' ? f.chapter_id : null,
          duration_sec: Math.round(Number(f.minutes) * 60),
          question_count: Number(f.count),
          pass_pct: Number(f.pass),
          xp_reward: f.xp.trim() === '' ? null : Number(f.xp),
          status: f.status,
          time_zone: f.time_zone,
          opens_at: opensAt,
          closes_at: closesAt,
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
        <label className="space-y-1 sm:col-span-2">
          <span>Title</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Type</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="sanzar-input text-sm">
            <option value="chapter_quiz">Chapter quiz</option>
            <option value="model">Model test (whole book)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>Target language learners</span>
          <select value={f.level_id} onChange={(e) => handleLevelChange(e.target.value)} className="sanzar-input text-sm">
            <option value="">All learners</option>
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.name_zh})
              </option>
            ))}
          </select>
        </label>
        {f.type === 'model' ? (
          <label className="space-y-1 sm:col-span-2">
            <span>Book</span>
            <select value={f.book_id} onChange={(e) => setF({ ...f, book_id: e.target.value })} className="sanzar-input text-sm">
              {visibleBooks.length === 0 ? (
                <option value="">No books for this language</option>
              ) : (
                visibleBooks.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))
              )}
            </select>
          </label>
        ) : (
          <label className="space-y-1 sm:col-span-2">
            <span>Chapter</span>
            <select value={f.chapter_id} onChange={(e) => setF({ ...f, chapter_id: e.target.value })} className="sanzar-input text-sm">
              {visibleChapters.length === 0 ? (
                <option value="">No chapters for this language</option>
              ) : (
                visibleChapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {c.books.find((b) => b.id === ch.book_id)?.title} · {ch.number}. {ch.title}
                  </option>
                ))
              )}
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
          <span>XP reward <small className="font-normal text-sanzar-muted">(blank = per-question / default)</small></span>
          <input type="number" min={0} max={10000} value={f.xp} placeholder="Default" onChange={(e) => setF({ ...f, xp: e.target.value })} className="sanzar-input text-sm" />
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
          <span>Locale of time region <small className="font-normal text-sanzar-muted">(auto-detected: {browserTz})</small></span>
          <select value={f.time_zone} onChange={(e) => setF({ ...f, time_zone: e.target.value })} className="sanzar-input text-sm">
            {timeZoneOptions.pinned.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
            {timeZoneOptions.allSupported.length > 0 && (
              <optgroup label="All time regions">
                {timeZoneOptions.allSupported.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="space-y-1">
          <span>Opens ({f.time_zone})</span>
          <input type="datetime-local" value={f.opens} onChange={(e) => setF({ ...f, opens: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Closes ({f.time_zone})</span>
          <input type="datetime-local" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} className="sanzar-input text-sm" />
        </label>
      </div>
      {errors.length > 0 && (
        <div className="text-sanzar-danger">{errors.join(' ')}</div>
      )}
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold">
        Save exam / quiz
      </button>
    </div>
  );
};
