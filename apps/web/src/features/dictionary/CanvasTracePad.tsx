import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Eraser, Eye, EyeOff, PencilLine, Play } from 'lucide-react';
import {
  BANGLA_STROKES,
  LATIN_STROKES,
  decomposeBanglaCluster,
  getBanglaMatraInfo,
  splitIntoGraphemeClusters,
  type StrokePath,
} from './stroke-guides';

const PAD_SIZE = 188;

function pointsToSvgPath(pts: StrokePath): string {
  if (pts.length === 0) return '';
  return pts.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

interface Props {
  word: string;
  lang: 'bn' | 'en';
  defaultCollapsed?: boolean;
}

export const CanvasTracePad: React.FC<Props> = ({ word, lang, defaultCollapsed = false }) => {
  const clusters = useMemo(() => splitIntoGraphemeClusters(word, lang), [word, lang]);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [activeIdx, setActiveIdx] = useState(0);
  const [drillChar, setDrillChar] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState<number>(999);
  const [sweepPct, setSweepPct] = useState<number>(100);
  const [score, setScore] = useState<{ accuracy: number; coverage: number; done: boolean } | null>(null);

  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const animTimersRef = useRef<number[]>([]);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
    setActiveIdx(0);
    setDrillChar(null);
  }, [word, defaultCollapsed]);

  const primaryCluster = clusters[activeIdx] || clusters[0] || '';
  const activeGlyph = drillChar || primaryCluster;

  const constituents = useMemo(
    () => (lang === 'bn' ? decomposeBanglaCluster(primaryCluster) : []),
    [lang, primaryCluster]
  );

  const matraInfo = useMemo(
    () => (lang === 'bn' ? getBanglaMatraInfo(activeGlyph) : null),
    [lang, activeGlyph]
  );

  const vectorStrokes: StrokePath[] | null = useMemo(() => {
    if (lang === 'en') return LATIN_STROKES[activeGlyph] || null;
    return BANGLA_STROKES[activeGlyph] || null;
  }, [lang, activeGlyph]);

  const fontSpec = useMemo(() => {
    const len = Array.from(activeGlyph).length;
    const px = lang === 'bn' ? (len > 2 ? 96 : 114) : 118;
    const family =
      lang === 'bn'
        ? '"Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif'
        : '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    return `700 ${px}px ${family}`;
  }, [activeGlyph, lang]);

  const clearTimers = () => {
    animTimersRef.current.forEach((id) => window.clearTimeout(id));
    animTimersRef.current = [];
  };

  const clearUserInk = useCallback(() => {
    const c = drawCanvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx?.clearRect(0, 0, c.width, c.height);
    }
    setScore(null);
  }, []);

  // Build offscreen target mask + reset drawing canvas when active glyph changes
  useEffect(() => {
    clearTimers();
    setAnimating(false);
    setAnimStep(999);
    setSweepPct(100);
    clearUserInk();

    if (!activeGlyph || typeof document === 'undefined') return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = drawCanvasRef.current;
    if (c) {
      c.width = PAD_SIZE * dpr;
      c.height = PAD_SIZE * dpr;
      const ctx = c.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Prepare offscreen glyph mask for pixel-coverage & accuracy grading
    const off = document.createElement('canvas');
    off.width = PAD_SIZE;
    off.height = PAD_SIZE;
    const octx = off.getContext('2d');
    if (octx) {
      octx.clearRect(0, 0, PAD_SIZE, PAD_SIZE);
      octx.font = fontSpec;
      octx.textAlign = 'center';
      octx.textBaseline = 'alphabetic';
      const baselineY = lang === 'en' ? Math.round(PAD_SIZE * 0.74) : Math.round(PAD_SIZE * 0.75);
      // Core glyph fill (red channel = core glyph pixels)
      octx.fillStyle = 'rgb(255, 0, 0)';
      octx.fillText(activeGlyph, PAD_SIZE / 2, baselineY);
      // Tolerance halo (green channel = acceptable stroke tolerance zone)
      octx.lineJoin = 'round';
      octx.lineCap = 'round';
      octx.lineWidth = 22;
      octx.strokeStyle = 'rgba(0, 255, 0, 1)';
      octx.strokeText(activeGlyph, PAD_SIZE / 2, baselineY);
      octx.fillText(activeGlyph, PAD_SIZE / 2, baselineY);
    }
    maskCanvasRef.current = off;

    return () => clearTimers();
  }, [activeGlyph, fontSpec, lang, clearUserInk]);

  const computeAccuracy = useCallback(() => {
    const drawC = drawCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!drawC || !maskC) return;

    // Downsample user drawing onto PAD_SIZE x PAD_SIZE to match mask
    const sample = document.createElement('canvas');
    sample.width = PAD_SIZE;
    sample.height = PAD_SIZE;
    const sctx = sample.getContext('2d');
    const mctx = maskC.getContext('2d');
    if (!sctx || !mctx) return;

    sctx.drawImage(drawC, 0, 0, PAD_SIZE, PAD_SIZE);
    const userPx = sctx.getImageData(0, 0, PAD_SIZE, PAD_SIZE).data;
    const maskPx = mctx.getImageData(0, 0, PAD_SIZE, PAD_SIZE).data;

    let coreTotal = 0;
    let coreCovered = 0;
    let userTotal = 0;
    let userInBounds = 0;

    for (let i = 0; i < maskPx.length; i += 4) {
      const isCore = maskPx[i] > 80;
      const isTolerance = maskPx[i + 1] > 60 || isCore;
      const isDrawn = userPx[i + 3] > 50;

      if (isCore) {
        coreTotal++;
        if (isDrawn) coreCovered++;
      }
      if (isDrawn) {
        userTotal++;
        if (isTolerance) userInBounds++;
      }
    }

    if (userTotal < 12 || coreTotal === 0) return;
    const coverage = Math.min(100, Math.round((coreCovered / coreTotal) * 118));
    const precision = Math.min(100, Math.round((userInBounds / userTotal) * 100));
    const accuracy = Math.round(coverage * 0.55 + precision * 0.45);
    setScore({
      accuracy,
      coverage,
      done: coverage >= 58 && accuracy >= 62,
    });
  }, []);

  const getLocalCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * PAD_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * PAD_SIZE,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (animating) {
      clearTimers();
      setAnimating(false);
      setAnimStep(999);
      setSweepPct(100);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getLocalCoords(e);
    lastPtRef.current = pt;

    const ctx = drawCanvasRef.current?.getContext('2d');
    if (ctx) {
      const isDark = document.documentElement.classList.contains('dark');
      ctx.strokeStyle = isDark ? '#6FC294' : '#176B4B';
      ctx.fillStyle = isDark ? '#6FC294' : '#176B4B';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPtRef.current) return;
    const pt = getLocalCoords(e);
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (ctx) {
      const isDark = document.documentElement.classList.contains('dark');
      ctx.strokeStyle = isDark ? '#6FC294' : '#176B4B';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    lastPtRef.current = pt;
  };

  const onPointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPtRef.current = null;
    computeAccuracy();
  };

  const handleAnimate = () => {
    clearTimers();
    clearUserInk();
    setShowOutline(true);
    setAnimating(true);

    if (vectorStrokes && vectorStrokes.length > 0) {
      setAnimStep(-1);
      vectorStrokes.forEach((_, idx) => {
        const id = window.setTimeout(() => {
          setAnimStep(idx);
        }, idx * 520 + 60);
        animTimersRef.current.push(id);
      });
      const endId = window.setTimeout(() => {
        setAnimating(false);
        setAnimStep(999);
      }, vectorStrokes.length * 520 + 450);
      animTimersRef.current.push(endId);
    } else {
      // Smooth progressive reveal for complex Bangla Juktakkhor / conjuncts
      setSweepPct(0);
      for (let step = 1; step <= 20; step++) {
        const id = window.setTimeout(() => {
          setSweepPct(step * 5);
          if (step === 20) setAnimating(false);
        }, step * 65);
        animTimersRef.current.push(id);
      }
    }
  };

  if (clusters.length === 0) return null;

  return (
    <div className="space-y-4 pt-2 border-t border-sanzar-border">
      {/* Header / Expandable Toggle Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted group-hover:text-sanzar-primary transition">
            {lang === 'bn'
              ? 'বাংলা অক্ষর বিশ্লেষণ ও লেখার অনুশীলন · Bangla Writing Studio'
              : 'Letter Writing & Stroke Practice'}
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-sanzar-muted" />
          ) : (
            <ChevronUp className="w-4 h-4 text-sanzar-muted" />
          )}
        </button>

        {!collapsed && matraInfo && (
          <span className="sanzar-pill text-[11px]">
            {matraInfo.bnLabel} · {matraInfo.label}
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Grapheme Cluster / Letter Selector Tabs */}
          {clusters.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {clusters.map((cl, idx) => {
                const selected = idx === activeIdx && !drillChar;
                return (
                  <button
                    key={`${cl}-${idx}`}
                    type="button"
                    onClick={() => {
                      setActiveIdx(idx);
                      setDrillChar(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-base font-extrabold transition ${
                      selected
                        ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary shadow-sm'
                        : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text hover:bg-sanzar-surface2'
                    }`}
                  >
                    {cl}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bangla Juktakkhor / Kar Constituent Breakdown */}
          {lang === 'bn' && constituents.length > 1 && (
            <div className="p-3 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-sanzar-muted mr-1">গঠন (Breakdown):</span>
                {constituents.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-sanzar-muted font-bold">+</span>}
                    {part.isBaseLetter ? (
                      <button
                        type="button"
                        onClick={() => setDrillChar(drillChar === part.symbol ? null : part.symbol)}
                        title={`Practice base letter "${part.symbol}"`}
                        className={`px-2 py-0.5 rounded-lg border font-bold transition ${
                          drillChar === part.symbol
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
              {drillChar && (
                <button
                  type="button"
                  onClick={() => setDrillChar(null)}
                  className="text-[11px] font-bold text-sanzar-primary hover:underline"
                >
                  ← Back to "{primaryCluster}"
                </button>
              )}
            </div>
          )}

          {/* Pad + Controls */}
          <div className="grid sm:grid-cols-[204px_1fr] gap-4 items-start">
            {/* Writing Pad (Matra Grid for Bangla; 4-Line Ruled Grid for English) */}
            <div
              style={{ width: PAD_SIZE, height: PAD_SIZE }}
              className="relative max-w-full mx-auto sm:mx-0 rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-hidden shrink-0 select-none touch-none"
            >
              {/* Guide Lines + Ghost Outline + Animated Stroke Guides */}
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                {lang === 'en' ? (
                  <>
                    {/* 4-Line Primary Notebook Grid */}
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#0ea5e9" strokeOpacity="0.45" strokeWidth="0.7" />
                    <line x1="0" y1="44" x2="100" y2="44" stroke="#10b981" strokeOpacity="0.45" strokeWidth="0.6" strokeDasharray="3 2" />
                    <line x1="0" y1="74" x2="100" y2="74" stroke="#ef4444" strokeOpacity="0.45" strokeWidth="0.8" />
                    <line x1="0" y1="92" x2="100" y2="92" stroke="#64748b" strokeOpacity="0.35" strokeWidth="0.6" />
                  </>
                ) : (
                  <>
                    {/* Bangla Matra-Line Grid */}
                    <line
                      x1={matraInfo?.type === 'half' ? '52' : '8'}
                      y1="26"
                      x2="92"
                      y2="26"
                      stroke="#19B46B"
                      strokeOpacity={matraInfo?.type === 'none' ? '0.22' : '0.7'}
                      strokeWidth={matraInfo?.type === 'none' ? '0.6' : '1.4'}
                      strokeDasharray={matraInfo?.type === 'none' ? '2 2' : undefined}
                    />
                    <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="8" y1="76" x2="92" y2="76" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.7" />
                  </>
                )}

                {/* Ghost Target Glyph */}
                {showOutline && (
                  <g style={animating && !vectorStrokes ? { clipPath: `inset(0 ${100 - sweepPct}% 0 0)` } : undefined}>
                    <text
                      x="50"
                      y={lang === 'en' ? '74' : '75'}
                      textAnchor="middle"
                      fontSize={lang === 'bn' && Array.from(activeGlyph).length > 2 ? '50' : '61'}
                      fontWeight="700"
                      fontFamily={
                        lang === 'bn'
                          ? '"Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif'
                          : '"Inter", system-ui, sans-serif'
                      }
                      fill="currentColor"
                      className={
                        animating && !vectorStrokes
                          ? 'text-emerald-500/55'
                          : 'text-emerald-950/[0.15] dark:text-white/[0.16]'
                      }
                    >
                      {activeGlyph}
                    </text>
                  </g>
                )}

                {/* Directional Vector Strokes & Numbered Start Badges */}
                {vectorStrokes &&
                  (showOutline || animating) &&
                  vectorStrokes.map((pts, idx) => {
                    const visible = !animating || idx <= animStep;
                    if (!visible || pts.length === 0) return null;
                    const isCurrent = animating && idx === animStep;
                    const [sx, sy] = pts[0];
                    return (
                      <g key={idx}>
                        <path
                          d={pointsToSvgPath(pts)}
                          fill="none"
                          stroke={isCurrent ? '#19B46B' : 'rgba(25, 180, 107, 0.42)'}
                          strokeWidth={isCurrent ? '3.4' : '1.5'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={isCurrent ? undefined : '2.2 2.2'}
                        />
                        <circle cx={sx} cy={sy} r="3.4" fill={isCurrent ? '#19B46B' : '#0f5132'} />
                        <text x={sx} y={sy + 1.2} textAnchor="middle" fontSize="4.2" fontWeight="800" fill="#ffffff">
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
              </svg>

              {/* Interactive User Drawing Layer */}
              <canvas
                ref={drawCanvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ width: PAD_SIZE, height: PAD_SIZE }}
                className="relative z-10 block cursor-crosshair touch-none"
              />
            </div>

            {/* Controls & Accuracy Feedback */}
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnimate}
                  className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Animate guide
                </button>
                <button
                  type="button"
                  onClick={clearUserInk}
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

              <div className="p-3.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sanzar-text inline-flex items-center gap-1.5">
                    <PencilLine className="w-3.5 h-3.5 text-sanzar-primary" />
                    Trace <span className="text-base font-black text-sanzar-primary px-1">{activeGlyph}</span> inside the grid
                  </span>
                  {vectorStrokes && (
                    <span className="text-[11px] text-sanzar-muted font-semibold">
                      {vectorStrokes.length} {vectorStrokes.length === 1 ? 'stroke' : 'strokes'}
                    </span>
                  )}
                </div>

                {score ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold inline-flex items-center gap-1 ${
                          score.done ? 'text-sanzar-primary' : 'text-sanzar-text2'
                        }`}
                      >
                        {score.done && <CheckCircle2 className="w-4 h-4" />}
                        {score.done ? `Great job! ${score.accuracy}% accuracy` : `Tracing… ${score.coverage}% covered`}
                      </span>
                      <span className="text-[11px] font-bold text-sanzar-muted">{score.accuracy}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, score.coverage)}%` }}
                        className="h-full bg-sanzar-primary transition-all duration-200"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sanzar-muted leading-relaxed">
                    {lang === 'bn'
                      ? 'Draw with mouse or finger along the মাত্রা (top line) and numbered strokes.'
                      : 'Draw with mouse or finger following the 4-line ruled guides and numbered strokes.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step-by-step Stroke Order Strip (when directional vector strokes exist) */}
          {vectorStrokes && vectorStrokes.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-sanzar-muted">Stroke-by-stroke order</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {vectorStrokes.map((_, stepIdx) => (
                  <div
                    key={stepIdx}
                    className="w-12 h-12 rounded-xl bg-white dark:bg-black/30 border border-sanzar-border shrink-0 relative flex items-center justify-center"
                    title={`Stroke ${stepIdx + 1}`}
                  >
                    <span className="absolute top-0.5 left-1 text-[9px] font-bold text-sanzar-muted">
                      {stepIdx + 1}
                    </span>
                    <svg viewBox="0 0 100 100" className="w-9 h-9">
                      {vectorStrokes.map((pts, j) => (
                        <path
                          key={j}
                          d={pointsToSvgPath(pts)}
                          fill="none"
                          stroke={
                            j < stepIdx
                              ? 'currentColor'
                              : j === stepIdx
                                ? '#19B46B'
                                : 'rgba(128,128,128,0.2)'
                          }
                          strokeWidth={j === stepIdx ? '7' : '5.5'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
