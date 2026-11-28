import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookA,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Shuffle,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import type { DictLangCode, SavedVocabularyItem } from '../lib/models';
import { getLocalSavedVocabulary, syncSavedVocabulary } from '../features/dictionary/dictionary-db';
import { Modal } from './SanzarUI';

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

export const FlashcardReviewModal: React.FC<{
  open: boolean;
  onClose: () => void;
  items: SavedVocabularyItem[];
  title?: string;
}> = ({ open, onClose, items, title = 'Flashcards Review' }) => {
  const [deck, setDeck] = useState<SavedVocabularyItem[]>(items);
  const [shuffled, setShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDeck(items);
    setShuffled(false);
    setIndex(0);
    setFlipped(false);
  }, [open, items]);

  const safeIndex = deck.length > 0 ? Math.min(index, deck.length - 1) : 0;
  const card = deck[safeIndex];

  const handleShuffle = useCallback(() => {
    if (items.length <= 1) return;
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setDeck(copy);
    setShuffled(true);
    setIndex(0);
    setFlipped(false);
  }, [items]);

  const handleResetOrder = useCallback(() => {
    setDeck(items);
    setShuffled(false);
    setIndex(0);
    setFlipped(false);
  }, [items]);

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

  return (
    <Modal title={title} onClose={onClose}>
      {deck.length === 0 || !card ? (
        <div className="py-10 text-center space-y-3">
          <Layers className="w-10 h-10 text-sanzar-muted mx-auto opacity-60" />
          <p className="text-sm font-bold text-sanzar-text">No saved flashcards yet</p>
          <p className="text-xs text-sanzar-muted">
            Save words from the Dictionary to practice them with flashcards.
          </p>
          <Link
            to="/dictionary"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold"
          >
            <BookA className="w-3.5 h-3.5" /> Open Dictionary
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
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
            className="sanzar-card p-7 sm:p-10 min-h-[250px] flex flex-col items-center justify-center text-center cursor-pointer border-sanzar-primary/35 hover:border-sanzar-primary/60 transition select-none space-y-4"
          >
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${langBadgeClass(card.source_language)}`}
              >
                {flipped ? 'Meaning & Pinyin' : langLabel(card.source_language)}
              </span>
              {card.hsk_level && (
                <span className="sanzar-pill published text-[11px]">{card.hsk_level}</span>
              )}
            </div>

            {!flipped ? (
              <div className="space-y-2">
                <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-sanzar-text">
                  {card.word}
                </h3>
                {card.part_of_speech && (
                  <p className="text-xs font-medium text-sanzar-muted">{card.part_of_speech}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {card.phonetic && (
                  <p className="text-base font-bold text-sanzar-primary">{card.phonetic}</p>
                )}
                <p className="text-xl sm:text-2xl font-bold text-sanzar-text leading-snug">
                  {card.meaning}
                </p>
                {card.example && (
                  <p className="text-xs text-sanzar-muted italic pt-1">{card.example}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => speakCardWord(card.word, card.source_language)}
                className="px-3 py-1.5 rounded-xl bg-sanzar-primarySoft text-sanzar-primary text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition"
              >
                <Volume2 className="w-3.5 h-3.5" /> Speak
              </button>
              <span className="text-[11px] text-sanzar-muted">
                {flipped ? 'Tap card to show word' : 'Tap card to reveal pinyin & meaning'}
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
  const { data: items = [], isLoading } = useSavedVocabulary();
  const [reviewOpen, setReviewOpen] = useState(false);

  const previewItems = useMemo(() => items.slice(0, 6), [items]);

  if (!user) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Flashcards</h2>
          <span className="px-2 py-0.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-[11px] font-bold">
            {items.length} saved
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
          <div className="py-4 text-center text-xs text-sanzar-muted">Loading saved vocabulary…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-sm text-sanzar-text">Build your flashcard deck</p>
                <p className="text-xs text-sanzar-text2">
                  Save words from the Dictionary or Translator and review them anytime with flip cards.
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
                  className="px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface2/60 hover:border-sanzar-primary/50 transition text-left max-w-[220px]"
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-sm text-sanzar-text truncate">{item.word}</span>
                    {item.phonetic && (
                      <span className="text-[11px] font-semibold text-sanzar-primary truncate">
                        {item.phonetic}
                      </span>
                    )}
                  </div>
                  {item.meaning && (
                    <p className="text-[11px] text-sanzar-muted truncate">{item.meaning}</p>
                  )}
                </button>
              ))}
              {items.length > previewItems.length && (
                <Link
                  to="/dictionary?tab=saved"
                  className="px-3 py-1.5 rounded-xl border border-dashed border-sanzar-border text-xs font-semibold text-sanzar-muted hover:text-sanzar-primary hover:border-sanzar-primary/50 transition flex items-center"
                >
                  +{items.length - previewItems.length} more
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-sanzar-border/70">
              <p className="text-xs text-sanzar-text2">
                {items.length} {items.length === 1 ? 'word' : 'words'} synced from your Dictionary
              </p>
              <div className="flex items-center gap-2">
                <Link
                  to="/dictionary?tab=saved"
                  className="px-3.5 py-2 rounded-xl border border-sanzar-border text-xs font-semibold text-sanzar-text2 hover:bg-sanzar-surface2 transition"
                >
                  View All
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
  const { data: items = [] } = useSavedVocabulary();
  const [reviewOpen, setReviewOpen] = useState(false);

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
              <h2 className="font-bold text-sm text-sanzar-text">Vocabulary Flashcards</h2>
              <span className="px-2 py-0.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-[11px] font-bold">
                {items.length}
              </span>
            </div>
            <p className="text-xs text-sanzar-text2 truncate">
              {items.length > 0
                ? `${items.length} saved ${items.length === 1 ? 'word' : 'words'} ready for quick warm-up review`
                : 'Save words in Dictionary to practice flashcards before exams'}
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
