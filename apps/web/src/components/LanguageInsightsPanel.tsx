import React, { useState } from 'react';
import {
  BookMarked,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Volume2,
  Wand2,
  X,
  AlertCircle,
} from 'lucide-react';
import type { DictLangCode, LanguageInsights } from '../lib/models';

interface LanguageInsightsPanelProps {
  insights: LanguageInsights | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onPickWord: (word: string) => void;
  onApplyCorrection?: (corrected: string) => void;
  onSpeak: (text: string, lang: DictLangCode, rate?: number) => void;
}

function langName(code: DictLangCode): string {
  if (code === 'zh-Hans') return '简体中文';
  if (code === 'bn') return 'বাংলা';
  return 'English';
}

export const LanguageInsightsPanel: React.FC<LanguageInsightsPanelProps> = ({
  insights,
  loading,
  error,
  onClose,
  onRetry,
  onPickWord,
  onApplyCorrection,
  onSpeak,
}) => {
  const [tab, setTab] = useState<'grammar' | 'vocabulary'>('grammar');
  const [copied, setCopied] = useState(false);

  if (!loading && !error && !insights) return null;

  const copyCorrected = (val: string) => {
    void navigator.clipboard?.writeText(val);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="sanzar-card overflow-hidden border-sanzar-primary/30">
      <div className="px-4 sm:px-5 py-3 border-b border-sanzar-border/70 flex flex-wrap items-center justify-between gap-2 bg-sanzar-surface2/50">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-sanzar-primary shrink-0" />
          <h3 className="font-bold text-sm truncate">Grammar &amp; Advanced Vocabulary</h3>
          {insights && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sanzar-primarySoft text-sanzar-primary">
              {langName(insights.language)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-sanzar-border bg-sanzar-surface p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setTab('grammar')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
                tab === 'grammar'
                  ? 'bg-sanzar-primary text-sanzar-onPrimary'
                  : 'text-sanzar-text2 hover:text-sanzar-text'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" /> Grammar
            </button>
            <button
              type="button"
              onClick={() => setTab('vocabulary')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
                tab === 'vocabulary'
                  ? 'bg-sanzar-primary text-sanzar-onPrimary'
                  : 'text-sanzar-text2 hover:text-sanzar-text'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" /> Vocabulary
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close insights"
            className="p-1.5 rounded-lg text-sanzar-muted hover:text-sanzar-text hover:bg-sanzar-surface2 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-sanzar-muted py-4">
            <Loader2 className="w-4 h-4 animate-spin text-sanzar-primary" />
            <span>Analyzing grammar, synonyms, antonyms, and collocations…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 text-xs text-sanzar-danger bg-sanzar-danger/10 border border-sanzar-danger/30 rounded-xl p-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 rounded-lg bg-sanzar-danger/15 hover:bg-sanzar-danger/25 font-bold shrink-0"
            >
              Retry
            </button>
          </div>
        ) : insights ? (
          tab === 'grammar' ? (
            <div className="space-y-4">
              {/* Grammar Status & Correction */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2 ${
                  insights.grammar.isCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/25'
                    : 'bg-amber-500/10 border-amber-500/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {insights.grammar.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-700 dark:text-emerald-300">Looks grammatically natural</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-700 dark:text-amber-300">Suggested correction</span>
                      </>
                    )}
                  </div>
                  {insights.grammar.correctedText && insights.grammar.correctedText !== insights.text && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSpeak(insights.grammar.correctedText, insights.language, 1.0)}
                        title="Listen"
                        className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface text-sanzar-primary hover:bg-sanzar-surface2 transition"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyCorrected(insights.grammar.correctedText)}
                        title="Copy"
                        className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface text-sanzar-text2 hover:bg-sanzar-surface2 transition"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-sanzar-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      {onApplyCorrection && (
                        <button
                          type="button"
                          onClick={() => onApplyCorrection(insights.grammar.correctedText)}
                          className="px-2.5 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary text-[11px] font-bold"
                        >
                          Use corrected
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {insights.grammar.correctedText && insights.grammar.correctedText !== insights.text && (
                  <p className="text-base font-bold text-sanzar-text">{insights.grammar.correctedText}</p>
                )}
                {insights.pinyin && (
                  <p className="text-xs font-semibold text-sanzar-primary">Pinyin: {insights.pinyin}</p>
                )}
                <p className="text-xs sm:text-sm text-sanzar-text2 leading-relaxed">{insights.grammar.summary}</p>
              </div>

              {/* Grammar Points */}
              {insights.grammar.points.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {insights.grammar.points.map((pt, idx) => (
                    <div key={idx} className="p-3.5 rounded-2xl bg-sanzar-surface2/70 border border-sanzar-border space-y-1.5">
                      <p className="font-bold text-xs sm:text-sm text-sanzar-text">{pt.title}</p>
                      <p className="text-xs text-sanzar-text2 leading-relaxed">{pt.explanation}</p>
                      {pt.example && (
                        <div className="pt-1 flex items-center justify-between gap-2 text-xs font-medium text-sanzar-primary">
                          <span className="truncate">{pt.example}</span>
                          <button
                            type="button"
                            onClick={() => onSpeak(pt.example!, insights.language, 1.0)}
                            className="p-1 rounded-md hover:bg-sanzar-surface shrink-0"
                            title="Listen to example"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Usage Tips */}
              {insights.grammar.tips.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Tips</p>
                  <ul className="space-y-1 text-xs text-sanzar-text2 list-disc pl-4">
                    {insights.grammar.tips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {insights.vocabulary.partOfSpeech && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sanzar-muted font-medium">Part of speech:</span>
                  <span className="sanzar-pill">{insights.vocabulary.partOfSpeech}</span>
                </div>
              )}

              {/* Synonyms & Antonyms */}
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

              {/* Collocations */}
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

              {/* Related Words */}
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
          )
        ) : null}
      </div>
    </section>
  );
};
