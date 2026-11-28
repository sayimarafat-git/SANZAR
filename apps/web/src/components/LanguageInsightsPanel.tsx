import React, { useState } from 'react';
import {
  BookMarked,
  Loader2,
  Volume2,
} from 'lucide-react';
import type { DictLangCode, LanguageInsights } from '../lib/models';

interface LanguageInsightsPanelProps {
  insights: LanguageInsights | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPickWord: (word: string) => void;
  onSpeak: (text: string, lang: DictLangCode, rate?: number) => void;
}

function langName(code: DictLangCode): string {
  if (code === 'zh-Hans') return '简体中文';
  if (code === 'bn') return 'বাংলা';
  if (code === 'id') return 'Bahasa Indonesia';
  return 'English';
}

export const LanguageInsightsPanel: React.FC<LanguageInsightsPanelProps> = ({
  insights,
  loading,
  error,
  onRetry,
  onPickWord,
  onSpeak,
}) => {
  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null);

  if (!loading && !error && !insights) return null;

  if (loading && !insights) {
    return (
      <div className="sanzar-card p-4 sm:p-5 flex items-center gap-3 text-sm text-sanzar-muted">
        <Loader2 className="w-4 h-4 animate-spin text-sanzar-primary shrink-0" />
        <span>Loading vocabulary insights…</span>
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div className="sanzar-card p-4 flex items-center justify-between gap-3 text-xs text-sanzar-danger border-sanzar-danger/30 bg-sanzar-danger/10">
        <span>{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1 rounded-lg bg-sanzar-danger/15 hover:bg-sanzar-danger/25 font-bold shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!insights) return null;

  const segments = insights.segments && insights.segments.length >= 2 ? insights.segments : [];
  const activeSeg =
    selectedSegIdx !== null && selectedSegIdx >= 0 && selectedSegIdx < segments.length
      ? segments[selectedSegIdx]
      : null;

  return (
    <div className="space-y-4">
      {/* Tap-a-Word Chinese Sentence Breakdown */}
      {segments.length >= 2 && (
        <section className="sanzar-card overflow-hidden border-emerald-500/25">
          <div className="px-4 sm:px-5 py-3 border-b border-sanzar-border/70 flex items-center justify-between gap-2 bg-emerald-500/5">
            <div className="flex items-center gap-2 min-w-0">
              <BookMarked className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="font-bold text-sm truncate">Word-by-Word Breakdown</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Tap a word
              </span>
            </div>
            <span className="text-[11px] font-semibold text-sanzar-muted shrink-0">
              {segments.length} words
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {segments.map((seg, idx) => {
                const isSelected = selectedSegIdx === idx;
                return (
                  <button
                    key={`${seg.word}-${idx}`}
                    type="button"
                    onClick={() => setSelectedSegIdx(isSelected ? null : idx)}
                    className={`px-3 py-1.5 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-sanzar-text shadow-sm'
                        : 'bg-sanzar-surface2/70 border-sanzar-border hover:border-emerald-500/40'
                    }`}
                  >
                    <span className="block text-base font-bold leading-tight text-sanzar-text">
                      {seg.word}
                    </span>
                    {seg.pinyin && (
                      <span className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {seg.pinyin}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeSeg && (
              <div className="p-3.5 rounded-2xl bg-sanzar-surface2/80 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-sanzar-text">{activeSeg.word}</span>
                    {activeSeg.pinyin && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {activeSeg.pinyin}
                      </span>
                    )}
                    {activeSeg.hskLevel && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sanzar-primarySoft text-sanzar-primary">
                        {activeSeg.hskLevel}
                      </span>
                    )}
                  </div>
                  {activeSeg.meaningEn && (
                    <p className="text-xs sm:text-sm text-sanzar-text2">
                      <span className="font-bold text-sanzar-text">EN:</span> {activeSeg.meaningEn}
                    </p>
                  )}
                  {activeSeg.meaningBn && (
                    <p className="text-xs sm:text-sm text-sanzar-text2">
                      <span className="font-bold text-sanzar-text">BN:</span> {activeSeg.meaningBn}
                    </p>
                  )}
                  {!activeSeg.meaningEn && !activeSeg.meaningBn && (
                    <p className="text-xs text-sanzar-muted">No exact dictionary entry yet.</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSpeak(activeSeg.word, 'zh-Hans', 0.9)}
                    title="Listen"
                    className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface text-sanzar-primary hover:bg-sanzar-surface2 transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickWord(activeSeg.word)}
                    className="px-3 py-1.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold hover:opacity-95 transition"
                  >
                    Translate word
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Advanced Vocabulary */}
      <section className="sanzar-card overflow-hidden border-sanzar-primary/25">
        <div className="px-4 sm:px-5 py-3 border-b border-sanzar-border/70 flex items-center justify-between gap-2 bg-sanzar-surface2/50">
          <div className="flex items-center gap-2 min-w-0">
            <BookMarked className="w-4 h-4 text-sanzar-primary shrink-0" />
            <h3 className="font-bold text-sm truncate">Advanced Vocabulary</h3>
            {insights.vocabulary.partOfSpeech && (
              <span className="sanzar-pill text-[10px]">{insights.vocabulary.partOfSpeech}</span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Synonyms</p>
              {insights.vocabulary.synonyms.length === 0 ? (
                <p className="text-xs text-sanzar-muted">No direct synonyms found.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {insights.vocabulary.synonyms.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onPickWord(s.word)}
                      className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition text-left"
                    >
                      <span>{s.word}</span>
                      {s.pinyin && <span className="ml-1 opacity-75 font-normal">({s.pinyin})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Antonyms</p>
              {insights.vocabulary.antonyms.length === 0 ? (
                <p className="text-xs text-sanzar-muted">No direct antonyms found.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {insights.vocabulary.antonyms.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onPickWord(a.word)}
                      className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 transition text-left"
                    >
                      <span>{a.word}</span>
                      {a.pinyin && <span className="ml-1 opacity-75 font-normal">({a.pinyin})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {insights.vocabulary.collocations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">
                Collocations &amp; Common Phrases
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {insights.vocabulary.collocations.map((col, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onPickWord(col.phrase)}
                        className="font-bold text-xs sm:text-sm text-sanzar-text hover:text-sanzar-primary transition text-left"
                      >
                        {col.phrase}
                      </button>
                      {col.pinyin && <p className="text-[11px] text-sanzar-primary font-medium">{col.pinyin}</p>}
                      {col.meaning && <p className="text-[11px] text-sanzar-muted mt-0.5">{col.meaning}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSpeak(col.phrase, insights.language, 1.0)}
                      className="p-1.5 rounded-lg hover:bg-sanzar-surface text-sanzar-primary shrink-0"
                      title="Listen"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights.vocabulary.relatedWords.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Related Words</p>
              <div className="flex flex-wrap gap-1.5">
                {insights.vocabulary.relatedWords.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPickWord(r.word)}
                    className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-sanzar-surface2 hover:bg-sanzar-primarySoft hover:text-sanzar-primary border border-sanzar-border transition"
                  >
                    {r.word}
                    {r.pinyin ? ` (${r.pinyin})` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
