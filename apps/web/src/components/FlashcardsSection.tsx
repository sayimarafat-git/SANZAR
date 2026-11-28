import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookA,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Shuffle,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import type { DictLangCode, SavedVocabularyItem } from '../lib/models';
import {
  FLASHCARDS_UPDATED_EVENT,
  getStudyFlashcards,
  type StudyFlashcard,
  type StudyFlashcardSource,
} from '../lib/study-flashcards';
import { getLocalSavedVocabulary, syncSavedVocabulary } from '../features/dictionary/dictionary-db';
import { Modal } from './SanzarUI';

export type FlashcardSource = 'vocab' | StudyFlashcardSource;
export type FlashcardFilter = 'all' | 'vocab' | 'lesson' | 'qa_quiz';

export interface UnifiedFlashcard {
  id: string;
  source: FlashcardSource;
  front: string;
  back: string;
  phonetic?: string;
  partOfSpeech?: string;
  example?: string;
  hint?: string;
  hskLevel?: string;
  lang: string;
  missed?: boolean;
  updatedAt: number;
}

function langLabel(code: DictLangCode | string): string {
  if (code === 'zh' || code === 'zh-Hans') return '简体中文';
  if (code === 'bn') return 'বাংলা';
  if (code === 'id') return 'Bahasa Indonesia';
  return 'English';
}

function langBadgeClass(code: DictLangCode | string): string {
  if (code === 'zh' || code === 'zh-Hans') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
  }
  if (code === 'bn') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25';
  }
  if (code === 'id') {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25';
  }
  return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25';
}

function sourceLabel(source: FlashcardSource): string {
  if (source === 'vocab') return 'Saved Word';
  if (source === 'lesson') return 'Lesson';
  if (source === 'qa') return 'Q&A';
  return 'Quiz';
}

function sourceBadgeClass(source: FlashcardSource): string {
  if (source === 'vocab') {
    return 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/25';
  }
  if (source === 'lesson') {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25';
  }
  if (source === 'qa') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25';
  }
  return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/25';
}

function speakCardWord(text: string, langCode: DictLangCode | string) {
  const clean = text.trim().slice(0, 200);
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !clean) return;
  const targetLang =
    langCode === 'zh-Hans' || langCode === 'zh'
      ? 'zh-CN'
      : langCode === 'bn'
        ? 'bn-BD'
        : langCode === 'id'
          ? 'id-ID'
          : 'en-US';
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = targetLang;
  const prefix = targetLang.split('-')[0].toLowerCase();
  const voices = synth.getVoices();
  const voice =
    voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}

export function useSavedVocabulary() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const qc = useQueryClient();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void getLocalSavedVocabulary(uid).then((local) => {
      if (!cancelled && local.length > 0) {
        qc.setQueryData<SavedVocabularyItem[]>(['saved-vocabulary', uid], (prev) => prev ?? local);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid, qc]);

  return useQuery<SavedVocabularyItem[]>({
    queryKey: ['saved-vocabulary', uid],
    queryFn: async () => {
      if (!uid) return [];
      const local = await getLocalSavedVocabulary(uid);
      try {
        return await syncSavedVocabulary(uid);
      } catch {
        return local;
      }
    },
    enabled: !!uid,
    staleTime: 30_000,
    retry: false,
  });
}

function useStudyFlashcards(uid: string): StudyFlashcard[] {
  const [cards, setCards] = useState<StudyFlashcard[]>(() => (uid ? getStudyFlashcards(uid) : []));

  useEffect(() => {
    if (!uid) {
      setCards([]);
      return;
    }
    const refresh = () => setCards(getStudyFlashcards(uid));
    refresh();
    window.addEventListener(FLASHCARDS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(FLASHCARDS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [uid]);

  return cards;
}

export function useUnifiedFlashcards() {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const vocabQuery = useSavedVocabulary();
  const studyCards = useStudyFlashcards(uid);

  const items = useMemo<UnifiedFlashcard[]>(() => {
    const vocabCards: UnifiedFlashcard[] = (vocabQuery.data ?? []).map((item) => ({
      id: `vocab:${item.id}`,
      source: 'vocab',
      front: item.word,
      back: item.meaning,
      phonetic: item.phonetic,
      partOfSpeech: item.part_of_speech,
      example: item.example,
      hskLevel: item.hsk_level,
      lang: item.source_language,
      missed: false,
      updatedAt: item.updated_at || item.created_at || 0,
    }));

    const convertedStudy: UnifiedFlashcard[] = studyCards.map((card) => ({
      id: card.id,
      source: card.source,
      front: card.front,
      back: card.back,
      hint: card.hint,
      lang: card.lang || 'en',
      missed: Boolean(card.missed),
      updatedAt: card.updatedAt || 0,
    }));

    return [...vocabCards, ...convertedStudy].sort((a, b) => {
      const aMissed = a.missed ? 1 : 0;
      const bMissed = b.missed ? 1 : 0;
      if (aMissed !== bMissed) return bMissed - aMissed;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [vocabQuery.data, studyCards]);

  const counts = useMemo(() => {
    let vocab = 0;
    let lesson = 0;
    let qaQuiz = 0;
    for (const item of items) {
      if (item.source === 'vocab') vocab += 1;
      else if (item.source === 'lesson') lesson += 1;
      else qaQuiz += 1;
    }
    return { total: items.length, vocab, lesson, qaQuiz };
  }, [items]);

  return {
    items,
    counts,
    isLoading: vocabQuery.isLoading,
  };
}

function deckSummaryText(counts: { total: number; vocab: number; lesson: number; qaQuiz: number }): string {
  const parts: string[] = [];
  if (counts.vocab > 0) parts.push(`${counts.vocab} ${counts.vocab === 1 ? 'word' : 'words'}`);
  if (counts.lesson > 0) parts.push(`${counts.lesson} ${counts.lesson === 1 ? 'lesson' : 'lessons'}`);
  if (counts.qaQuiz > 0) parts.push(`${counts.qaQuiz} Q&A/quiz`);
  return parts.join(' · ');
}

export const FlashcardReviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  items: UnifiedFlashcard[];
  title?: string;
}> = ({ open, onClose, items, title = 'Flashcards Review' }) => {
  const [filter, setFilter] = useState<FlashcardFilter>('all');
  const [deck, setDeck] = useState<UnifiedFlashcard[]>(items);
  const [shuffled, setShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const filterOptions = useMemo(() => {
    const vocabCount = items.filter((i) => i.source === 'vocab').length;
    const lessonCount = items.filter((i) => i.source === 'lesson').length;
    const qaQuizCount = items.filter((i) => i.source === 'qa' || i.source === 'quiz').length;

    const opts: { id: FlashcardFilter; label: string; count: number }[] = [
      { id: 'all', label: 'All', count: items.length },
    ];
    if (vocabCount > 0) opts.push({ id: 'vocab', label: 'Words', count: vocabCount });
    if (lessonCount > 0) opts.push({ id: 'lesson', label: 'Lessons', count: lessonCount });
    if (qaQuizCount > 0) opts.push({ id: 'qa_quiz', label: 'Q&A & Quiz', count: qaQuizCount });
    return opts;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'vocab') return items.filter((i) => i.source === 'vocab');
    if (filter === 'lesson') return items.filter((i) => i.source === 'lesson');
    return items.filter((i) => i.source === 'qa' || i.source === 'quiz');
  }, [items, filter]);

  useEffect(() => {
    if (!open) return;
    setFilter('all');
    setShuffled(false);
    setIndex(0);
    setFlipped(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (filter !== 'all' && !filterOptions.some((o) => o.id === filter)) {
      setFilter('all');
      return;
    }
    setDeck(filteredItems);
    setShuffled(false);
    setIndex(0);
    setFlipped(false);
  }, [open, filter, filteredItems, filterOptions]);

  const safeIndex = deck.length > 0 ? Math.min(index, deck.length - 1) : 0;
  const card = deck[safeIndex];

  const handleShuffle = useCallback(() => {
    if (filteredItems.length <= 1) return;
    const copy = [...filteredItems];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setDeck(copy);
    setShuffled(true);
    setIndex(0);
    setFlipped(false);
  }, [filteredItems]);

  const handleResetOrder = useCallback(() => {
    setDeck(filteredItems);
    setShuffled(false);
    setIndex(0);
    setFlipped(false);
  }, [filteredItems]);

  const handlePrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setFlipped(false);
  }, []);

  const handleNext = useCallback(() => {
    setIndex((i) => Math.min(deck.length - 1, i + 1));
    setFlipped(false);
  }, [deck.length]);

  useEffect(() => {
    if (!open || deck.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deck.length, handlePrev, handleNext]);

  if (!open) return null;

  const isVocab = card?.source === 'vocab';

  return (
    <Modal title={title} onClose={onClose}>
      {items.length === 0 || !card ? (
        <div className="py-10 text-center space-y-3">
          <Layers className="w-10 h-10 text-sanzar-muted mx-auto opacity-60" />
          <p className="text-sm font-bold text-sanzar-text">No study flashcards yet</p>
          <p className="text-xs text-sanzar-muted max-w-sm mx-auto">
            Save words from Dictionary, open lessons in Library, or complete Q&amp;A and quizzes to build your deck.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Link
              to="/dictionary"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold"
            >
              <BookA className="w-3.5 h-3.5" /> Open Dictionary
            </Link>
            <Link
              to="/library"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sanzar-border text-xs font-bold text-sanzar-text hover:bg-sanzar-surface2"
            >
              <BookOpen className="w-3.5 h-3.5" /> Open Library
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filterOptions.length > 2 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filterOptions.map((opt) => {
                const active = filter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                        : 'border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] font-bold ${active ? 'opacity-90' : 'text-sanzar-muted'}`}>
                      {opt.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-sanzar-muted">
              {safeIndex + 1} / {deck.length}
            </span>
            <div className="flex items-center gap-2">
              {shuffled && (
                <button
                  type="button"
                  onClick={handleResetOrder}
                  className="px-2.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold text-sanzar-text2 hover:bg-sanzar-surface2 transition inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              )}
              <button
                type="button"
                onClick={handleShuffle}
                disabled={deck.length <= 1}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition inline-flex items-center gap-1.5 disabled:opacity-40 ${
                  shuffled
                    ? 'bg-sanzar-primarySoft border-sanzar-primary/40 text-sanzar-primary'
                    : 'border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" /> Shuffle
              </button>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
            className="sanzar-card p-6 sm:p-9 min-h-[250px] flex flex-col items-center justify-center text-center cursor-pointer border-sanzar-primary/35 hover:border-sanzar-primary/60 transition select-none space-y-4"
          >
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${sourceBadgeClass(card.source)}`}
              >
                {sourceLabel(card.source)}
              </span>
              {card.missed && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30">
                  Missed
                </span>
              )}
              {isVocab && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${langBadgeClass(card.lang)}`}
                >
                  {flipped ? 'Meaning & Pinyin' : langLabel(card.lang)}
                </span>
              )}
              {card.hskLevel && <span className="sanzar-pill published text-[11px]">{card.hskLevel}</span>}
            </div>

            {!flipped ? (
              <div className="space-y-2 max-w-lg">
                <h3
                  className={
                    isVocab && card.front.length <= 24
                      ? 'text-3xl sm:text-4xl font-black tracking-tight text-sanzar-text'
                      : 'text-lg sm:text-xl font-bold leading-snug text-sanzar-text whitespace-pre-wrap'
                  }
                >
                  {card.front}
                </h3>
                {card.partOfSpeech && (
                  <p className="text-xs font-medium text-sanzar-muted">{card.partOfSpeech}</p>
                )}
                {card.hint && <p className="text-xs font-medium text-sanzar-muted">{card.hint}</p>}
              </div>
            ) : (
              <div className="space-y-2.5 max-w-lg">
                {card.phonetic && (
                  <p className="text-base font-bold text-sanzar-primary">{card.phonetic}</p>
                )}
                <p
                  className={
                    isVocab && card.back.length <= 80
                      ? 'text-xl sm:text-2xl font-bold text-sanzar-text leading-snug'
                      : 'text-sm sm:text-base font-medium text-sanzar-text leading-relaxed whitespace-pre-wrap'
                  }
                >
                  {card.back}
                </p>
                {card.example && (
                  <p className="text-xs text-sanzar-muted italic pt-1">{card.example}</p>
                )}
                {card.hint && <p className="text-xs text-sanzar-muted pt-1">{card.hint}</p>}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => speakCardWord(card.front, card.lang)}
                className="px-3 py-1.5 rounded-xl bg-sanzar-primarySoft text-sanzar-primary text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition"
              >
                <Volume2 className="w-3.5 h-3.5" /> Speak
              </button>
              <span className="text-[11px] text-sanzar-muted">
                {flipped
                  ? 'Tap card to show front'
                  : isVocab
                    ? 'Tap card to reveal pinyin & meaning'
                    : 'Tap card to reveal answer'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={handlePrev}
              className="px-4 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <Link
              to="/dictionary?tab=saved"
              onClick={onClose}
              className="text-xs font-semibold text-sanzar-primary hover:underline"
            >
              Manage saved words
            </Link>
            <button
              type="button"
              disabled={safeIndex >= deck.length - 1}
              onClick={handleNext}
              className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export const HomeFlashcardsSection: React.FC = () => {
  const { user } = useAuth();
  const { items, counts, isLoading } = useUnifiedFlashcards();
  const [reviewOpen, setReviewOpen] = useState(false);

  const previewItems = useMemo(() => items.slice(0, 6), [items]);
  const summary = useMemo(() => deckSummaryText(counts), [counts]);

  if (!user) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Flashcards</h2>
          <span className="px-2 py-0.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-[11px] font-bold">
            {counts.total} {counts.total === 1 ? 'card' : 'cards'}
          </span>
        </div>
        <Link
          to="/dictionary?tab=saved"
          className="text-xs sm:text-sm font-semibold text-sanzar-primary hover:underline inline-flex items-center gap-0.5"
        >
          Manage words <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="sanzar-card p-5 space-y-4">
        {isLoading && items.length === 0 ? (
          <div className="py-4 text-center text-xs text-sanzar-muted">Loading study flashcards…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-sm text-sanzar-text">Build your flashcard deck</p>
                <p className="text-xs text-sanzar-text2">
                  Save words from Dictionary, open lessons, or practice Q&amp;A and quizzes to auto-sync flip cards.
                </p>
              </div>
            </div>
            <Link
              to="/dictionary"
              className="px-4 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 hover:opacity-95 transition"
            >
              <BookA className="w-4 h-4" /> Open Dictionary
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {previewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface2/60 hover:border-sanzar-primary/50 transition text-left max-w-[230px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-sanzar-text truncate">{item.front}</span>
                    {item.phonetic && (
                      <span className="text-[11px] font-semibold text-sanzar-primary truncate">
                        {item.phonetic}
                      </span>
                    )}
                    {item.missed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Missed" />
                    )}
                  </div>
                  <p className="text-[11px] text-sanzar-muted truncate">
                    {sourceLabel(item.source)} · {item.back}
                  </p>
                </button>
              ))}
              {items.length > previewItems.length && (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-dashed border-sanzar-border text-xs font-semibold text-sanzar-muted hover:text-sanzar-primary hover:border-sanzar-primary/50 transition flex items-center"
                >
                  +{items.length - previewItems.length} more
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-sanzar-border/70">
              <p className="text-xs text-sanzar-text2">
                {summary ? `${summary} synced for review` : `${counts.total} flashcards ready`}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  to="/dictionary?tab=saved"
                  className="px-3.5 py-2 rounded-xl border border-sanzar-border text-xs font-semibold text-sanzar-text2 hover:bg-sanzar-surface2 transition"
                >
                  View Words
                </Link>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition"
                >
                  <Layers className="w-4 h-4" /> Review Flashcards
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <FlashcardReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} items={items} />
    </section>
  );
};

export const ExamsFlashcardsBanner: React.FC = () => {
  const { user } = useAuth();
  const { items, counts } = useUnifiedFlashcards();
  const [reviewOpen, setReviewOpen] = useState(false);

  const summary = useMemo(() => deckSummaryText(counts), [counts]);

  if (!user) return null;

  return (
    <>
      <div className="sanzar-card p-4 flex flex-wrap items-center justify-between gap-3 bg-sanzar-primarySoft/40 border-sanzar-primary/25">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-sm text-sanzar-text">Study Flashcards</h2>
              <span className="px-2 py-0.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-[11px] font-bold">
                {counts.total}
              </span>
            </div>
            <p className="text-xs text-sanzar-text2 truncate">
              {counts.total > 0
                ? `${counts.total} ${counts.total === 1 ? 'card' : 'cards'} ready (${summary})`
                : 'Save words, open lessons, or attend Q&A and quizzes to practice flashcards'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition"
            >
              <Layers className="w-3.5 h-3.5" /> Review Flashcards
            </button>
          ) : (
            <Link
              to="/dictionary"
              className="px-3.5 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface text-xs font-semibold text-sanzar-text hover:bg-sanzar-surface2 transition inline-flex items-center gap-1.5"
            >
              <BookA className="w-3.5 h-3.5" /> Open Dictionary
            </Link>
          )}
        </div>
      </div>

      <FlashcardReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} items={items} />
    </>
  );
};
