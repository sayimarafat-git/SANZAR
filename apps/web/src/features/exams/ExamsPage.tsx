import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  History,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest, errorText, fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject } from '../../lib/i18n';
import { useStudyTracker } from '../../lib/study-tracker';
import { buildQuizFlashcardsFromReview, upsertStudyFlashcards } from '../../lib/study-flashcards';
import type { AttemptResult, AttemptSummary, ExamSession } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, mmss, timeAgo, useToast } from '../../components/SanzarUI';
import { ExamsFlashcardsBanner } from '../../components/FlashcardsSection';

export const ExamsPage: React.FC<{ view?: 'list' | 'run' | 'result' }> = ({ view = 'list' }) => {
  const { examId, attemptId } = useParams();
  if (view === 'run' && examId) return <ExamRunner examId={examId} />;
  if (view === 'result' && attemptId) return <AttemptReview attemptId={attemptId} />;
  return <ExamsList />;
};

const ExamsList: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: 'tests' | 'history' = params.get('tab') === 'history' ? 'history' : 'tests';
  const setTab = (next: 'tests' | 'history') => {
    setParams(next === 'history' ? { tab: 'history' } : {});
  };

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const histQuery = useQuery({
    queryKey: ['attempts'],
    queryFn: () => apiRequest<{ attempts: AttemptSummary[] }>('/v1/attempts'),
    enabled: !!user && tab === 'history',
    retry: false,
  });

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('exams')}</h1>
        <p className="text-sm text-sanzar-text2">{t('guestMode')}</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const cat = catQuery.data?.catalog;
  const levelId = profile?.level_id;
  const levelBookIds = new Set(
    (cat?.books ?? [])
      .filter((b) => !levelId || !b.levels.length || b.levels.includes(levelId))
      .map((b) => b.id)
  );
  const chapterBookId = new Map<string, string>();
  for (const b of cat?.books ?? []) {
    for (const ch of b.chapters) chapterBookId.set(ch.id, b.id);
  }
  const exams = (cat?.exams ?? []).filter((e) => {
    if (e.level_id && levelId && e.level_id !== levelId) return false;
    const effectiveBookId = e.book_id || (e.chapter_id ? chapterBookId.get(e.chapter_id) : undefined);
    if (!e.level_id && effectiveBookId && !levelBookIds.has(effectiveBookId)) return false;
    return true;
  });

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <ExamsFlashcardsBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('exams')}</h1>
        <div className="inline-flex rounded-xl sanzar-glass p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('tests')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              tab === 'tests'
                ? 'bg-sanzar-primary text-sanzar-onPrimary shadow-sm'
                : 'text-sanzar-text2 hover:bg-white/40 dark:hover:bg-white/5'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" /> {t('exams')}
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              tab === 'history'
                ? 'bg-sanzar-primary text-sanzar-onPrimary shadow-sm'
                : 'text-sanzar-text2 hover:bg-white/40 dark:hover:bg-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5" /> {t('history')}
          </button>
        </div>
      </div>

      {tab === 'tests' ? (
        catQuery.isLoading ? (
          <LoadingState />
        ) : exams.length === 0 ? (
          <div className="sanzar-card p-8 text-center text-sm text-sanzar-muted">{t('noBooks')}</div>
        ) : (
          <div className="space-y-3">
            {exams.map((e) => {
              const book = cat?.books.find((b) => b.id === e.book_id);
              const col = colorForSubject(book?.subjectId || 'others');
              return (
                <Link
                  key={e.id}
                  to={`/exams/${e.id}`}
                  className="sanzar-card p-4 flex items-center gap-4 hover:border-sanzar-primary/50 transition"
                >
                  <div
                    style={{ backgroundColor: `${col}20`, color: col }}
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  >
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-sm sm:text-base">{e.title}</h2>
                      <span className="sanzar-pill">
                        {e.type === 'model' ? t('modelTests') : t('chapterQuiz')}
                      </span>
                    </div>
                    <p className="text-xs text-sanzar-muted mt-0.5">
                      {t('questions', { n: e.question_count })} ·{' '}
                      {t('minutes', { n: Math.ceil(e.duration_sec / 60) })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
                </Link>
              );
            })}
          </div>
        )
      ) : histQuery.isLoading ? (
        <LoadingState />
      ) : histQuery.isError || (histQuery.data?.attempts.length ?? 0) === 0 ? (
        <div className="sanzar-card p-8 text-center text-sm text-sanzar-muted space-y-2">
          <p>{t('noAttempts')}</p>
          {histQuery.isError && (
            <button onClick={() => histQuery.refetch()} className="sanzar-pill text-sanzar-primary hover:opacity-90">
              {t('retry')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {histQuery.data!.attempts.map((a) => (
            <Link
              key={a.id}
              to={a.status === 'legacy' ? '#' : `/attempts/${a.id}`}
              className="sanzar-card p-4 flex items-center justify-between gap-4 hover:border-sanzar-primary/50 transition"
            >
              <div>
                <p className="font-bold text-sm">{a.title || a.examId}</p>
                <p className="text-xs text-sanzar-muted">{timeAgo(t, a.startedAt)}</p>
              </div>
              <span className="font-extrabold text-base text-sanzar-primary">
                {a.total == null ? '—' : t('score', { s: a.score ?? 0, n: a.total })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const ExamRunner: React.FC<{ examId: string }> = ({ examId }) => {
  const { user } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const uid = user?.uid || 'guest';

  const [session, setSession] = useState<ExamSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useStudyTracker('exam', { active: !!session && !submitting });

  const start = async () => {
    setError(null);
    try {
      const sess = await apiRequest<ExamSession>(`/v1/exams/${examId}/start`, {
        method: 'POST',
        bodyJson: {},
      });
      setSession(sess);
      const skew = sess.attempt.serverTime - Date.now();
      setLeft(Math.max(0, Math.ceil((sess.attempt.endsAt - (Date.now() + skew)) / 1000)));
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    start();
  }, [examId]);

  useEffect(() => {
    if (!session || submitting) return;
    const skew = session.attempt.serverTime - Date.now();
    const timer = window.setInterval(() => {
      const rem = Math.max(0, Math.ceil((session.attempt.endsAt - (Date.now() + skew)) / 1000));
      setLeft(rem);
      if (rem <= 0) {
        window.clearInterval(timer);
        toast(t('timeUp'));
        void submit();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session, submitting]);

  const submit = async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const res = await apiRequest<AttemptResult>(`/v1/attempts/${session.attempt.id}/submit`, {
        method: 'POST',
        bodyJson: { answers },
      });
      const cards = buildQuizFlashcardsFromReview(
        res.attempt.examId || examId,
        res.attempt.title || session.attempt.title,
        res.review
      );
      if (cards.length > 0) upsertStudyFlashcards(uid, cards);
      await qc.invalidateQueries({ queryKey: ['progress'] });
      navigate(`/attempts/${session.attempt.id}`, { replace: true, state: { result: res } });
    } catch {
      setSubmitting(false);
      toast(t('err.generic'));
    }
  };

  if (error) return <ErrorRetry message={error} onRetry={start} />;
  if (!session) return <LoadingState />;

  const q = session.questions[index];
  const pct = Math.round(((index + 1) / session.questions.length) * 100);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="sanzar-card p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-bold text-base truncate">{session.attempt.title}</h1>
          <p className="text-xs text-sanzar-muted">
            {index + 1} / {session.questions.length}
          </p>
        </div>
        <div className="px-3.5 py-1.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary font-bold text-sm flex items-center gap-1.5 shrink-0">
          <Clock className="w-4 h-4" />
          <span>{mmss(left)}</span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-sanzar-surface2 overflow-hidden">
        <div className="h-full bg-brand-grad transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Question palette */}
      <div className="flex flex-wrap gap-1.5">
        {session.questions.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setIndex(idx)}
            className={`w-8 h-8 rounded-lg text-xs font-bold border transition ${
              idx === index
                ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                : answers[item.id] !== undefined
                  ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                  : 'bg-sanzar-surface border-sanzar-border text-sanzar-muted'
            }`}
          >
            {idx + 1}
          </button>
        ))}
      </div>

      <div className="sanzar-card p-6 space-y-4">
        <p className="font-semibold text-base sm:text-lg leading-relaxed">{q.text}</p>
        <div className="space-y-2.5">
          {q.options.map((opt, i) => {
            const chosen = answers[q.id] === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
                className={`w-full text-left p-3.5 rounded-xl border text-sm font-medium flex items-center gap-3 transition ${
                  chosen
                    ? 'border-sanzar-primary bg-sanzar-primarySoft text-sanzar-primary font-semibold'
                    : 'border-sanzar-border hover:bg-sanzar-surface2'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs shrink-0 ${
                    chosen ? 'border-sanzar-primary bg-sanzar-primary text-white' : 'border-sanzar-muted'
                  }`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="px-5 py-2.5 rounded-xl border border-sanzar-border font-semibold text-sm disabled:opacity-40"
        >
          ←
        </button>
        {index < session.questions.length - 1 ? (
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="px-6 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
          >
            {t('next')}
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm disabled:opacity-50"
          >
            {t('submit')}
          </button>
        )}
      </div>

      {confirmOpen && (
        <Modal title={t('submit')} onClose={() => setConfirmOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-sanzar-text2">
              {t('submitConfirm', { a: Object.keys(answers).length, n: session.questions.length })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold"
              >
                {t('cancel')}
              </button>
              <button
                onClick={submit}
                className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
              >
                {t('submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const AttemptReview: React.FC<{ attemptId: string }> = ({ attemptId }) => {
  const { user } = useAuth();
  const { t } = useSettings();
  const uid = user?.uid || 'guest';
  const syncedAttemptRef = React.useRef<string>('');
  const q = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => apiRequest<AttemptResult>(`/v1/attempts/${attemptId}`),
  });

  useEffect(() => {
    const data = q.data;
    if (!data || syncedAttemptRef.current === data.attempt.id) return;
    syncedAttemptRef.current = data.attempt.id;
    const cards = buildQuizFlashcardsFromReview(data.attempt.examId, data.attempt.title, data.review);
    if (cards.length > 0) upsertStudyFlashcards(uid, cards);
  }, [q.data, uid]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={t('err.generic')} onRetry={() => q.refetch()} />;

  const { attempt, review, xpAwarded } = q.data;
  const good = attempt.passed && attempt.status === 'graded';

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/exams" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sanzar-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> {t('exams')}
      </Link>

      <div className="bg-hero-grad text-white rounded-3xl p-6 text-center space-y-2 shadow-md">
        <p className="text-white/75 text-sm">{attempt.title}</p>
        <p className="text-4xl font-black">
          {t('score', { s: attempt.score ?? 0, n: attempt.total ?? 0 })}
        </p>
        <p className={`text-sm font-bold ${good ? 'text-emerald-300' : 'text-white/90'}`}>
          {attempt.status === 'expired' ? t('expired') : good ? t('passed') : t('notPassed')}
        </p>
        {xpAwarded > 0 && (
          <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-bold">
            {t('xpEarned', { n: xpAwarded })}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {review.map((item, i) => {
          const right = item.chosen === item.answer;
          return (
            <div key={item.id} className="sanzar-card p-5 space-y-2">
              <div className="flex items-start gap-2.5">
                {right ? (
                  <CheckCircle2 className="w-5 h-5 text-sanzar-success shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-sanzar-danger shrink-0 mt-0.5" />
                )}
                <p className="font-semibold text-sm sm:text-base">
                  {i + 1}. {item.text}
                </p>
              </div>
              <p className="text-xs text-sanzar-text2">
                {t('yourAnswer')}:{' '}
                <span className="font-semibold">
                  {item.chosen == null ? t('notAnswered') : item.options[item.chosen]}
                </span>
              </p>
              {!right && item.answer != null && (
                <p className="text-xs text-sanzar-success font-semibold">
                  {t('correctAnswer')}: {item.options[item.answer]}
                </p>
              )}
              {item.explanation && (
                <p className="text-xs text-sanzar-muted bg-sanzar-surface2 p-3 rounded-xl">
                  {item.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
