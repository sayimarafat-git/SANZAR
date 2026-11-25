import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, Gauge, PencilLine, Play, RotateCcw } from 'lucide-react';
import { ENGLISH_HANDWRITING_FONT, layoutEnglishWord } from './latin-pen-paths';

interface Props {
  word: string;
  defaultCollapsed?: boolean;
}

export const EnglishWordStudio: React.FC<Props> = ({ word, defaultCollapsed = false }) => {
  const words = useMemo(
    () => word.trim().split(/\s+/).filter(Boolean).slice(0, 6),
    [word]
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [wordIdx, setWordIdx] = useState(0);
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [showOutline, setShowOutline] = useState(true);

  // Continuous 60fps word animation state
  const [animating, setAnimating] = useState(false);
  const [animState, setAnimState] = useState<{
    strokeIdx: number;
    progress: number; // 0..1 of current stroke
    nib: { x: number; y: number } | null;
  } | null>(null);

  // Snap-to-stroke interactive practice state
  const [practiceMode, setPracticeMode] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [strokeMisses, setStrokeMisses] = useState(0);
  const [hintFlash, setHintFlash] = useState(false);
  const [userPts, setUserPts] = useState<{ x: number; y: number }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
    setWordIdx(0);
    setPracticeMode(false);
    setAnimating(false);
    setAnimState(null);
  }, [word, defaultCollapsed]);

  const activeWord = words[wordIdx] || words[0] || '';
  const { strokes, viewWidth } = useMemo(() => layoutEnglishWord(activeWord), [activeWord]);

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimating(false);
  }, []);

  useEffect(() => {
    stopAnim();
    setAnimState(null);
    setPracticeMode(false);
    setCompletedCount(0);
    setMistakes(0);
    setStrokeMisses(0);
    setUserPts([]);
    return () => stopAnim();
  }, [activeWord, stopAnim]);

  const handleAnimate = useCallback(() => {
    stopAnim();
    setPracticeMode(false);
    setUserPts([]);
    if (strokes.length === 0) return;

    const lengths = strokes.map((_, i) => pathRefs.current[i]?.getTotalLength() || 40);
    const msPerUnit = speed === 0.5 ? 11.5 : 5.5;
    const gapMs = speed === 0.5 ? 160 : 85;
    const durations = lengths.map((len) => Math.max(150, len * msPerUnit));

    setAnimating(true);
    let idx = 0;
    let phaseStart = performance.now();
    let inGap = false;

    const tick = (now: number) => {
      if (idx >= strokes.length) {
        setAnimating(false);
        setAnimState(null);
        rafRef.current = null;
        return;
      }

      const elapsed = now - phaseStart;
      if (inGap) {
        if (elapsed >= gapMs) {
          inGap = false;
          idx++;
          phaseStart = now;
        }
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const dur = durations[idx];
      const rawT = Math.min(1, elapsed / dur);
      // Smooth ease-in-out curve for natural pen acceleration
      const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
      const el = pathRefs.current[idx];
      let nib: { x: number; y: number } | null = null;
      if (el) {
        const pt = el.getPointAtLength(lengths[idx] * eased);
        nib = { x: pt.x, y: pt.y };
      }

      setAnimState({ strokeIdx: idx, progress: eased, nib });

      if (rawT >= 1) {
        inGap = true;
        phaseStart = now;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [strokes, speed, stopAnim]);

  const handleStartPractice = () => {
    stopAnim();
    setAnimState(null);
    setPracticeMode(true);
    setCompletedCount(0);
    setMistakes(0);
    setStrokeMisses(0);
    setHintFlash(false);
    setUserPts([]);
  };

  const toSvgCoords = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  const evaluateUserStroke = (pts: { x: number; y: number }[]) => {
    const targetEl = pathRefs.current[completedCount];
    if (!targetEl || pts.length < 2) return;
    const totalLen = targetEl.getTotalLength();

    // Very short dot strokes (like 'i', 'j', '.', '!', '?')
    if (totalLen < 6) {
      const targetStart = targetEl.getPointAtLength(0);
      const minDist = Math.min(...pts.map((p) => Math.hypot(p.x - targetStart.x, p.y - targetStart.y)));
      if (minDist <= 18) {
        setCompletedCount((c) => c + 1);
        setStrokeMisses(0);
        setHintFlash(false);
        return;
      }
    } else {
      const startRef = targetEl.getPointAtLength(0);
      const endRef = targetEl.getPointAtLength(totalLen);
      const userStart = pts[0];
      const userEnd = pts[pts.length - 1];

      const startDist = Math.hypot(userStart.x - startRef.x, userStart.y - startRef.y);
      const endDist = Math.hypot(userEnd.x - endRef.x, userEnd.y - endRef.y);

      // Sample 10 points along the target stroke and check average proximity to user stroke
      let sumDist = 0;
      const samples = 10;
      for (let i = 0; i <= samples; i++) {
        const refPt = targetEl.getPointAtLength((totalLen * i) / samples);
        let best = Infinity;
        for (const u of pts) {
          const d = Math.hypot(u.x - refPt.x, u.y - refPt.y);
          if (d < best) best = d;
        }
        sumDist += best;
      }
      const avgDist = sumDist / (samples + 1);

      if (startDist <= 22 && endDist <= 24 && avgDist <= 15) {
        setCompletedCount((c) => c + 1);
        setStrokeMisses(0);
        setHintFlash(false);
        return;
      }
    }

    // Missed stroke
    setMistakes((m) => m + 1);
    setStrokeMisses((m) => {
      const next = m + 1;
      if (next >= 2) {
        setHintFlash(true);
        window.setTimeout(() => setHintFlash(false), 1200);
      }
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!practiceMode || completedCount >= strokes.length) return;
    const pt = toSvgCoords(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setUserPts([pt]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const pt = toSvgCoords(e);
    if (!pt) return;
    setUserPts((prev) => [...prev, pt]);
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    evaluateUserStroke(userPts);
    setUserPts([]);
  };

  if (strokes.length === 0) return null;

  const practiceDone = practiceMode && completedCount >= strokes.length;
  const activeStartPt =
    practiceMode && !practiceDone && pathRefs.current[completedCount]
      ? pathRefs.current[completedCount]!.getPointAtLength(0)
      : null;

  return (
    <div className="space-y-4 pt-2 border-t border-sanzar-border">
      {/* Header / Expandable Toggle */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted group-hover:text-sanzar-primary transition">
            Whole-Word Writing &amp; Stroke Studio
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-sanzar-muted" />
          ) : (
            <ChevronUp className="w-4 h-4 text-sanzar-muted" />
          )}
        </button>

        {!collapsed && (
          <span className="sanzar-pill text-[11px]">{strokes.length} strokes</span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Multi-word selector pills (for phrases like "Good morning!") */}
          {words.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, idx) => (
                <button
                  key={`${w}-${idx}`}
                  type="button"
                  onClick={() => setWordIdx(idx)}
                  className={`px-3 py-1 rounded-xl border text-xs font-bold transition ${
                    idx === wordIdx
                      ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                      : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          {/* Reference preview in Patrick Hand + Wide 4-Line Ruled Penmanship Strip */}
          <div className="flex items-center justify-between text-xs text-sanzar-muted px-0.5">
            <span>
              Handwriting style:{' '}
              <strong
                className="text-lg text-sanzar-text font-normal ml-1 tracking-wide"
                style={{ fontFamily: ENGLISH_HANDWRITING_FONT }}
              >
                {activeWord}
              </strong>
            </span>
          </div>
          <div className="rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-x-auto select-none">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewWidth} 100`}
              style={{
                width: '100%',
                minWidth: `${Math.min(540, Math.max(260, viewWidth * 1.45))}px`,
                height: '164px',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`block touch-none ${practiceMode && !practiceDone ? 'cursor-crosshair' : ''}`}
            >
              {/* 4-Line Ruled Primary Notebook Lines */}
              <line x1="0" y1="20" x2={viewWidth} y2="20" stroke="#0ea5e9" strokeOpacity="0.4" strokeWidth="0.65" />
              <line x1="0" y1="44" x2={viewWidth} y2="44" stroke="#10b981" strokeOpacity="0.45" strokeWidth="0.6" strokeDasharray="3.5 2.5" />
              <line x1="0" y1="74" x2={viewWidth} y2="74" stroke="#ef4444" strokeOpacity="0.45" strokeWidth="0.75" />
              <line x1="0" y1="92" x2={viewWidth} y2="92" stroke="#64748b" strokeOpacity="0.32" strokeWidth="0.6" />

              {/* Ghost Outline Layer */}
              {strokes.map((st, idx) => (
                <path
                  key={`ghost-${st.id}`}
                  ref={(el) => {
                    pathRefs.current[idx] = el;
                  }}
                  d={st.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    showOutline
                      ? 'text-emerald-950/[0.13] dark:text-white/[0.15]'
                      : 'text-transparent'
                  }
                />
              ))}

              {/* Unified Handwritten Ink Layer (Static / 60fps Flowing Animation / Practice Strokes) */}
              {strokes.map((st, idx) => {
                const len = pathRefs.current[idx]?.getTotalLength() || 100;

                if (animating && animState) {
                  if (idx > animState.strokeIdx) return null;
                  const dashOffset = idx === animState.strokeIdx ? len * (1 - animState.progress) : 0;
                  return (
                    <path
                      key={`anim-${st.id}`}
                      d={st.d}
                      fill="none"
                      stroke={idx === animState.strokeIdx ? '#19B46B' : 'currentColor'}
                      strokeWidth="4.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={len}
                      strokeDashoffset={dashOffset}
                      className="text-sanzar-text"
                    />
                  );
                }

                if (practiceMode) {
                  if (idx < completedCount) {
                    return (
                      <path
                        key={`done-${st.id}`}
                        d={st.d}
                        fill="none"
                        stroke="#19B46B"
                        strokeWidth="4.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  }
                  if (idx === completedCount && hintFlash) {
                    return (
                      <path
                        key={`hint-${st.id}`}
                        d={st.d}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="4.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="4 3"
                      />
                    );
                  }
                  return null;
                }

                return (
                  <path
                    key={`idle-${st.id}`}
                    d={st.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-sanzar-text"
                  />
                );
              })}

              {/* Glowing Pen-Tip Nib during 60fps Animation */}
              {animating && animState?.nib && (
                <g>
                  <circle cx={animState.nib.x} cy={animState.nib.y} r="5.5" fill="#19B46B" fillOpacity="0.28" />
                  <circle cx={animState.nib.x} cy={animState.nib.y} r="2.8" fill="#19B46B" />
                </g>
              )}

              {/* Practice Mode: Start-Point Guide Dot */}
              {activeStartPt && showOutline && (
                <g>
                  <circle cx={activeStartPt.x} cy={activeStartPt.y} r="5.2" fill="#19B46B" fillOpacity="0.25" />
                  <circle cx={activeStartPt.x} cy={activeStartPt.y} r="2.6" fill="#19B46B" />
                </g>
              )}

              {/* Practice Mode: Live User Drawing Trail */}
              {userPts.length > 1 && (
                <path
                  d={userPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  fill="none"
                  stroke="#6FC294"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.85"
                />
              )}
            </svg>
          </div>

          {/* Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAnimate}
                className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> {animating ? 'Replay word' : 'Animate word'}
              </button>
              <button
                type="button"
                onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
                title="Toggle animation speed"
                className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-bold inline-flex items-center gap-1 text-sanzar-text2"
              >
                <Gauge className="w-3.5 h-3.5" /> {speed}×
              </button>
              <button
                type="button"
                onClick={handleStartPractice}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition ${
                  practiceMode
                    ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                    : 'border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-sanzar-text'
                }`}
              >
                <PencilLine className="w-3.5 h-3.5" /> Practice writing
              </button>
              <button
                type="button"
                onClick={() => setShowOutline((v) => !v)}
                className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-1.5 text-sanzar-text2"
              >
                {showOutline ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showOutline ? 'Hide outline' : 'Show outline'}
              </button>
            </div>
          </div>

          {/* Live Practice Status Banner */}
          {practiceMode && (
            <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border text-xs flex items-center justify-between gap-2">
              {practiceDone ? (
                <span className="font-bold text-sanzar-primary inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed "{activeWord}"! ({mistakes === 0 ? 'Perfect — 0 mistakes' : `${mistakes} mistake(s)`})
                </span>
              ) : (
                <span className="text-sanzar-text2 font-medium">
                  Draw stroke <b>{completedCount + 1}</b> of <b>{strokes.length}</b>{' '}
                  <span className="text-sanzar-muted">(letter "{strokes[completedCount]?.char}")</span> — start at the green dot
                </span>
              )}
              <button
                type="button"
                onClick={handleStartPractice}
                className="text-sanzar-primary font-bold hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
