import React, { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { CheckCircle2, Eye, EyeOff, PencilLine, Play, Sparkles } from 'lucide-react';
import type { DictionaryEntry } from '../../lib/models';
import { CanvasTracePad } from './CanvasTracePad';
import { EnglishWordStudio } from './EnglishWordStudio';

export function detectSyllableTone(syllable: string): 1 | 2 | 3 | 4 | 5 {
  if (/[āēīōūǖ]|1$/.test(syllable)) return 1;
  if (/[áéíóúǘ]|2$/.test(syllable)) return 2;
  if (/[ǎěǐǒǔǚ]|3$/.test(syllable)) return 3;
  if (/[àèìòùǜ]|4$/.test(syllable)) return 4;
  return 5;
}

export function toneColorClass(tone: 1 | 2 | 3 | 4 | 5): string {
  switch (tone) {
    case 1:
      return 'text-rose-600 dark:text-rose-400';
    case 2:
      return 'text-amber-600 dark:text-amber-400';
    case 3:
      return 'text-emerald-600 dark:text-emerald-400';
    case 4:
      return 'text-sky-600 dark:text-sky-400';
    default:
      return 'text-sanzar-muted';
  }
}

interface Props {
  word: string;
  language?: 'zh' | 'bn' | 'en';
  phonetic?: string;
  charEntries: DictionaryEntry[];
  relatedWords: DictionaryEntry[];
  onSelectWord: (word: string) => void;
  defaultCollapsed?: boolean;
}

export const HanziStrokeStudio: React.FC<Props> = (props) => {
  const { word, language, defaultCollapsed = false } = props;
  const effectiveLang: 'zh' | 'bn' | 'en' = /[\u4e00-\u9fff]/.test(word)
    ? 'zh'
    : /[\u0980-\u09ff]/.test(word)
      ? 'bn'
      : language === 'zh' || language === 'bn' || language === 'en'
        ? language
        : 'en';

  if (effectiveLang === 'bn') {
    return <CanvasTracePad word={word} lang="bn" defaultCollapsed={defaultCollapsed} />;
  }
  if (effectiveLang === 'en') {
    return <EnglishWordStudio word={word} defaultCollapsed={defaultCollapsed} />;
  }
  return <ChineseHanziStudio {...props} />;
};

const ChineseHanziStudio: React.FC<Props> = ({
  word,
  phonetic = '',
  charEntries,
  relatedWords,
  onSelectWord,
}) => {
  const chars = useMemo(
    () => Array.from(word).filter((ch) => /[\u4e00-\u9fff]/.test(ch)),
    [word]
  );

  const syllables = useMemo(() => {
    const parts = phonetic.trim().split(/\s+/).filter(Boolean);
    return parts.length === chars.length ? parts : [];
  }, [phonetic, chars.length]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [practiceMode, setPracticeMode] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [strokeProgress, setStrokeProgress] = useState<{ current: number; total: number; mistakes: number; done: boolean } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const targetRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);

  useEffect(() => {
    setActiveIdx(0);
    setPracticeMode(false);
    setShowOutline(true);
  }, [word]);

  const activeChar = chars[activeIdx] || chars[0] || '';
  const activeSyllable = syllables[activeIdx] || '';

  // Load stroke SVG paths + mount HanziWriter for the active character
  useEffect(() => {
    if (!activeChar || !targetRef.current) return;
    let cancelled = false;
    const container = targetRef.current;
    container.innerHTML = '';
    setLoadFailed(false);
    setStrokes([]);
    setStrokeProgress(null);

    const isDark = document.documentElement.classList.contains('dark');
    const strokeColor = isDark ? '#EEF5EF' : '#15251B';
    const outlineColor = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(21,37,27,0.14)';
    const radicalColor = isDark ? '#6FC294' : '#176B4B';

    HanziWriter.loadCharacterData(activeChar)
      .then((data) => {
        if (cancelled || !data) return;
        setStrokes(data.strokes || []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    try {
      const writer = HanziWriter.create(container, activeChar, {
        width: 176,
        height: 176,
        padding: 10,
        showOutline: true,
        showCharacter: true,
        strokeAnimationSpeed: 1.15,
        delayBetweenStrokes: 160,
        strokeColor,
        radicalColor,
        outlineColor,
        drawingColor: radicalColor,
        drawingWidth: 18,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
      });
      writerRef.current = writer;
    } catch {
      setLoadFailed(true);
    }

    return () => {
      cancelled = true;
      writerRef.current = null;
      container.innerHTML = '';
    };
  }, [activeChar]);

  const handleAnimate = () => {
    const w = writerRef.current;
    if (!w) return;
    setPracticeMode(false);
    setStrokeProgress(null);
    w.cancelQuiz();
    w.showCharacter();
    if (showOutline) w.showOutline();
    void w.animateCharacter();
  };

  const handleStartPractice = () => {
    const w = writerRef.current;
    if (!w) return;
    setPracticeMode(true);
    const total = strokes.length || 0;
    setStrokeProgress({ current: 0, total, mistakes: 0, done: false });
    w.hideCharacter();
    if (showOutline) w.showOutline();
    else w.hideOutline();

    w.quiz({
      onCorrectStroke: (data) => {
        setStrokeProgress((prev) => ({
          current: data.strokeNum + 1,
          total: total || (prev?.total ?? 0),
          mistakes: data.totalMistakes,
          done: false,
        }));
      },
      onMistake: (data) => {
        setStrokeProgress((prev) => ({
          current: data.strokeNum,
          total: total || (prev?.total ?? 0),
          mistakes: data.totalMistakes,
          done: false,
        }));
      },
      onComplete: (summary) => {
        setStrokeProgress({
          current: total,
          total,
          mistakes: summary.totalMistakes,
          done: true,
        });
      },
    });
  };

  const handleToggleOutline = () => {
    const w = writerRef.current;
    const next = !showOutline;
    setShowOutline(next);
    if (!w) return;
    if (next) w.showOutline();
    else w.hideOutline();
  };

  if (chars.length === 0) return null;

  const activeCharEntry = charEntries.find((e) => e.word === activeChar);

  return (
    <div className="space-y-4 pt-2 border-t border-sanzar-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">
          Character Breakdown &amp; Stroke Studio
        </p>
        {strokes.length > 0 && (
          <span className="sanzar-pill text-[11px]">{strokes.length} strokes</span>
        )}
      </div>

      {/* Multi-character selector pills (e.g. 你 | 好) */}
      {chars.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {chars.map((ch, idx) => {
            const syl = syllables[idx];
            const tone = syl ? detectSyllableTone(syl) : 5;
            const selected = idx === activeIdx;
            return (
              <button
                key={`${ch}-${idx}`}
                type="button"
                onClick={() => {
                  setActiveIdx(idx);
                  setPracticeMode(false);
                }}
                className={`px-3.5 py-2 rounded-xl border text-left transition flex items-baseline gap-2 ${
                  selected
                    ? 'bg-sanzar-primarySoft border-sanzar-primary/45 shadow-sm'
                    : 'bg-sanzar-surface2/70 border-sanzar-border hover:bg-sanzar-surface2'
                }`}
              >
                <span className="text-xl font-black text-sanzar-text">{ch}</span>
                {syl && <span className={`text-xs font-bold ${toneColorClass(tone)}`}>{syl}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Canvas + Interactive Controls + Character Meaning */}
      <div className="grid sm:grid-cols-[196px_1fr] gap-4 items-start">
        {/* Mìzìgé (米字格) Rice-Grid Canvas */}
        <div className="relative w-[176px] h-[176px] mx-auto sm:mx-0 rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-hidden shrink-0 select-none touch-none">
          <svg
            aria-hidden="true"
            viewBox="0 0 176 176"
            className="absolute inset-0 w-full h-full pointer-events-none text-emerald-900/10 dark:text-white/10"
          >
            <line x1="88" y1="0" x2="88" y2="176" stroke="currentColor" strokeDasharray="4 4" />
            <line x1="0" y1="88" x2="176" y2="88" stroke="currentColor" strokeDasharray="4 4" />
            <line x1="0" y1="0" x2="176" y2="176" stroke="currentColor" strokeDasharray="3 5" />
            <line x1="176" y1="0" x2="0" y2="176" stroke="currentColor" strokeDasharray="3 5" />
          </svg>
          <div ref={targetRef} className="relative z-10 w-full h-full cursor-crosshair" />
          {loadFailed && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-sanzar-muted p-3 text-center">
              Stroke data unavailable offline
            </div>
          )}
        </div>

        {/* Right Column: Controls + Character Meaning */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAnimate}
              disabled={loadFailed}
              className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-45"
            >
              <Play className="w-3.5 h-3.5" /> Animate
            </button>
            <button
              type="button"
              onClick={handleStartPractice}
              disabled={loadFailed}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition disabled:opacity-45 ${
                practiceMode
                  ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                  : 'border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-sanzar-text'
              }`}
            >
              <PencilLine className="w-3.5 h-3.5" /> Practice writing
            </button>
            <button
              type="button"
              onClick={handleToggleOutline}
              disabled={loadFailed}
              className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-1.5 text-sanzar-text2"
            >
              {showOutline ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showOutline ? 'Hide outline' : 'Show outline'}
            </button>
          </div>

          {/* Live Practice Feedback */}
          {practiceMode && strokeProgress && (
            <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border text-xs flex items-center justify-between gap-2">
              {strokeProgress.done ? (
                <span className="font-bold text-sanzar-primary inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed! ({strokeProgress.mistakes === 0 ? 'Perfect — 0 mistakes' : `${strokeProgress.mistakes} mistake(s)`})
                </span>
              ) : (
                <span className="text-sanzar-text2 font-medium">
                  Draw stroke <b>{Math.min(strokeProgress.current + 1, strokeProgress.total || 1)}</b>
                  {strokeProgress.total ? ` of ${strokeProgress.total}` : ''} inside the grid…
                </span>
              )}
              {strokeProgress.done && (
                <button
                  type="button"
                  onClick={handleStartPractice}
                  className="text-sanzar-primary font-bold hover:underline"
                >
                  Again
                </button>
              )}
            </div>
          )}

          {/* Individual Character Meaning Card (if present in D1) */}
          <div className="p-3.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-sanzar-text">{activeChar}</span>
                {(activeCharEntry?.phonetic || activeSyllable) && (
                  <span
                    className={`text-xs font-bold ${toneColorClass(
                      detectSyllableTone(activeCharEntry?.phonetic || activeSyllable)
                    )}`}
                  >
                    {activeCharEntry?.phonetic || activeSyllable}
                  </span>
                )}
              </div>
              {activeChar !== word && activeCharEntry && (
                <button
                  type="button"
                  onClick={() => onSelectWord(activeChar)}
                  className="text-[11px] font-bold text-sanzar-primary hover:underline"
                >
                  Open "{activeChar}" →
                </button>
              )}
            </div>
            {activeCharEntry ? (
              <p className="text-xs text-sanzar-text2 leading-relaxed">
                {[activeCharEntry.meaning_en, activeCharEntry.meaning_bn].filter(Boolean).join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-sanzar-muted">
                Character {activeIdx + 1} of {chars.length} in <b>{word}</b>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Step-by-Step Stroke Order Strip */}
      {strokes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-sanzar-muted">Stroke-by-stroke order</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {strokes.map((_, stepIdx) => (
              <div
                key={stepIdx}
                className="w-12 h-12 rounded-xl bg-white dark:bg-black/30 border border-sanzar-border shrink-0 relative flex items-center justify-center"
                title={`Stroke ${stepIdx + 1}`}
              >
                <span className="absolute top-0.5 left-1 text-[9px] font-bold text-sanzar-muted">
                  {stepIdx + 1}
                </span>
                <svg viewBox="0 0 1024 1024" className="w-9 h-9">
                  <g transform="scale(1, -1) translate(0, -900)">
                    {strokes.map((d, j) => (
                      <path
                        key={j}
                        d={d}
                        fill={
                          j < stepIdx
                            ? 'currentColor'
                            : j === stepIdx
                              ? '#19B46B'
                              : 'rgba(128,128,128,0.16)'
                        }
                      />
                    ))}
                  </g>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Compound Words containing these characters */}
      {relatedWords.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sanzar-primary" /> Related Words in SANZAR
          </p>
          <div className="flex flex-wrap gap-2">
            {relatedWords.map((rel) => (
              <button
                key={rel.id}
                type="button"
                onClick={() => onSelectWord(rel.word)}
                className="px-3 py-1.5 rounded-xl bg-sanzar-surface2/80 hover:bg-sanzar-primarySoft border border-sanzar-border hover:border-sanzar-primary/40 text-left transition flex items-baseline gap-2"
              >
                <span className="text-sm font-extrabold text-sanzar-text">{rel.word}</span>
                {rel.phonetic && (
                  <span className={`text-[11px] font-semibold ${toneColorClass(detectSyllableTone(rel.phonetic))}`}>
                    {rel.phonetic}
                  </span>
                )}
                {(rel.meaning_en || rel.meaning_bn) && (
                  <span className="text-[11px] text-sanzar-muted truncate max-w-[140px]">
                    {rel.meaning_en || rel.meaning_bn}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HanziStrokeStudio;
