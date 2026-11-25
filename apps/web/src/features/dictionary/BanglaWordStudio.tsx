import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eraser,
  Eye,
  EyeOff,
  Gauge,
  PencilLine,
  Play,
  RotateCcw,
} from 'lucide-react';
import { BANGLA_DEFAULT_FONT } from './bangla-pen-paths';
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
  const [focusTarget, setFocusTarget] = useState<'word' | number | string>('word');
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [showOutline, setShowOutline] = useState(true);

  // 60fps real-Kalpurush ink-reveal animation state
  const [animating, setAnimating] = useState(false);
  const [revealPct, setRevealPct] = useState(100);

  // Interactive freehand tracing state over real Kalpurush glyph
  const [practiceMode, setPracticeMode] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [score, setScore] = useState<{ accuracy: number; coverage: number; done: boolean } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
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

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimating(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const c = drawCanvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx?.clearRect(0, 0, c.width, c.height);
    }
    setHasInk(false);
    setScore(null);
  }, []);

  // Build offscreen Kalpurush reference mask for practice accuracy scoring
  const buildMask = useCallback(() => {
    if (typeof document === 'undefined' || !drawCanvasRef.current || !activeText) return;
    const c = drawCanvasRef.current;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);

    const mask = document.createElement('canvas');
    mask.width = c.width;
    mask.height = c.height;
    const mctx = mask.getContext('2d');
    if (mctx) {
      const fontSize = Math.min(rect.height * 0.62, (rect.width * 0.84) / Math.max(1.5, activeText.length * 0.55));
      mctx.scale(dpr, dpr);
      mctx.fillStyle = '#000';
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      mctx.font = `600 ${Math.round(fontSize)}px ${BANGLA_DEFAULT_FONT}`;
      mctx.fillText(activeText, rect.width / 2, rect.height / 2 + 2);
    }
    maskCanvasRef.current = mask;
  }, [activeText]);

  useEffect(() => {
    stopAnim();
    setRevealPct(100);
    setPracticeMode(false);
    clearCanvas();
  }, [activeText, stopAnim, clearCanvas]);

  useEffect(() => {
    if (practiceMode) {
      const id = window.requestAnimationFrame(buildMask);
      return () => window.cancelAnimationFrame(id);
    }
  }, [practiceMode, buildMask]);

  useEffect(() => stopAnim, [stopAnim]);

  // 60fps smooth ink-writing reveal across the real Kalpurush word
  const playAnimation = useCallback(() => {
    stopAnim();
    setPracticeMode(false);
    clearCanvas();
    setAnimating(true);
    setRevealPct(0);

    const duration = Math.max(900, Math.min(3200, activeText.length * (speed === 0.5 ? 520 : 260)));
    let startTs: number | null = null;

    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const raw = Math.min(1, (now - startTs) / duration);
      // Smooth easeInOutSine
      const eased = -(Math.cos(Math.PI * raw) - 1) / 2;
      setRevealPct(eased * 100);

      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        setAnimating(false);
        setRevealPct(100);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [activeText.length, speed, stopAnim, clearCanvas]);

  const startPractice = () => {
    stopAnim();
    setRevealPct(100);
    setPracticeMode(true);
    clearCanvas();
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = drawCanvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const evaluateTracing = useCallback(() => {
    const draw = drawCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!draw || !mask) return;
    const dctx = draw.getContext('2d');
    const mctx = mask.getContext('2d');
    if (!dctx || !mctx) return;

    const w = draw.width;
    const h = draw.height;
    const dData = dctx.getImageData(0, 0, w, h).data;
    const mData = mctx.getImageData(0, 0, w, h).data;

    let maskPixels = 0;
    let drawPixels = 0;
    let hitPixels = 0;
    // Sample every 4th pixel for instant performance
    for (let i = 3; i < dData.length; i += 16) {
      const inMask = mData[i] > 40;
      const inDraw = dData[i] > 40;
      if (inMask) maskPixels++;
      if (inDraw) drawPixels++;
      if (inMask && inDraw) hitPixels++;
    }

    if (drawPixels < 15 || maskPixels < 15) return;
    const accuracy = Math.min(100, Math.round((hitPixels / drawPixels) * 145));
    const coverage = Math.min(100, Math.round((hitPixels / maskPixels) * 125));
    setScore({ accuracy, coverage, done: coverage >= 55 && accuracy >= 55 });
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!practiceMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getCanvasPoint(e);
    lastPtRef.current = pt;
    setHasInk(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !drawCanvasRef.current) return;
    const ctx = drawCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    const prev = lastPtRef.current || pt;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.strokeStyle = '#19B46B';
    ctx.lineWidth = 7 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPtRef.current = pt;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    evaluateTracing();
  };

  if (words.length === 0) return null;

  const fontSizePx = activeText.length <= 2 ? 96 : activeText.length <= 5 ? 82 : activeText.length <= 9 ? 68 : 54;

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
            বাংলা লেখা অনুশীলন • Bangla Kalpurush Studio
          </span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-sanzar-muted" /> : <ChevronUp className="w-4 h-4 text-sanzar-muted" />}
        </button>

        {!collapsed && (
          <span
            className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
            style={{ fontFamily: BANGLA_DEFAULT_FONT }}
          >
            {matraInfo.bnLabel} ({matraInfo.label})
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Multi-word selector */}
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

          {/* Juktakkhor / Kar breakdown pills */}
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

          {/* Real Kalpurush Stage (100% Authentic Kalpurush Text + 60fps Ink Reveal + Freehand Tracing) */}
          <div className="rounded-xl border border-sanzar-border bg-white dark:bg-slate-950/80 p-3 space-y-2">
            <div
              ref={stageRef}
              className="relative w-full h-[168px] flex items-center justify-center overflow-hidden select-none rounded-lg"
            >
              {/* Bangla Matra headline & baseline notebook guides */}
              <div className="pointer-events-none absolute inset-x-3 top-[32%] border-t border-dashed border-emerald-500/35" />
              <div className="pointer-events-none absolute inset-x-3 top-[72%] border-t border-dashed border-slate-300 dark:border-slate-700" />
              <div className="pointer-events-none absolute inset-x-3 top-[86%] border-t border-slate-200 dark:border-slate-800" />

              {/* Real Kalpurush Faint Guide Layer */}
              {showOutline && (
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: BANGLA_DEFAULT_FONT,
                    fontSize: `${fontSizePx}px`,
                    lineHeight: 1.15,
                  }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold text-slate-200 dark:text-slate-800"
                >
                  {activeText}
                </span>
              )}

              {/* Real Kalpurush Ink Layer (60fps smooth reveal during Animate; hidden while practicing so user draws) */}
              {!practiceMode && (
                <span
                  style={{
                    fontFamily: BANGLA_DEFAULT_FONT,
                    fontSize: `${fontSizePx}px`,
                    lineHeight: 1.15,
                    clipPath: `inset(0 ${Math.max(0, 100 - revealPct)}% 0 0)`,
                  }}
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center font-semibold transition-colors ${
                    animating
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {activeText}
                </span>
              )}

              {/* Glowing pen-tip indicator tracking the reveal */}
              {animating && (
                <div
                  style={{ left: `${revealPct}%` }}
                  className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_12px_4px_rgba(16,185,129,0.55)]" />
                </div>
              )}

              {/* Interactive Freehand Tracing Canvas (Practice Mode) */}
              {practiceMode && (
                <canvas
                  ref={drawCanvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
                />
              )}
            </div>

            {practiceMode && score && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-semibold text-sanzar-muted">
                  Accuracy: <strong className="text-sanzar-primary">{score.accuracy}%</strong> • Coverage:{' '}
                  <strong className="text-sanzar-primary">{score.coverage}%</strong>
                </span>
                {score.done && (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    অসাধারণ!
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={playAnimation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sanzar-primary text-white text-xs font-semibold hover:opacity-95 transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {animating ? 'Playing…' : 'Animate'}
            </button>

            <button
              type="button"
              onClick={practiceMode ? () => setPracticeMode(false) : startPractice}
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

            {practiceMode && hasInk && (
              <button
                type="button"
                onClick={clearCanvas}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sanzar-card border border-sanzar-border text-xs font-semibold text-sanzar-muted hover:text-sanzar-ink transition"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

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
