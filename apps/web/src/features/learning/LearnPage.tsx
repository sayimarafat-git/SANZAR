import React, { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  PlayCircle,
  Presentation,
  Link as LinkIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest, fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject } from '../../lib/i18n';
import { useStudyTracker } from '../../lib/study-tracker';
import type { ProgressData, Resource } from '../../lib/models';
import { BookCover, ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';

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

export const LearnPage: React.FC<{ mode: 'book' | 'chapter' | 'resource' | 'root' }> = ({ mode }) => {
  const { bookId, chapterId, resourceId } = useParams();
  const { user } = useAuth();
  const { t } = useSettings();
  const toast = useToast();
  const qc = useQueryClient();
  const [busyComplete, setBusyComplete] = useState(false);
  const [playingVideo, setPlayingVideo] = useState(false);

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

        <div className="space-y-2.5">
          {book.chapters.map((c) => {
            const notesDone = completedSet.has(`notes:${c.id}`);
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
                      c.questionCount > 0 ? t('questions', { n: c.questionCount }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
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

  /* ---------------- CHAPTER NOTES VIEWER ---------------- */
  if (mode === 'chapter') {
    const book = cat?.books.find((b) => b.id === bookId);
    const ch = book?.chapters.find((c) => c.id === chapterId);
    if (!book || !ch) return <ErrorRetry message={t('noNotes')} />;
    const notes = cat?.notes?.[ch.id] ?? [];
    const quiz = cat?.exams.find((e) => e.chapter_id === ch.id && e.type === 'chapter_quiz');
    const done = completedSet.has(`notes:${ch.id}`);

    const iconForRes = (type: string) => {
      if (type === 'video') return PlayCircle;
      if (type === 'pdf') return FileText;
      if (type === 'ppt') return Presentation;
      return LinkIcon;
    };

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link
            to={`/learn/book/${book.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> {book.title}
          </Link>
          <span className="sanzar-pill">{ch.number === 0 ? 'Full Edition' : t('chapter', { n: ch.number })}</span>
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

        {/* Resources & Quiz */}
        {(ch.resources.length > 0 || quiz) && (
          <section className="space-y-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-sanzar-muted">
              {t('resources')}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {ch.resources.map((r) => {
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
              {quiz && (
                <Link
                  to={`/exams/${quiz.id}`}
                  className="sanzar-card p-3.5 flex items-center gap-3 border-sanzar-jade/40 hover:border-sanzar-primary transition"
                >
                  <HelpCircle className="w-5 h-5 text-sanzar-jade shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t('chapterQuiz')}</p>
                    <p className="text-xs text-sanzar-muted">
                      {t('questions', { n: quiz.question_count })} ·{' '}
                      {t('minutes', { n: Math.ceil(quiz.duration_sec / 60) })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Notes Sections */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-sanzar-muted">{t('notes')}</h2>
          {notes.length === 0 ? (
            <div className="sanzar-card p-6 text-sm text-sanzar-muted">{t('noNotes')}</div>
          ) : (
            notes.map((n, idx) => (
              <article key={idx} className="sanzar-card p-5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-sanzar-primary shrink-0" />
                    {n.heading}
                  </h3>
                  {n.page != null && (
                    <span className="sanzar-pill shrink-0">{t('page', { n: n.page })}</span>
                  )}
                </div>
                <div className="text-sm text-sanzar-text2 leading-relaxed whitespace-pre-wrap select-text">
                  {n.text}
                </div>
              </article>
            ))
          )}
        </section>

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
        {resource.type === 'video' && !embed ? (
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
