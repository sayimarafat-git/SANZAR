import React, { Suspense, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  MessageCircleQuestion,
  PlayCircle,
  Presentation,
  Search,
  Trophy,
  Volume2,
  XCircle,
  Link as LinkIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { API_BASE, apiRequest, fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject } from '../../lib/i18n';
import { useStudyTracker } from '../../lib/study-tracker';
import {
  type ActivityCompletion,
  formatCompletedTimestamp,
  getCompletedActivities,
  recordQaCompletion,
  recordQuizCompletion,
} from '../../lib/activity-completion';
import type { ChapterQaItem, ProgressData, Resource } from '../../lib/models';
import { BookCover, ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';

const PptxSlideViewer = React.lazy(() => import('./PptxSlideViewer'));
const PdfCanvasViewer = React.lazy(() => import('./PdfCanvasViewer'));
const DocxDocumentViewer = React.lazy(() => import('./DocxDocumentViewer'));

function detectViewerKind(resource: Resource): 'ppt' | 'pdf' | 'doc' | null {
  const url = resource.url || '';
  if (!url || /docs\.google\.com|drive\.google\.com/i.test(url)) return null;
  const pathPart = url.split('?')[0].toLowerCase();
  if (/\.(pptx|ppt)$/.test(pathPart)) return 'ppt';
  if (/\.pdf$/.test(pathPart)) return 'pdf';
  if (/\.(docx|doc|txt|md|csv)$/.test(pathPart)) return 'doc';
  if (resource.type === 'ppt') return 'ppt';
  if (resource.type === 'pdf') return 'pdf';
  if (resource.type === 'doc') return 'doc';
  return null;
}

function embeddedUrlFor(resource: Resource): string | null {
  const url = resource.url;
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const hostIs = (d: string) => host === d || host.endsWith(`.${d}`);

    if (host === 'youtu.be' || hostIs('youtube.com')) {
      const segs = u.pathname.split('/').filter(Boolean);
      const id =
        host === 'youtu.be'
          ? segs[0]
          : u.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(segs[0]) ? segs[1] : null);
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`;
      }
    }
    if (host === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] || u.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
    if (host === 'docs.google.com' && u.pathname.startsWith('/presentation/d/')) {
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs[2]) return `https://docs.google.com/presentation/d/${segs[2]}/embed`;
    }
    if (hostIs('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).reverse().find((p) => /^\d+$/.test(p));
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    if (hostIs('loom.com') && u.pathname.startsWith('/share/')) {
      const id = u.pathname.split('/').filter(Boolean)[1];
      if (id) return `https://www.loom.com/embed/${id}`;
    }
    if (resource.type === 'ppt') {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    }
    if (resource.type === 'pdf') return url;
    return null;
  } catch {
    return null;
  }
}

const ActivityStatusBadge: React.FC<{
  record?: ActivityCompletion | null;
  prefix?: string;
  compact?: boolean;
}> = ({ record, prefix, compact = false }) => {
  if (!record) return null;
  const isPassed = record.status === 'passed';
  const formatted = formatCompletedTimestamp(record.completedAt);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold border shrink-0 ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        isPassed
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
          : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
      }`}
    >
      {isPassed ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      <span>{prefix ? `${prefix}: ${isPassed ? 'Passed' : 'Failed'}` : isPassed ? 'Passed' : 'Failed'}</span>
      {formatted && <span className="font-medium opacity-80">• {formatted}</span>}
    </span>
  );
};

export const LearnPage: React.FC<{ mode: 'book' | 'chapter' | 'resource' | 'root' }> = ({ mode }) => {
  const { bookId, chapterId, resourceId } = useParams();
  const { user } = useAuth();
  const { t } = useSettings();
  const toast = useToast();
  const qc = useQueryClient();
  const [busyComplete, setBusyComplete] = useState(false);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [lessonTab, setLessonTab] = useState<'materials' | 'notes' | 'qa' | 'quiz'>('materials');
  const [noteQuery, setNoteQuery] = useState('');
  const [openQaIds, setOpenQaIds] = useState<Record<string, boolean>>({});
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const userKey = user?.uid ?? 'guest';
  const [activityMap, setActivityMap] = useState<Record<string, ActivityCompletion>>(() =>
    getCompletedActivities(user?.uid)
  );

  React.useEffect(() => {
    const sync = () => setActivityMap(getCompletedActivities(userKey));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, [userKey]);

  React.useEffect(() => {
    setNoteQuery('');
    setOpenQaIds({});
    setSpeakingIdx(null);
  }, [chapterId]);

  const speakChinese = (text: string, idx: number) => {
    const zh = text.match(/[\u4e00-\u9fff，。！？、；：“”（）\s]{2,}/g)?.join(' ').trim().slice(0, 140);
    if (!zh) return;
    setSpeakingIdx(idx);
    const audio = new Audio(`${API_BASE}/v1/dictionary/tts?lang=zh&text=${encodeURIComponent(zh)}`);
    audio.onended = () => setSpeakingIdx((cur) => (cur === idx ? null : cur));
    audio.onerror = () => setSpeakingIdx((cur) => (cur === idx ? null : cur));
    audio.play().catch(() => setSpeakingIdx((cur) => (cur === idx ? null : cur)));
  };

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
  });

  const progQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => apiRequest<ProgressData>('/v1/progress'),
    enabled: !!user,
    staleTime: 30_000,
  });

  const cat = catQuery.data?.catalog;
  const completedSet = useMemo(
    () => new Set((progQuery.data?.completions ?? []).map((c) => c.itemId)),
    [progQuery.data]
  );

  React.useEffect(() => {
    const attempts = progQuery.data?.attempts;
    const exams = cat?.exams;
    if (!attempts?.length || !exams?.length) return;
    const examById = new Map(exams.map((e) => [e.id, e]));
    const latestByExam = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) {
      if ((a.status !== 'submitted' && a.status !== 'graded') || a.score == null || !a.total) continue;
      const prev = latestByExam.get(a.examId);
      if (!prev || (a.startedAt || 0) >= (prev.startedAt || 0)) {
        latestByExam.set(a.examId, a);
      }
    }
    if (!latestByExam.size) return;
    let latestMap = getCompletedActivities(userKey);
    let changed = false;
    for (const [examId, a] of latestByExam.entries()) {
      const exam = examById.get(examId);
      if (!exam) continue;
      const existing = latestMap[`quiz:${examId}`];
      const ts = a.startedAt || Date.now();
      if (existing && existing.completedAt >= ts && existing.score === a.score && existing.total === a.total) {
        continue;
      }
      latestMap = recordQuizCompletion(userKey, examId, {
        score: a.score ?? 0,
        total: a.total ?? 0,
        passPct: exam.pass_pct ?? 60,
        completedAt: ts,
      });
      changed = true;
    }
    if (changed) setActivityMap(latestMap);
  }, [progQuery.data?.attempts, cat?.exams, userKey]);

  // Locate book, chapter, resource
  const foundResource = useMemo(() => {
    if (mode !== 'resource' || !cat || !resourceId) return null;
    for (const b of cat.books) {
      for (const ch of b.chapters) {
        const res = ch.resources.find((r) => r.id === resourceId);
        if (res) return { book: b, chapter: ch, resource: res };
      }
    }
    return null;
  }, [mode, cat, resourceId]);

  const trackType =
    mode === 'chapter'
      ? 'notes'
      : foundResource?.resource.type === 'video'
        ? 'video'
        : foundResource?.resource.type === 'pdf'
          ? 'pdf'
          : foundResource?.resource.type === 'ppt'
            ? 'ppt'
            : 'notes';

  useStudyTracker(trackType, {
    chapterId: mode === 'chapter' ? chapterId : foundResource?.chapter.id,
    resourceId: mode === 'resource' ? resourceId : null,
    active: mode === 'chapter' || (mode === 'resource' && !!foundResource),
    playing: playingVideo,
    onFlushed: () => qc.invalidateQueries({ queryKey: ['progress'] }),
  });

  if (mode === 'root') return <Navigate to="/library" replace />;
  if (catQuery.isLoading) return <LoadingState />;
  if (catQuery.isError && !cat) {
    return <ErrorRetry message={t('err.network')} onRetry={() => catQuery.refetch()} />;
  }

  const markComplete = async (itemId: string) => {
    setBusyComplete(true);
    try {
      const r = await apiRequest<{ xpAwarded?: number }>('/v1/completions', {
        method: 'POST',
        bodyJson: { itemId },
      });
      await qc.invalidateQueries({ queryKey: ['progress'] });
      toast(r.xpAwarded ? `${t('done')} · ${t('xpEarned', { n: r.xpAwarded })}` : t('done'));
    } catch {
      toast(t('err.generic'));
    } finally {
      setBusyComplete(false);
    }
  };

  /* ---------------- BOOK OVERVIEW ---------------- */
  if (mode === 'book') {
    const book = cat?.books.find((b) => b.id === bookId);
    if (!book) return <ErrorRetry message={t('noBooks')} />;
    const col = colorForSubject(book.subjectId);
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Link to="/library" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> {t('library')}
        </Link>

        <div className="sanzar-card p-6 flex flex-col sm:flex-row items-start gap-6">
          <BookCover
            colors={book.cover}
            title={book.title}
            imageUrl={book.coverImage}
            aspectRatio={book.coverRatio}
            previewDoc={book.previewDoc}
            size="lg"
          />
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold">{book.title}</h1>
            {book.author && <p className="text-sm text-sanzar-text2">{book.author}</p>}
            {book.edition && <p className="text-xs text-sanzar-muted">{book.edition}</p>}
            <p className="text-xs font-semibold text-sanzar-primary pt-1">
              {t('chapters', { n: book.chapters.length })}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {book.chapters
            .filter((c) => !c.parentChapterId)
            .map((c) => {
              const childLessons = book.chapters.filter((l) => l.parentChapterId === c.id);
              const notesDone = completedSet.has(`notes:${c.id}`);
              const hasDirectContent = c.hasNotes || c.resources.length > 0 || c.questionCount > 0;

              if (childLessons.length > 0) {
                return (
                  <div key={c.id} className="sanzar-card overflow-hidden">
                    <div className="p-4 flex items-center gap-4 bg-sanzar-surface2/50 border-b border-sanzar-border">
                      <div
                        style={{ backgroundColor: `${col}20`, color: col }}
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      >
                        {c.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-sm sm:text-base truncate">{c.title}</h2>
                        <p className="text-xs text-sanzar-muted">{childLessons.length} lessons</p>
                      </div>
                      {hasDirectContent && (
                        <Link
                          to={`/learn/chapter/${book.id}/${c.id}`}
                          className="text-xs font-semibold text-sanzar-primary hover:underline shrink-0"
                        >
                          Overview →
                        </Link>
                      )}
                    </div>
                    <div className="divide-y divide-sanzar-border/70">
                      {childLessons.map((lesson) => {
                        const lessonDone = completedSet.has(`notes:${lesson.id}`);
                        const lessonQuiz = cat?.exams.find(
                          (e) => e.chapter_id === lesson.id && e.type === 'chapter_quiz'
                        );
                        const lessonQuizRecord = lessonQuiz ? activityMap[`quiz:${lessonQuiz.id}`] : undefined;
                        const lessonQaRecord = activityMap[`qa:${lesson.id}`];
                        return (
                          <Link
                            key={lesson.id}
                            to={`/learn/chapter/${book.id}/${lesson.id}`}
                            className="px-4 py-3 pl-8 flex items-center gap-3 hover:bg-sanzar-surface2/60 transition"
                          >
                            <span className="w-6 h-6 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-xs font-bold flex items-center justify-center shrink-0">
                              {lesson.number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">{lesson.title}</div>
                              <p className="text-xs text-sanzar-muted">
                                {[
                                  lesson.hasNotes ? t('notes') : null,
                                  lesson.resources.length > 0 ? `${lesson.resources.length} ${t('resources')}` : null,
                                  lesson.questionCount > 0 ? t('questions', { n: lesson.questionCount }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                              {(lessonQuizRecord || lessonQaRecord) && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <ActivityStatusBadge record={lessonQaRecord} prefix="Q&A" compact />
                                  <ActivityStatusBadge record={lessonQuizRecord} prefix="Quiz" compact />
                                </div>
                              )}
                            </div>
                            {lessonDone && <CheckCircle2 className="w-4 h-4 text-sanzar-success shrink-0" />}
                            <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const chQuiz = cat?.exams.find((e) => e.chapter_id === c.id && e.type === 'chapter_quiz');
              const chQuizRecord = chQuiz ? activityMap[`quiz:${chQuiz.id}`] : undefined;
              const chQaRecord = activityMap[`qa:${c.id}`];

              return (
                <Link
                  key={c.id}
                  to={`/learn/chapter/${book.id}/${c.id}`}
                  className="sanzar-card p-4 flex items-center gap-4 hover:border-sanzar-primary/50 transition"
                >
                  <div
                    style={{ backgroundColor: `${col}20`, color: col }}
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  >
                    {c.number === 0 ? '★' : c.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-sm sm:text-base truncate">
                      {c.number === 0
                        ? c.title.replace(/\s*\(Whole Book\)\s*$/i, '').trim() === book.title
                          ? `${book.title} — Full Edition`
                          : c.title.replace(/\(Whole Book\)/gi, 'Full Edition')
                        : c.title}
                    </h2>
                    <p className="text-xs text-sanzar-muted">
                      {[
                        c.hasNotes ? t('notes') : null,
                        c.resources.length > 0 ? `${c.resources.length} ${t('resources')}` : null,
                        (c.qaCount ?? 0) > 0 ? `${c.qaCount} Q&A` : null,
                        c.questionCount > 0 ? t('questions', { n: c.questionCount }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {(chQuizRecord || chQaRecord) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <ActivityStatusBadge record={chQaRecord} prefix="Q&A" compact />
                        <ActivityStatusBadge record={chQuizRecord} prefix="Quiz" compact />
                      </div>
                    )}
                  </div>
                  {notesDone && <CheckCircle2 className="w-5 h-5 text-sanzar-success shrink-0" />}
                  <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                </Link>
              );
            })}
        </div>
      </div>
    );
  }

  /* ---------------- CHAPTER / LESSON VIEWER ---------------- */
  if (mode === 'chapter') {
    const book = cat?.books.find((b) => b.id === bookId);
    const ch = book?.chapters.find((c) => c.id === chapterId);
    if (!book || !ch) return <ErrorRetry message={t('noNotes')} />;
    const notes = cat?.notes?.[ch.id] ?? [];
    const qaItems = cat?.qa?.[ch.id] ?? [];
    const quiz = cat?.exams.find((e) => e.chapter_id === ch.id && e.type === 'chapter_quiz');
    const done = completedSet.has(`notes:${ch.id}`);
    const qaDone = completedSet.has(`qa:${ch.id}`);

    const iconForRes = (type: string) => {
      if (type === 'video') return PlayCircle;
      if (type === 'audio') return Volume2;
      if (type === 'pdf' || type === 'doc') return FileText;
      if (type === 'ppt') return Presentation;
      return LinkIcon;
    };

    const audioResources = ch.resources.filter((r) => r.type === 'audio' && r.url);
    const otherResources = ch.resources.filter((r) => r.type !== 'audio');
    const primaryInlineDoc = otherResources.find((r) => detectViewerKind(r) !== null);
    const primaryViewerKind = primaryInlineDoc ? detectViewerKind(primaryInlineDoc) : null;
    const hasMaterials = ch.resources.length > 0;

    const materialTabLabel =
      primaryViewerKind === 'ppt'
        ? 'Slides'
        : primaryViewerKind === 'pdf'
          ? 'PDF'
          : primaryViewerKind === 'doc'
            ? 'Document'
            : t('resources');

    const tabs: { id: 'materials' | 'notes' | 'qa' | 'quiz'; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }[] = [
      ...(hasMaterials ? [{ id: 'materials' as const, label: materialTabLabel, count: ch.resources.length, icon: primaryViewerKind === 'ppt' ? Presentation : FileText }] : []),
      ...(notes.length > 0 || !hasMaterials ? [{ id: 'notes' as const, label: t('notes'), count: notes.length || undefined, icon: BookOpen }] : []),
      { id: 'qa', label: 'Q&A', count: qaItems.length || undefined, icon: MessageCircleQuestion },
      { id: 'quiz', label: t('chapterQuiz'), count: quiz?.question_count || ch.questionCount || undefined, icon: HelpCircle },
    ];
    const activeTab = tabs.some((tb) => tb.id === lessonTab) ? lessonTab : tabs[0].id;

    const qNorm = noteQuery.trim().toLowerCase();
    const filteredNotes = qNorm
      ? notes.filter((n) => n.heading.toLowerCase().includes(qNorm) || n.text.toLowerCase().includes(qNorm))
      : notes;

    const allQaOpen = qaItems.length > 0 && qaItems.every((item) => openQaIds[item.id]);
    const toggleAllQa = () => {
      if (allQaOpen) {
        setOpenQaIds({});
      } else {
        const next: Record<string, boolean> = {};
        for (const item of qaItems) next[item.id] = true;
        setOpenQaIds(next);
      }
    };

    const quizAttempts = quiz
      ? (progQuery.data?.attempts ?? []).filter(
          (a) => a.examId === quiz.id && (a.status === 'submitted' || a.status === 'graded') && a.score != null && a.total
        )
      : [];
    const bestAttempt = quizAttempts.reduce<{ pct: number; score: number; total: number } | null>((best, a) => {
      const pct = Math.round(((a.score || 0) / (a.total || 1)) * 100);
      if (!best || pct > best.pct) return { pct, score: a.score || 0, total: a.total || 0 };
      return best;
    }, null);
    const quizRecord = quiz ? activityMap[`quiz:${quiz.id}`] : undefined;
    const qaChapterRecord = activityMap[`qa:${ch.id}`];

    const handleQaItemCheck = (qaId: string, passed: boolean) => {
      let next = recordQaCompletion(userKey, qaId, { passed });
      const allChecked = qaItems.length > 0 && qaItems.every((item) => Boolean(next[`qa:${item.id}`]));
      if (allChecked) {
        const passedCount = qaItems.filter((item) => next[`qa:${item.id}`]?.status === 'passed').length;
        const pct = Math.round((passedCount / qaItems.length) * 100);
        next = recordQaCompletion(userKey, ch.id, {
          passed: pct >= 60,
          score: passedCount,
          total: qaItems.length,
        });
      }
      setActivityMap(next);
    };

    const handleMarkQaReviewed = (items: ChapterQaItem[]) => {
      const checked = items.filter((item) => Boolean(activityMap[`qa:${item.id}`]));
      const passedCount =
        checked.length > 0
          ? items.filter((item) => activityMap[`qa:${item.id}`]?.status === 'passed').length
          : items.length;
      const total = items.length;
      const pct = total > 0 ? Math.round((passedCount / total) * 100) : 100;
      setActivityMap(
        recordQaCompletion(userKey, ch.id, {
          passed: pct >= 60,
          score: passedCount,
          total,
        })
      );
      void markComplete(`qa:${ch.id}`);
    };

    return (
      <div className="space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link
            to={`/learn/book/${book.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> {book.title}
          </Link>
          <span className="sanzar-pill">
            {ch.number === 0
              ? 'Full Edition'
              : ch.parentChapterId
                ? (() => {
                    const p = book.chapters.find((x) => x.id === ch.parentChapterId);
                    return p ? `Chapter ${p.number} · Lesson ${ch.number}` : `Lesson ${ch.number}`;
                  })()
                : t('chapter', { n: ch.number })}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold">
            {ch.number === 0
              ? ch.title.replace(/\s*\(Whole Book\)\s*$/i, '').trim() === book.title
                ? `${book.title} — Full Edition`
                : ch.title.replace(/\(Whole Book\)/gi, 'Full Edition')
              : ch.title}
          </h1>
          <p className="text-sm text-sanzar-muted">{book.title}</p>
        </div>

        {/* Lesson Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-sanzar-border">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const active = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setLessonTab(tb.id)}
                className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shrink-0 border-b-2 transition ${
                  active
                    ? 'border-sanzar-primary text-sanzar-primary bg-sanzar-primarySoft/40'
                    : 'border-transparent text-sanzar-muted hover:text-sanzar-text hover:bg-sanzar-surface2/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tb.label}</span>
                {tb.count != null && tb.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      active ? 'bg-sanzar-primary text-sanzar-onPrimary' : 'bg-sanzar-surface2 text-sanzar-muted'
                    }`}
                  >
                    {tb.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: SLIDES & MATERIALS */}
        {activeTab === 'materials' && (
          <div className="space-y-5">
            {primaryInlineDoc && primaryInlineDoc.url && primaryViewerKind && (
              <div className="sanzar-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-sanzar-border bg-sanzar-surface2/60">
                  <span className="font-bold text-xs sm:text-sm flex items-center gap-2 truncate">
                    {primaryViewerKind === 'ppt' ? (
                      <Presentation className="w-4 h-4 text-sanzar-primary shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-sanzar-primary shrink-0" />
                    )}
                    <span className="truncate">{primaryInlineDoc.title || materialTabLabel}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {completedSet.has(primaryInlineDoc.id) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-sanzar-success">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t('done')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markComplete(primaryInlineDoc.id)}
                        disabled={busyComplete}
                        className="px-2.5 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold hover:opacity-95 disabled:opacity-50"
                      >
                        {t('markDone')}
                      </button>
                    )}
                  </div>
                </div>
                <Suspense fallback={<LoadingState />}>
                  {primaryViewerKind === 'ppt' ? (
                    <PptxSlideViewer url={primaryInlineDoc.url} title={primaryInlineDoc.title || ch.title} />
                  ) : primaryViewerKind === 'pdf' ? (
                    <PdfCanvasViewer url={primaryInlineDoc.url} title={primaryInlineDoc.title || ch.title} />
                  ) : (
                    <DocxDocumentViewer url={primaryInlineDoc.url} title={primaryInlineDoc.title || ch.title} />
                  )}
                </Suspense>
              </div>
            )}

            {audioResources.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-sanzar-muted flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-sanzar-primary" /> Listening Audio ({audioResources.length})
                </h2>
                <div className="space-y-2.5">
                  {audioResources.map((r) => {
                    const audioEmbed = embeddedUrlFor(r);
                    const rDone = completedSet.has(r.id);
                    return (
                      <div key={r.id} className="sanzar-card p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm flex items-center gap-2 min-w-0">
                            <Volume2 className="w-4 h-4 text-sanzar-primary shrink-0" />
                            <span className="truncate">{r.title || 'Audio track'}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {rDone ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sanzar-success">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {t('done')}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => markComplete(r.id)}
                                disabled={busyComplete}
                                className="text-[11px] font-semibold text-sanzar-primary hover:underline disabled:opacity-50"
                              >
                                {t('markDone')}
                              </button>
                            )}
                          </div>
                        </div>
                        {audioEmbed ? (
                          <iframe
                            src={audioEmbed}
                            title={r.title || 'Audio'}
                            className="w-full h-[72px] rounded-xl border border-sanzar-border/60 bg-sanzar-surface2"
                            allow="autoplay"
                          />
                        ) : (
                          <audio controls preload="metadata" src={r.url || ''} className="w-full h-10" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {otherResources.filter((r) => r.id !== primaryInlineDoc?.id).length > 0 && (
              <section className="space-y-2.5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-sanzar-muted">
                  Additional Materials
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {otherResources
                    .filter((r) => r.id !== primaryInlineDoc?.id)
                    .map((r) => {
                      const Icon = iconForRes(r.type);
                      const rDone = completedSet.has(r.id);
                      return (
                        <Link
                          key={r.id}
                          to={`/learn/resource/${r.id}`}
                          className="sanzar-card p-3.5 flex items-center gap-3 hover:border-sanzar-primary/50 transition"
                        >
                          <Icon className="w-5 h-5 text-sanzar-primary shrink-0" />
                          <span className="font-semibold text-sm flex-1 truncate">
                            {r.title || r.type.toUpperCase()}
                          </span>
                          {rDone ? (
                            <CheckCircle2 className="w-4 h-4 text-sanzar-success shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                          )}
                        </Link>
                      );
                    })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: STUDY NOTES */}
        {activeTab === 'notes' && (
          <section className="space-y-3">
            {notes.length > 3 && (
              <div className="relative">
                <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                  placeholder="Search vocabulary, pinyin, or grammar in these notes…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-sanzar-border bg-sanzar-surface text-sm focus:outline-none focus:border-sanzar-primary"
                />
              </div>
            )}

            {filteredNotes.length === 0 ? (
              <div className="sanzar-card p-6 text-sm text-sanzar-muted">
                {notes.length === 0 ? t('noNotes') : 'No matching note sections found.'}
              </div>
            ) : (
              filteredNotes.map((n, idx) => {
                const hasZh = /[\u4e00-\u9fff]{2,}/.test(`${n.heading} ${n.text}`);
                return (
                  <article key={idx} className="sanzar-card p-5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-sanzar-primary shrink-0" />
                        {n.heading}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasZh && (
                          <button
                            type="button"
                            onClick={() => speakChinese(`${n.heading} ${n.text}`, idx)}
                            className={`px-2 py-1 rounded-lg border border-sanzar-border text-xs font-semibold inline-flex items-center gap-1 hover:bg-sanzar-primarySoft transition ${
                              speakingIdx === idx ? 'bg-sanzar-primarySoft text-sanzar-primary' : 'text-sanzar-muted'
                            }`}
                            title="Listen to Chinese pronunciation"
                          >
                            <Volume2 className="w-3.5 h-3.5" /> Listen
                          </button>
                        )}
                        {n.page != null && (
                          <span className="sanzar-pill shrink-0">{t('page', { n: n.page })}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-sanzar-text2 leading-relaxed whitespace-pre-wrap select-text">
                      {n.text}
                    </div>
                  </article>
                );
              })
            )}

            {notes.length > 0 && (
              <div className="flex justify-center pt-2">
                {done ? (
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-sanzar-success/15 text-sanzar-success font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4" /> {t('done')}
                  </div>
                ) : (
                  <button
                    onClick={() => markComplete(`notes:${ch.id}`)}
                    disabled={busyComplete}
                    className="px-6 py-3 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow hover:opacity-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {t('markDone')}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: ACTIVE-RECALL Q&A */}
        {activeTab === 'qa' && (
          <section className="space-y-3">
            {qaItems.length === 0 ? (
              <div className="sanzar-card p-6 text-sm text-sanzar-muted">
                No Q&A items published for this lesson yet.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-sanzar-muted">
                    Tap any question to test yourself before revealing the answer.
                  </p>
                  <button
                    type="button"
                    onClick={toggleAllQa}
                    className="px-3 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-sanzar-surface2 shrink-0"
                  >
                    {allQaOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {allQaOpen ? 'Hide all answers' : 'Reveal all answers'}
                  </button>
                </div>

                <div className="space-y-2.5">
                  {qaItems.map((item, idx) => {
                    const isOpen = !!openQaIds[item.id];
                    const itemRecord = activityMap[`qa:${item.id}`];
                    return (
                      <div key={item.id} className="sanzar-card overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOpenQaIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="w-full p-4 flex items-start justify-between gap-3 text-left hover:bg-sanzar-surface2/50 transition"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-sanzar-primarySoft text-sanzar-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-sm sm:text-base leading-snug">
                              {item.question}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            <ActivityStatusBadge record={itemRecord} compact />
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-sanzar-primary shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                            )}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-2 border-t border-sanzar-border/60 bg-sanzar-surface2/30 text-sm text-sanzar-text2 leading-relaxed pl-13 space-y-3">
                            <div className="whitespace-pre-wrap select-text">{item.answer}</div>
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-sanzar-border/40">
                              <span className="text-xs font-semibold text-sanzar-muted mr-1">Self-check:</span>
                              <button
                                type="button"
                                onClick={() => handleQaItemCheck(item.id, true)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 transition ${
                                  itemRecord?.status === 'passed'
                                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                                    : 'border-sanzar-border text-sanzar-text2 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Got it
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQaItemCheck(item.id, false)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 transition ${
                                  itemRecord?.status === 'failed'
                                    ? 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40'
                                    : 'border-sanzar-border text-sanzar-text2 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300'
                                }`}
                              >
                                <XCircle className="w-3.5 h-3.5" /> Missed
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <ActivityStatusBadge record={qaChapterRecord} />
                  {qaDone ? (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-sanzar-success/15 text-sanzar-success font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Q&A Reviewed
                    </div>
                  ) : (
                    <button
                      onClick={() => handleMarkQaReviewed(qaItems)}
                      disabled={busyComplete}
                      className="px-6 py-3 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow hover:opacity-95 disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Mark Q&A Reviewed
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* TAB 4: LESSON QUIZ */}
        {activeTab === 'quiz' && (
          <section className="space-y-4">
            {!quiz ? (
              <div className="sanzar-card p-6 text-sm text-sanzar-muted">
                No quiz published for this lesson yet.
              </div>
            ) : (
              <div className="sanzar-card p-6 space-y-4 border-sanzar-jade/40">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sanzar-pill text-sanzar-jade">{t('chapterQuiz')}</span>
                      <ActivityStatusBadge record={quizRecord} />
                    </div>
                    <h2 className="text-xl font-extrabold">{quiz.title}</h2>
                    <p className="text-sm text-sanzar-muted">
                      {t('questions', { n: quiz.question_count })} · {t('minutes', { n: Math.ceil(quiz.duration_sec / 60) })} · Pass mark {quiz.pass_pct}%
                    </p>
                  </div>
                  {bestAttempt && (
                    <div className="px-3.5 py-2 rounded-xl bg-sanzar-surface2 border border-sanzar-border text-right">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted flex items-center gap-1 justify-end">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" /> Best Score
                      </p>
                      <p className={`text-lg font-extrabold ${bestAttempt.pct >= quiz.pass_pct ? 'text-sanzar-success' : 'text-sanzar-primary'}`}>
                        {bestAttempt.pct}% ({bestAttempt.score}/{bestAttempt.total})
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    to={`/exams/${quiz.id}`}
                    className="px-6 py-3 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow hover:opacity-95 inline-flex items-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    {bestAttempt ? 'Retake Quiz' : 'Start Quiz'}
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  /* ---------------- RESOURCE VIEWER ---------------- */
  if (!foundResource || !foundResource.resource.url) {
    return <ErrorRetry message={t('cannotOpen')} />;
  }

  const { book, chapter, resource } = foundResource;
  const resUrl = resource.url || '';
  const rDone = completedSet.has(resource.id);
  const embed = embeddedUrlFor(resource);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/learn/chapter/${book.id}/${chapter.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> {chapter.title}
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={resUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="px-3 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold flex items-center gap-1.5 hover:bg-sanzar-surface2"
          >
            <ExternalLink className="w-3.5 h-3.5" /> {t('openExternal')}
          </a>
          {rDone ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sanzar-success/15 text-sanzar-success text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" /> {t('done')}
            </span>
          ) : (
            <button
              onClick={() => markComplete(resource.id)}
              disabled={busyComplete}
              className="px-3.5 py-1.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold hover:opacity-95 disabled:opacity-50"
            >
              {t('markDone')}
            </button>
          )}
        </div>
      </div>

      <h1 className="text-xl font-extrabold">{resource.title || resource.type.toUpperCase()}</h1>

      <div className="sanzar-card overflow-hidden">
        {resource.type === 'audio' ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                <Volume2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{resource.title || 'Listening Audio'}</p>
                <p className="text-xs text-sanzar-muted">{book.title} · {chapter.title}</p>
              </div>
            </div>
            {embed ? (
              <iframe
                src={embed}
                title={resource.title || 'Audio'}
                className="w-full h-[96px] rounded-xl border border-sanzar-border bg-sanzar-surface2"
                allow="autoplay"
              />
            ) : (
              <audio
                src={resUrl}
                controls
                className="w-full"
                onPlay={() => setPlayingVideo(true)}
                onPause={() => setPlayingVideo(false)}
                onEnded={() => setPlayingVideo(false)}
              />
            )}
          </div>
        ) : detectViewerKind(resource) === 'ppt' ? (
          <Suspense fallback={<LoadingState />}>
            <PptxSlideViewer url={resUrl} title={resource.title || 'Presentation'} />
          </Suspense>
        ) : detectViewerKind(resource) === 'pdf' ? (
          <Suspense fallback={<LoadingState />}>
            <PdfCanvasViewer url={resUrl} title={resource.title || 'PDF Document'} />
          </Suspense>
        ) : detectViewerKind(resource) === 'doc' ? (
          <Suspense fallback={<LoadingState />}>
            <DocxDocumentViewer url={resUrl} title={resource.title || 'Document'} />
          </Suspense>
        ) : resource.type === 'video' && !embed ? (
          <video
            src={resUrl}
            controls
            className="w-full max-h-[72vh] bg-black"
            onPlay={() => setPlayingVideo(true)}
            onPause={() => setPlayingVideo(false)}
            onEnded={() => setPlayingVideo(false)}
          />
        ) : embed ? (
          <iframe
            src={embed}
            title={resource.title || 'Resource'}
            className="w-full h-[75vh] border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="p-12 text-center space-y-4">
            <ExternalLink className="w-10 h-10 mx-auto text-sanzar-primary" />
            <p className="text-sm text-sanzar-text2">{t('openExternal')}</p>
            <a
              href={resUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
            >
              {resource.title || resUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
