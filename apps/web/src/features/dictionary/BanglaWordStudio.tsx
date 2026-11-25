import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Gauge,
  PencilLine,
  Play,
  RotateCcw,
} from 'lucide-react';
import { BANGLA_DEFAULT_FONT, buildBanglaPenLayout } from './bangla-pen-paths';
import { decomposeBanglaCluster, getBanglaMatraInfo, splitIntoGraphemeClusters } from './stroke-guides';

interface Props {
  word: string;
  defaultCollapsed?: boolean;
}

export const BanglaWordStudio: React.FC<Props> = ({ word, defaultCollapsed = false }) => {
  const words = useMemo(
    () => word.trim().split(/\s+/).filter((w) => /[\u0980-\u09ff]/.test(w)).slice(0, 6),
    [word]
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [wordIdx, setWordIdx] = useState(0);
  // 'word' = whole-word pen animation/practice; number = cluster index; string = base-letter drill
  const [focusTarget, setFocusTarget] = useState<'word' | number | string>('word');
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [showOutline, setShowOutline] = useState(true);

  // 60fps pen-tip animation state (matches EnglishWordStudio)
  const [animating, setAnimating] = useState(false);
  const [animIdx, setAnimIdx] = useState<number>(-1);
  const [animProgress, setAnimProgress] = useState(0);
  const [penTip, setPenTip] = useState<{ x: number; y: number } | null>(null);

  // Interactive Snap-to-Stroke practice state
  const [practiceMode, setPracticeMode] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintFlash, setHintFlash] = useState(false);
  const [userPts, setUserPts] = useState<{ x: number; y: number }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
    setWordIdx(0);
    setFocusTarget('word');
  }, [word, defaultCollapsed]);

  const activeWord = words[wordIdx] || words[0] || '';
  const clusters = useMemo(() => splitIntoGraphemeClusters(activeWord, 'bn'), [activeWord]);

  const activeText = useMemo(() => {
    if (focusTarget === 'word') return activeWord;
    if (typeof focusTarget === 'number') return clusters[focusTarget] || activeWord;
    return focusTarget;
  }, [focusTarget, activeWord, clusters]);

  const selectedCluster =
    typeof focusTarget === 'number'
      ? clusters[focusTarget] || ''
      : focusTarget === 'word' && clusters.length === 1
        ? clusters[0]
        : '';

  const constituents = useMemo(
    () => (selectedCluster ? decomposeBanglaCluster(selectedCluster) : []),
    [selectedCluster]
  );

  const matraInfo = useMemo(() => getBanglaMatraInfo(activeText), [activeText]);
  const layout = useMemo(() => buildBanglaPenLayout(activeText), [activeText]);
  const totalStrokes = layout.strokes.length;

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimating(false);
  }, []);

  // Reset when target text changes
  useEffect(() => {
    stopAnim();
    setAnimIdx(-1);
    setAnimProgress(0);
    setPenTip(null);
    setPracticeMode(false);
    setCompletedCount(0);
    setMistakes(0);
    setHintFlash(false);
    setUserPts([]);
  }, [activeText, stopAnim]);

  useEffect(() => stopAnim, [stopAnim]);

  // 60fps Pen-Tip Whole-Word / Cluster Animation
  const playAnimation = useCallback(() => {
    if (totalStrokes === 0) return;
    stopAnim();
    setPracticeMode(false);
    setAnimating(true);

    let sIdx = 0;
    let startTs: number | null = null;
    const baseMsPerUnit = speed === 0.5 ? 6.5 : 3.2;

    const tick = (now: number) => {
      const pathEl = pathRefs.current[sIdx];
      const len = pathEl ? Math.max(18, pathEl.getTotalLength()) : 50;
      const dur = Math.max(150, Math.min(720, len * baseMsPerUnit));

      if (startTs === null) startTs = now;
      const raw = Math.min(1, (now - startTs) / dur);
      // Smooth easeInOutSine
      const eased = -(Math.cos(Math.PI * raw) - 1) / 2;

      setAnimIdx(sIdx);
      setAnimProgress(eased);

      if (pathEl) {
        const pt = pathEl.getPointAtLength(len * eased);
        setPenTip({ x: pt.x, y: pt.y });
      }

      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        sIdx++;
        if (sIdx < totalStrokes) {
          startTs = null;
          rafRef.current = window.requestAnimationFrame(tick);
        } else {
          setAnimating(false);
          setAnimIdx(totalStrokes);
          setAnimProgress(1);
          setPenTip(null);
        }
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [totalStrokes, speed, stopAnim]);

  const startPractice = () => {
    stopAnim();
    setAnimIdx(-1);
    setPenTip(null);
    setPracticeMode(true);
    setCompletedCount(0);
    setMistakes(0);
    setHintFlash(false);
    setUserPts([]);
  };

  const toSvgPoint = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * layout.totalWidth,
      y: ((e.clientY - rect.top) / rect.height) * layout.viewBoxHeight,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!practiceMode || completedCount >= totalStrokes) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setUserPts([toSvgPoint(e)]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const pt = toSvgPoint(e);
    setUserPts((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.8) return prev;
      return [...prev, pt];
    });
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const targetPath = pathRefs.current[completedCount];
    if (!targetPath || userPts.length < 2) {
      setUserPts([]);
      return;
    }

    const totalLen = targetPath.getTotalLength();
    const startPt = targetPath.getPointAtLength(0);
    const endPt = targetPath.getPointAtLength(totalLen);
    const uStart = userPts[0];
    const uEnd = userPts[userPts.length - 1];

    const startDist = Math.hypot(uStart.x - startPt.x, uStart.y - startPt.y);
    const endDist = Math.hypot(uEnd.x - endPt.x, uEnd.y - endPt.y);

    // Sample midpoint distance along target path
    let avgDist = 0;
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const tp = targetPath.getPointAtLength((totalLen * i) / (samples - 1));
      let minD = Infinity;
      for (const up of userPts) {
        const d = Math.hypot(up.x - tp.x, up.y - tp.y);
        if (d < minD) minD = d;
      }
      avgDist += minD;
    }
    avgDist /= samples;

    const ok = startDist < 28 && endDist < 32 && avgDist < 24;
    if (ok) {
      setCompletedCount((c) => c + 1);
      setHintFlash(false);
    } else {
      setMistakes((m) => m + 1);
      setHintFlash(true);
    }
    setUserPts([]);
  };

  if (words.length === 0) return null;

  const isDone = practiceMode && completedCount >= totalStrokes && totalStrokes > 0;

  return (
    <div className="rounded-2xl border border-sanzar-border/70 bg-sanzar-surface/40 p-3.5 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-sanzar-primary">
            বাংলা লেখা অনুশীলন • Bangla Pen Studio
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sanzar-primary/10 text-sanzar-primary font-semibold">
            {totalStrokes} strokes
          </span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-sanzar-muted" /> : <ChevronUp className="w-4 h-4 text-sanzar-muted" />}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
              style={{ fontFamily: BANGLA_DEFAULT_FONT }}
            >
              {matraInfo.bnLabel} ({matraInfo.label})
            </span>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Multi-word selector if input has multiple Bangla words */}
          {words.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, i) => (
                <button
                  key={`${w}-${i}`}
                  type="button"
                  onClick={() => {
                    setWordIdx(i);
                    setFocusTarget('word');
                  }}
                  style={{ fontFamily: BANGLA_DEFAULT_FONT }}
                  className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition ${
                    i === wordIdx
                      ? 'bg-sanzar-primary text-white shadow-sm'
                      : 'bg-sanzar-card border border-sanzar-border text-sanzar-ink hover:border-sanzar-primary/50'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          {/* Whole-word vs Grapheme Cluster tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFocusTarget('word')}
              style={{ fontFamily: BANGLA_DEFAULT_FONT }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                focusTarget === 'word'
                  ? 'bg-sanzar-primary text-white'
                  : 'bg-sanzar-card border border-sanzar-border text-sanzar-muted hover:text-sanzar-ink'
              }`}
            >
              পুরো শব্দ ({activeWord})
            </button>
            {clusters.length > 1 &&
              clusters.map((cl, idx) => (
                <button
                  key={`${cl}-${idx}`}
                  type="button"
                  onClick={() => setFocusTarget(idx)}
                  style={{ fontFamily: BANGLA_DEFAULT_FONT }}
                  className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition ${
                    focusTarget === idx
                      ? 'bg-sanzar-primary text-white'
                      : 'bg-sanzar-card border border-sanzar-border text-sanzar-ink hover:border-sanzar-primary/50'
                  }`}
                >
                  {cl}
                </button>
              ))}
          </div>

          {/* Juktakkhor / Kar breakdown pills when focusing a multi-part cluster */}
          {constituents.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-sanzar-muted font-medium">গঠন:</span>
              {constituents.map((part, idx) => (
                <React.Fragment key={`${part.symbol}-${idx}`}>
                  {idx > 0 && <span className="text-sanzar-muted">+</span>}
                  <button
                    type="button"
                    onClick={() => part.isBaseLetter && setFocusTarget(part.symbol)}
                    style={{ fontFamily: BANGLA_DEFAULT_FONT }}
                    className={`px-2 py-0.5 rounded-md border text-xs font-semibold transition ${
                      focusTarget === part.symbol
                        ? 'bg-sanzar-primary text-white border-sanzar-primary'
                        : 'bg-sanzar-card border-sanzar-border text-sanzar-ink hover:border-sanzar-primary/50'
                    }`}
                  >
                    {part.symbol}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Kalpurush Reference Preview + 60fps Pen-Tip SVG Stage */}
          <div className="rounded-xl border border-sanzar-border bg-white dark:bg-slate-950/80 p-3 space-y-2">
            {/* Reference text in Kalpurush */}
            <div className="flex items-center justify-between text-xs text-sanzar-muted">
              <span>
                Reference (Kalpurush):{' '}
                <strong
                  className="text-base text-sanzar-ink font-semibold ml-1"
                  style={{ fontFamily: BANGLA_DEFAULT_FONT }}
                >
                  {activeText}
                </strong>
              </span>
              {practiceMode && (
                <span className="font-semibold text-sanzar-primary">
                  Stroke {Math.min(completedCount + 1, totalStrokes)} / {totalStrokes}
                  {mistakes > 0 ? ` • ${mistakes} retry` : ''}
                </span>
              )}
            </div>

            {/* Interactive SVG Pen Canvas */}
            <div className="w-full overflow-x-auto">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${layout.totalWidth} ${layout.viewBoxHeight}`}
                className={`w-full max-h-[190px] min-h-[130px] select-none touch-none ${
                  practiceMode ? 'cursor-crosshair' : ''
                }`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Bangla Matra headline + baseline guides */}
                <line
                  x1={8}
                  y1={26}
                  x2={layout.totalWidth - 8}
                  y2={26}
                  stroke="currentColor"
                  className="text-emerald-500/35"
                  strokeWidth={1.2}
                  strokeDasharray="4 4"
                />
                <line
                  x1={8}
                  y1={76}
                  x2={layout.totalWidth - 8}
                  y2={76}
                  stroke="currentColor"
                  className="text-slate-300 dark:text-slate-700"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <line
                  x1={8}
                  y1={96}
                  x2={layout.totalWidth - 8}
                  y2={96}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth={0.8}
                />

                {/* Faint guide outline */}
                {showOutline &&
                  layout.strokes.map((st, idx) => (
                    <path
                      key={`bg-${idx}`}
                      d={st.d}
                      fill="none"
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeWidth={4.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}

                {/* Active strokes (animated or practiced) */}
                {layout.strokes.map((st, idx) => {
                  const pathEl = pathRefs.current[idx];
                  const len = pathEl ? Math.max(1, pathEl.getTotalLength()) : 200;

                  let dashOffset = 0;
                  let visible = true;
                  let strokeClass = 'text-slate-800 dark:text-slate-100';

                  if (practiceMode) {
                    if (idx < completedCount) {
                      visible = true;
                      dashOffset = 0;
                      strokeClass = 'text-emerald-600 dark:text-emerald-400';
                    } else if (idx === completedCount && hintFlash) {
                      visible = true;
                      dashOffset = 0;
                      strokeClass = 'text-amber-500/80 animate-pulse';
                    } else {
                      visible = false;
                    }
                  } else if (animating || animIdx >= 0) {
                    if (idx < animIdx) {
                      visible = true;
                      dashOffset = 0;
                      strokeClass = 'text-emerald-700 dark:text-emerald-400';
                    } else if (idx === animIdx) {
                      visible = true;
                      dashOffset = len * (1 - animProgress);
                      strokeClass = 'text-emerald-600 dark:text-emerald-300';
                    } else {
                      visible = false;
                    }
                  }

                  return (
                    <path
                      key={`fg-${idx}`}
                      ref={(el) => {
                        pathRefs.current[idx] = el;
                      }}
                      d={st.d}
                      fill="none"
                      stroke="currentColor"
                      className={strokeClass}
                      strokeWidth={4.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={len}
                      strokeDashoffset={visible ? dashOffset : len}
                      style={{ opacity: visible ? 1 : 0 }}
                    />
                  );
                })}

                {/* Practice mode: starting dot on current stroke */}
                {practiceMode &&
                  completedCount < totalStrokes &&
                  (() => {
                    const p = pathRefs.current[completedCount];
                    if (!p) return null;
                    const pt = p.getPointAtLength(0);
                    return (
                      <g>
                        <circle cx={pt.x} cy={pt.y} r={6.5} className="fill-emerald-500/25 animate-ping" />
                        <circle cx={pt.x} cy={pt.y} r={3.6} className="fill-emerald-600 dark:fill-emerald-400" />
                      </g>
                    );
                  })()}

                {/* User live ink while tracing */}
                {userPts.length > 1 && (
                  <polyline
                    points={userPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                    fill="none"
                    stroke="currentColor"
                    className="text-sky-500"
                    strokeWidth={4.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Glowing animated pen-tip nib (English-style) */}
                {animating && penTip && (
                  <g>
                    <circle cx={penTip.x} cy={penTip.y} r={7.5} className="fill-emerald-500/25" />
                    <circle cx={penTip.x} cy={penTip.y} r={3.8} className="fill-emerald-600 dark:fill-emerald-400" />
                  </g>
                )}
              </svg>
            </div>

            {isDone && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                অসাধারণ! Word completed ({totalStrokes} strokes)
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={playAnimation}
              disabled={totalStrokes === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sanzar-primary text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50 transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {animating ? 'Playing…' : 'Animate'}
            </button>

            <button
              type="button"
              onClick={practiceMode ? () => setPracticeMode(false) : startPractice}
              disabled={totalStrokes === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                practiceMode
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-sanzar-card border-sanzar-border text-sanzar-ink hover:border-sanzar-primary/50'
              }`}
            >
              <PencilLine className="w-3.5 h-3.5" />
              {practiceMode ? 'Exit Practice' : 'Practice'}
            </button>

            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sanzar-card border border-sanzar-border text-xs font-semibold text-sanzar-ink hover:border-sanzar-primary/50 transition"
            >
              <Gauge className="w-3.5 h-3.5 text-sanzar-primary" />
              {speed}×
            </button>

            <button
              type="button"
              onClick={() => setShowOutline((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sanzar-card border border-sanzar-border text-xs font-semibold text-sanzar-ink hover:border-sanzar-primary/50 transition"
            >
              {showOutline ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Guide
            </button>

            {practiceMode && (
              <button
                type="button"
                onClick={startPractice}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sanzar-card border border-sanzar-border text-xs font-semibold text-sanzar-muted hover:text-sanzar-ink transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
