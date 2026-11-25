import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Eraser, Eye, EyeOff, Gauge, PencilLine, Play, RotateCcw } from 'lucide-react';
import { BANGLA_DEFAULT_FONT, BANGLA_PEN_PATHS } from './bangla-pen-paths';
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
  // 'word' = whole-word continuous animation/tracing; number = cluster index; string = base-letter drill
  const [focusTarget, setFocusTarget] = useState<'word' | number | string>('word');
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [showOutline, setShowOutline] = useState(true);

  // 60fps animation state (works for both whole-word sweep AND cubic-Bézier directional strokes)
  const [animating, setAnimating] = useState(false);
  const [sweepPct, setSweepPct] = useState(100);
  const [strokeAnim, setStrokeAnim] = useState<{
    idx: number;
    progress: number;
    nib: { x: number; y: number } | null;
  } | null>(null);

  // Snap-to-stroke practice state (for base letters with Bézier paths)
  const [snapPractice, setSnapPractice] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintFlash, setHintFlash] = useState(false);
  const [userPts, setUserPts] = useState<{ x: number; y: number }[]>([]);

  // Canvas pixel-accuracy state (for whole-word & complex Juktakkhor clusters)
  const [canvasScore, setCanvasScore] = useState<{ accuracy: number; coverage: number; done: boolean } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

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
  const bezierStrokes: string[] | null = useMemo(
    () => (focusTarget !== 'word' || clusters.length === 1 ? BANGLA_PEN_PATHS[activeText] || null : null),
    [focusTarget, clusters.length, activeText]
  );

  const isWholeWordCanvas = focusTarget === 'word' && !bezierStrokes;
  const padWidth = isWholeWordCanvas ? Math.min(520, Math.max(280, clusters.length * 68 + 60)) : 196;
  const padHeight = isWholeWordCanvas ? 164 : 196;

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimating(false);
  }, []);

  const clearCanvasInk = useCallback(() => {
    const c = drawCanvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx?.clearRect(0, 0, c.width, c.height);
    }
    setCanvasScore(null);
  }, []);

  // Reset & prepare offscreen mask when target changes
  useEffect(() => {
    stopAnim();
    setSweepPct(100);
    setStrokeAnim(null);
    setSnapPractice(false);
    setCompletedCount(0);
    setMistakes(0);
    setHintFlash(false);
    setUserPts([]);
    clearCanvasInk();

    if (!activeText || bezierStrokes || typeof document === 'undefined') return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = drawCanvasRef.current;
    if (c) {
      c.width = padWidth * dpr;
      c.height = padHeight * dpr;
      const ctx = c.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const fontPx = isWholeWordCanvas
      ? Math.max(58, Math.min(92, Math.floor((padWidth - 40) / Math.max(2, clusters.length * 0.72))))
      : Array.from(activeText).length > 2
        ? 92
        : 112;
    const baselineY = Math.round(padHeight * 0.73);

    const off = document.createElement('canvas');
    off.width = padWidth;
    off.height = padHeight;
    const octx = off.getContext('2d');
    if (octx) {
      octx.clearRect(0, 0, padWidth, padHeight);
      octx.font = `700 ${fontPx}px ${BANGLA_DEFAULT_FONT}`;
      octx.textAlign = 'center';
      octx.textBaseline = 'alphabetic';
      octx.fillStyle = 'rgb(255, 0, 0)';
      octx.fillText(activeText, padWidth / 2, baselineY);
      octx.lineJoin = 'round';
      octx.lineCap = 'round';
      octx.lineWidth = 22;
      octx.strokeStyle = 'rgba(0, 255, 0, 1)';
      octx.strokeText(activeText, padWidth / 2, baselineY);
      octx.fillText(activeText, padWidth / 2, baselineY);
    }
    maskCanvasRef.current = off;

    return () => stopAnim();
  }, [activeText, bezierStrokes, isWholeWordCanvas, padWidth, padHeight, clusters.length, clearCanvasInk, stopAnim]);

  const handleAnimate = useCallback(() => {
    stopAnim();
    clearCanvasInk();
    setSnapPractice(false);
    setUserPts([]);
    setShowOutline(true);
    setAnimating(true);

    if (bezierStrokes && bezierStrokes.length > 0) {
      const lengths = bezierStrokes.map((_, i) => pathRefs.current[i]?.getTotalLength() || 50);
      const msPerUnit = speed === 0.5 ? 12 : 6;
      const gapMs = speed === 0.5 ? 180 : 95;
      const durations = lengths.map((l) => Math.max(180, l * msPerUnit));
      let idx = 0;
      let startTs = performance.now();
      let inGap = false;

      const tick = (now: number) => {
        if (idx >= bezierStrokes.length) {
          setAnimating(false);
          setStrokeAnim(null);
          rafRef.current = null;
          return;
        }
        const elapsed = now - startTs;
        if (inGap) {
          if (elapsed >= gapMs) {
            inGap = false;
            idx++;
            startTs = now;
          }
          rafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        const rawT = Math.min(1, elapsed / durations[idx]);
        const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
        const el = pathRefs.current[idx];
        let nib: { x: number; y: number } | null = null;
        if (el) {
          const pt = el.getPointAtLength(lengths[idx] * eased);
          nib = { x: pt.x, y: pt.y };
        }
        setStrokeAnim({ idx, progress: eased, nib });
        if (rawT >= 1) {
          inGap = true;
          startTs = now;
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
      return;
    }

    // 60fps smooth left-to-right flowing ink reveal for whole Bangla words & Juktakkhor
    const totalDur = (isWholeWordCanvas ? Math.max(1100, clusters.length * 420) : 950) * (speed === 0.5 ? 1.85 : 1);
    const startTs = performance.now();
    setSweepPct(0);

    const tick = (now: number) => {
      const rawT = Math.min(1, (now - startTs) / totalDur);
      const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
      setSweepPct(eased * 100);
      if (rawT >= 1) {
        setAnimating(false);
        rafRef.current = null;
      } else {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [bezierStrokes, clusters.length, isWholeWordCanvas, speed, stopAnim, clearCanvasInk]);

  // --- Snap-to-stroke SVG pointer handlers (when bezierStrokes exist) ---
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

  const evalSnapStroke = (pts: { x: number; y: number }[]) => {
    const targetEl = pathRefs.current[completedCount];
    if (!targetEl || pts.length < 2) return;
    const totalLen = targetEl.getTotalLength();
    const startRef = targetEl.getPointAtLength(0);
    const endRef = targetEl.getPointAtLength(totalLen);
    const startDist = Math.hypot(pts[0].x - startRef.x, pts[0].y - startRef.y);
    const endDist = Math.hypot(pts[pts.length - 1].x - endRef.x, pts[pts.length - 1].y - endRef.y);

    let sumDist = 0;
    for (let i = 0; i <= 10; i++) {
      const refPt = targetEl.getPointAtLength((totalLen * i) / 10);
      let best = Infinity;
      for (const u of pts) {
        const d = Math.hypot(u.x - refPt.x, u.y - refPt.y);
        if (d < best) best = d;
      }
      sumDist += best;
    }
    const avgDist = sumDist / 11;

    if (totalLen < 6 ? Math.min(startDist, endDist) <= 20 : startDist <= 24 && endDist <= 26 && avgDist <= 18) {
      setCompletedCount((c) => c + 1);
      setHintFlash(false);
    } else {
      setMistakes((m) => m + 1);
      setHintFlash(true);
      window.setTimeout(() => setHintFlash(false), 1100);
    }
  };

  // --- Canvas pointer handlers (whole-word & Juktakkhor tracing) ---
  const computeCanvasAccuracy = useCallback(() => {
    const drawC = drawCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!drawC || !maskC) return;
    const sample = document.createElement('canvas');
    sample.width = padWidth;
    sample.height = padHeight;
    const sctx = sample.getContext('2d');
    const mctx = maskC.getContext('2d');
    if (!sctx || !mctx) return;

    sctx.drawImage(drawC, 0, 0, padWidth, padHeight);
    const uPx = sctx.getImageData(0, 0, padWidth, padHeight).data;
    const mPx = mctx.getImageData(0, 0, padWidth, padHeight).data;

    let coreTotal = 0;
    let coreCovered = 0;
    let userTotal = 0;
    let userInBounds = 0;
    for (let i = 0; i < mPx.length; i += 4) {
      const isCore = mPx[i] > 80;
      const isTol = mPx[i + 1] > 60 || isCore;
      const isDrawn = uPx[i + 3] > 50;
      if (isCore) {
        coreTotal++;
        if (isDrawn) coreCovered++;
      }
      if (isDrawn) {
        userTotal++;
        if (isTol) userInBounds++;
      }
    }
    if (userTotal < 12 || coreTotal === 0) return;
    const coverage = Math.min(100, Math.round((coreCovered / coreTotal) * 118));
    const precision = Math.min(100, Math.round((userInBounds / userTotal) * 100));
    const accuracy = Math.round(coverage * 0.55 + precision * 0.45);
    setCanvasScore({ accuracy, coverage, done: coverage >= 56 && accuracy >= 60 });
  }, [padWidth, padHeight]);

  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (animating) {
      stopAnim();
      setSweepPct(100);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = {
      x: ((e.clientX - rect.left) / rect.width) * padWidth,
      y: ((e.clientY - rect.top) / rect.height) * padHeight,
    };
    lastPtRef.current = pt;
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (ctx) {
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#6FC294' : '#176B4B';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const onCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPtRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = {
      x: ((e.clientX - rect.left) / rect.width) * padWidth,
      y: ((e.clientY - rect.top) / rect.height) * padHeight,
    };
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (ctx) {
      const isDark = document.documentElement.classList.contains('dark');
      ctx.strokeStyle = isDark ? '#6FC294' : '#176B4B';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    lastPtRef.current = pt;
  };

  const onCanvasUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    computeCanvasAccuracy();
  };

  if (words.length === 0) return null;

  const snapDone = Boolean(bezierStrokes && snapPractice && completedCount >= bezierStrokes.length);
  const activeSnapStart =
    bezierStrokes && snapPractice && !snapDone && pathRefs.current[completedCount]
      ? pathRefs.current[completedCount]!.getPointAtLength(0)
      : null;

  return (
    <div className="space-y-4 pt-2 border-t border-sanzar-border">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted group-hover:text-sanzar-primary transition">
            বাংলা লেখার অনুশীলন · Bangla Writing Studio (Kalpurush)
          </span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-sanzar-muted" /> : <ChevronUp className="w-4 h-4 text-sanzar-muted" />}
        </button>
        {!collapsed && (
          <span className="sanzar-pill text-[11px]">
            {matraInfo.bnLabel} · {matraInfo.label}
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Multi-word pills if phrase */}
          {words.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, idx) => (
                <button
                  key={`${w}-${idx}`}
                  type="button"
                  onClick={() => {
                    setWordIdx(idx);
                    setFocusTarget('word');
                  }}
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

          {/* Whole Word vs Cluster Focus Selector */}
          {clusters.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFocusTarget('word')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                  focusTarget === 'word'
                    ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary shadow-sm'
                    : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                }`}
              >
                পুরো শব্দ ({activeWord})
              </button>
              {clusters.map((cl, idx) => (
                <button
                  key={`${cl}-${idx}`}
                  type="button"
                  onClick={() => setFocusTarget(idx)}
                  className={`px-3 py-1.5 rounded-xl border text-base font-extrabold transition ${
                    focusTarget === idx
                      ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary shadow-sm'
                      : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text hover:bg-sanzar-surface2'
                  }`}
                >
                  {cl}
                </button>
              ))}
            </div>
          )}

          {/* Juktakkhor & Kar Breakdown */}
          {constituents.length > 1 && (
            <div className="p-3 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-sanzar-muted mr-1">গঠন (Breakdown):</span>
                {constituents.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-sanzar-muted font-bold">+</span>}
                    {part.isBaseLetter ? (
                      <button
                        type="button"
                        onClick={() => setFocusTarget(focusTarget === part.symbol ? 'word' : part.symbol)}
                        title={`Practice base letter "${part.symbol}"`}
                        className={`px-2 py-0.5 rounded-lg border font-bold transition ${
                          focusTarget === part.symbol
                            ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                            : 'bg-sanzar-surface border-sanzar-border hover:border-sanzar-primary/50 text-sanzar-text'
                        }`}
                      >
                        {part.symbol}
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-semibold">
                        {part.symbol} <small className="opacity-80">({part.label})</small>
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              {typeof focusTarget === 'string' && focusTarget !== 'word' && (
                <button
                  type="button"
                  onClick={() => setFocusTarget('word')}
                  className="text-[11px] font-bold text-sanzar-primary hover:underline"
                >
                  ← পুরো শব্দ ({activeWord})
                </button>
              )}
            </div>
          )}

          {/* MODE A: Smooth 60fps Cubic-Bézier Base-Letter Studio (Snap-to-Stroke!) */}
          {bezierStrokes ? (
            <div className="grid sm:grid-cols-[204px_1fr] gap-4 items-start">
              <div className="w-[196px] h-[196px] mx-auto sm:mx-0 rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-hidden select-none">
                <svg
                  ref={svgRef}
                  viewBox="0 0 100 100"
                  onPointerDown={(e) => {
                    if (!snapPractice || snapDone) return;
                    const pt = toSvgCoords(e);
                    if (!pt) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drawingRef.current = true;
                    setUserPts([pt]);
                  }}
                  onPointerMove={(e) => {
                    if (!drawingRef.current) return;
                    const pt = toSvgCoords(e);
                    if (pt) setUserPts((p) => [...p, pt]);
                  }}
                  onPointerUp={() => {
                    if (!drawingRef.current) return;
                    drawingRef.current = false;
                    evalSnapStroke(userPts);
                    setUserPts([]);
                  }}
                  onPointerCancel={() => {
                    drawingRef.current = false;
                    setUserPts([]);
                  }}
                  className={`w-full h-full touch-none ${snapPractice && !snapDone ? 'cursor-crosshair' : ''}`}
                >
                  {/* Bangla Matra Guide Lines */}
                  <line
                    x1={matraInfo.type === 'half' ? '52' : '8'}
                    y1="26"
                    x2="92"
                    y2="26"
                    stroke="#19B46B"
                    strokeOpacity={matraInfo.type === 'none' ? '0.2' : '0.65'}
                    strokeWidth={matraInfo.type === 'none' ? '0.6' : '1.4'}
                    strokeDasharray={matraInfo.type === 'none' ? '2 2' : undefined}
                  />
                  <line x1="8" y1="76" x2="92" y2="76" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.7" />

                  {/* Ghost outline */}
                  {bezierStrokes.map((d, idx) => (
                    <path
                      key={`g-${idx}`}
                      ref={(el) => {
                        pathRefs.current[idx] = el;
                      }}
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={showOutline ? 'text-emerald-950/[0.14] dark:text-white/[0.15]' : 'text-transparent'}
                    />
                  ))}

                  {/* Animated / Completed / Idle Ink */}
                  {bezierStrokes.map((d, idx) => {
                    const len = pathRefs.current[idx]?.getTotalLength() || 100;
                    if (animating && strokeAnim) {
                      if (idx > strokeAnim.idx) return null;
                      const dashOffset = idx === strokeAnim.idx ? len * (1 - strokeAnim.progress) : 0;
                      return (
                        <path
                          key={`a-${idx}`}
                          d={d}
                          fill="none"
                          stroke={idx === strokeAnim.idx ? '#19B46B' : 'currentColor'}
                          strokeWidth="5.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={len}
                          strokeDashoffset={dashOffset}
                          className="text-sanzar-text"
                        />
                      );
                    }
                    if (snapPractice) {
                      if (idx < completedCount) {
                        return (
                          <path
                            key={`d-${idx}`}
                            d={d}
                            fill="none"
                            stroke="#19B46B"
                            strokeWidth="5.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      }
                      if (idx === completedCount && hintFlash) {
                        return (
                          <path
                            key={`h-${idx}`}
                            d={d}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="5.4"
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
                        key={`i-${idx}`}
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-sanzar-text"
                      />
                    );
                  })}

                  {/* Glowing Pen Nib */}
                  {animating && strokeAnim?.nib && (
                    <g>
                      <circle cx={strokeAnim.nib.x} cy={strokeAnim.nib.y} r="6" fill="#19B46B" fillOpacity="0.28" />
                      <circle cx={strokeAnim.nib.x} cy={strokeAnim.nib.y} r="3" fill="#19B46B" />
                    </g>
                  )}

                  {/* Practice Start Dot */}
                  {activeSnapStart && showOutline && (
                    <g>
                      <circle cx={activeSnapStart.x} cy={activeSnapStart.y} r="5.5" fill="#19B46B" fillOpacity="0.26" />
                      <circle cx={activeSnapStart.x} cy={activeSnapStart.y} r="2.8" fill="#19B46B" />
                    </g>
                  )}

                  {/* Live User Trail */}
                  {userPts.length > 1 && (
                    <path
                      d={userPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                      fill="none"
                      stroke="#6FC294"
                      strokeWidth="5.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnimate}
                    className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" /> Animate
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
                    className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-bold inline-flex items-center gap-1 text-sanzar-text2"
                  >
                    <Gauge className="w-3.5 h-3.5" /> {speed}×
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopAnim();
                      setStrokeAnim(null);
                      setSnapPractice(true);
                      setCompletedCount(0);
                      setMistakes(0);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition ${
                      snapPractice
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

                {snapPractice && (
                  <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border text-xs flex items-center justify-between gap-2">
                    {snapDone ? (
                      <span className="font-bold text-sanzar-primary inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Completed "{activeText}"! ({mistakes === 0 ? 'Perfect — 0 mistakes' : `${mistakes} mistake(s)`})
                      </span>
                    ) : (
                      <span className="text-sanzar-text2 font-medium">
                        Draw stroke <b>{completedCount + 1}</b> of <b>{bezierStrokes.length}</b> — start at the green dot
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCompletedCount(0);
                        setMistakes(0);
                      }}
                      className="text-sanzar-primary font-bold hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* MODE B: Wide Whole-Word & Juktakkhor Matra Strip (Kalpurush 60fps Ink Sweep + Accuracy Tracing) */
            <div className="space-y-3">
              <div className="rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-x-auto select-none flex justify-center">
                <div style={{ width: padWidth, height: padHeight }} className="relative shrink-0 touch-none">
                  <svg
                    aria-hidden="true"
                    viewBox={`0 0 ${padWidth} ${padHeight}`}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {/* Connected Matra Line + Baseline */}
                    <line
                      x1="14"
                      y1={Math.round(padHeight * 0.27)}
                      x2={padWidth - 14}
                      y2={Math.round(padHeight * 0.27)}
                      stroke="#19B46B"
                      strokeOpacity="0.6"
                      strokeWidth="1.8"
                    />
                    <line
                      x1="14"
                      y1={Math.round(padHeight * 0.73)}
                      x2={padWidth - 14}
                      y2={Math.round(padHeight * 0.73)}
                      stroke="currentColor"
                      strokeOpacity="0.18"
                      strokeWidth="1"
                    />

                    {/* Ghost Kalpurush Outline */}
                    {showOutline && (
                      <text
                        x={padWidth / 2}
                        y={Math.round(padHeight * 0.73)}
                        textAnchor="middle"
                        fontSize={
                          isWholeWordCanvas
                            ? Math.max(58, Math.min(92, Math.floor((padWidth - 40) / Math.max(2, clusters.length * 0.72))))
                            : Array.from(activeText).length > 2
                              ? 92
                              : 112
                        }
                        fontWeight="700"
                        fontFamily={BANGLA_DEFAULT_FONT}
                        fill="currentColor"
                        className="text-emerald-950/[0.15] dark:text-white/[0.16]"
                      >
                        {activeText}
                      </text>
                    )}

                    {/* 60fps Flowing Ink Reveal during Animation */}
                    {animating && (
                      <g style={{ clipPath: `inset(0 ${100 - sweepPct}% 0 0)` }}>
                        <text
                          x={padWidth / 2}
                          y={Math.round(padHeight * 0.73)}
                          textAnchor="middle"
                          fontSize={
                            isWholeWordCanvas
                              ? Math.max(58, Math.min(92, Math.floor((padWidth - 40) / Math.max(2, clusters.length * 0.72))))
                              : Array.from(activeText).length > 2
                                ? 92
                                : 112
                          }
                          fontWeight="700"
                          fontFamily={BANGLA_DEFAULT_FONT}
                          fill="#19B46B"
                        >
                          {activeText}
                        </text>
                      </g>
                    )}
                  </svg>

                  <canvas
                    ref={drawCanvasRef}
                    onPointerDown={onCanvasDown}
                    onPointerMove={onCanvasMove}
                    onPointerUp={onCanvasUp}
                    onPointerCancel={onCanvasUp}
                    style={{ width: padWidth, height: padHeight }}
                    className="relative z-10 block cursor-crosshair touch-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnimate}
                  className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> {isWholeWordCanvas ? 'Animate word' : 'Animate'}
                </button>
                <button
                  type="button"
                  onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
                  className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-bold inline-flex items-center gap-1 text-sanzar-text2"
                >
                  <Gauge className="w-3.5 h-3.5" /> {speed}×
                </button>
                <button
                  type="button"
                  onClick={clearCanvasInk}
                  className="px-3.5 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-1.5 text-sanzar-text"
                >
                  <Eraser className="w-3.5 h-3.5" /> Clear pad
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

              {canvasScore && (
                <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`font-bold inline-flex items-center gap-1.5 ${canvasScore.done ? 'text-sanzar-primary' : 'text-sanzar-text2'}`}>
                      {canvasScore.done && <CheckCircle2 className="w-4 h-4" />}
                      {canvasScore.done ? `Great job! ${canvasScore.accuracy}% accuracy` : `Tracing… ${canvasScore.coverage}% covered`}
                    </span>
                    <span className="text-[11px] font-bold text-sanzar-muted">{canvasScore.accuracy}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, canvasScore.coverage)}%` }}
                      className="h-full bg-sanzar-primary transition-all duration-200"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
