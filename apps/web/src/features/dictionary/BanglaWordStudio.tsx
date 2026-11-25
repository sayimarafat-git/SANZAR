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
import {
  buildKalpurushModel,
  pointAlongKalpurushStroke,
  renderKalpurushFrame,
  type KalpurushModel,
} from './bangla-kalpurush-engine';
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
  const [fontReadyTick, setFontReadyTick] = useState(0);
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Continuous 60fps Kalpurush stroke animation state (matches EnglishWordStudio)
  const [animating, setAnimating] = useState(false);
  const [animState, setAnimState] = useState<{
    strokeIdx: number;
    progress: number;
    nib: { x: number; y: number } | null;
  } | null>(null);

  // Snap-to-stroke interactive practice state (matches EnglishWordStudio)
  const [practiceMode, setPracticeMode] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [strokeMisses, setStrokeMisses] = useState(0);
  const [hintFlash, setHintFlash] = useState(false);
  const [userPts, setUserPts] = useState<{ x: number; y: number }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);

  // Ensure self-hosted Kalpurush.woff2 is loaded before final glyph rasterization
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    void document.fonts
      .load('600 68px "Kalpurush"')
      .then(() => {
        if (alive) setFontReadyTick((t) => t + 1);
      })
      .catch(() => {});
    void document.fonts.ready.then(() => {
      if (alive) setFontReadyTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Watch dark/light theme switches so canvas ink updates immediately
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

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

  const model: KalpurushModel | null = useMemo(() => {
    void fontReadyTick;
    return buildKalpurushModel(activeText);
  }, [activeText, fontReadyTick]);

  const strokes = model?.strokes || [];

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimating(false);
  }, []);

  // Reset state when word/cluster changes
  useEffect(() => {
    stopAnim();
    setAnimState(null);
    setPracticeMode(false);
    setCompletedCount(0);
    setMistakes(0);
    setStrokeMisses(0);
    setHintFlash(false);
    setUserPts([]);
    return () => stopAnim();
  }, [activeText, stopAnim]);

  // Allocate Retina ImageData buffer whenever model dimensions change
  useEffect(() => {
    if (!model || !canvasRef.current) return;
    const c = canvasRef.current;
    const hiW = model.width * model.dpr;
    const hiH = model.height * model.dpr;
    if (c.width !== hiW || c.height !== hiH) {
      c.width = hiW;
      c.height = hiH;
      imgDataRef.current = null;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (!imgDataRef.current || imgDataRef.current.width !== hiW || imgDataRef.current.height !== hiH) {
      imgDataRef.current = ctx.createImageData(hiW, hiH);
    }
  }, [model, collapsed]);

  // Repaint Kalpurush Retina canvas whenever state changes
  useEffect(() => {
    if (collapsed || !model || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const hiW = model.width * model.dpr;
    const hiH = model.height * model.dpr;
    if (!imgDataRef.current || imgDataRef.current.width !== hiW || imgDataRef.current.height !== hiH) {
      imgDataRef.current = ctx.createImageData(hiW, hiH);
    }

    if (animating && animState) {
      renderKalpurushFrame(ctx, imgDataRef.current, model, {
        mode: 'anim',
        activeStrokeIdx: animState.strokeIdx,
        activeProgress: animState.progress,
        showOutline,
        isDark,
      });
    } else if (practiceMode) {
      renderKalpurushFrame(ctx, imgDataRef.current, model, {
        mode: 'practice',
        activeStrokeIdx: completedCount,
        activeProgress: 1,
        showOutline,
        isDark,
      });
    } else {
      renderKalpurushFrame(ctx, imgDataRef.current, model, {
        mode: 'idle',
        activeStrokeIdx: strokes.length,
        activeProgress: 1,
        showOutline,
        isDark,
      });
    }
  }, [collapsed, model, strokes.length, animating, animState, practiceMode, completedCount, showOutline, isDark]);

  // 60fps Whole-Word / Cluster Pen-Tip Animation (matches EnglishWordStudio rhythm)
  const handleAnimate = useCallback(() => {
    stopAnim();
    setPracticeMode(false);
    setUserPts([]);
    if (!model || model.strokes.length === 0) return;

    const msPerUnit = speed === 0.5 ? 11.5 : 5.5;
    const gapMs = speed === 0.5 ? 150 : 80;
    const durations = model.strokes.map((st) => Math.max(150, Math.min(680, st.totalLen * msPerUnit)));

    setAnimating(true);
    let idx = 0;
    let phaseStart = performance.now();
    let inGap = false;

    const tick = (now: number) => {
      if (idx >= model.strokes.length) {
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
      const eased = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
      const nib = pointAlongKalpurushStroke(model.strokes[idx], eased);

      setAnimState({ strokeIdx: idx, progress: eased, nib });

      if (rawT >= 1) {
        inGap = true;
        phaseStart = now;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [model, speed, stopAnim]);

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
    const mapped = pt.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!practiceMode || completedCount >= strokes.length) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = toSvgCoords(e);
    if (pt) setUserPts([pt]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const pt = toSvgCoords(e);
    if (!pt) return;
    setUserPts((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) return prev;
      return [...prev, pt];
    });
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const target = strokes[completedCount];
    if (!target || userPts.length === 0) {
      setUserPts([]);
      return;
    }

    const startPt = target.points[0];
    const endPt = target.points[target.points.length - 1];
    const uStart = userPts[0];
    const uEnd = userPts[userPts.length - 1];

    // Tiny dot/bindu stroke: accept tap near dot
    if (target.totalLen <= 8) {
      const d = Math.hypot(uStart.x - startPt.x, uStart.y - startPt.y);
      if (d < 26) {
        setCompletedCount((c) => c + 1);
        setStrokeMisses(0);
        setHintFlash(false);
      } else {
        setMistakes((m) => m + 1);
        setStrokeMisses((s) => s + 1);
        setHintFlash(true);
      }
      setUserPts([]);
      return;
    }

    const startDist = Math.hypot(uStart.x - startPt.x, uStart.y - startPt.y);
    const endDist = Math.hypot(uEnd.x - endPt.x, uEnd.y - endPt.y);
    // Also allow reverse direction if user traced the exact shape cleanly
    const revStartDist = Math.hypot(uStart.x - endPt.x, uStart.y - endPt.y);
    const revEndDist = Math.hypot(uEnd.x - startPt.x, uEnd.y - startPt.y);

    const samples = 8;
    let avgDist = 0;
    for (let i = 0; i < samples; i++) {
      const tp = pointAlongKalpurushStroke(target, i / (samples - 1));
      let minD = Infinity;
      for (const up of userPts) {
        const d = Math.hypot(up.x - tp.x, up.y - tp.y);
        if (d < minD) minD = d;
      }
      avgDist += minD;
    }
    avgDist /= samples;

    const tol = strokeMisses >= 1 ? 1.35 : 1;
    const forwardOk = startDist < 28 * tol && endDist < 32 * tol && avgDist < 22 * tol;
    const reverseOk = revStartDist < 24 * tol && revEndDist < 26 * tol && avgDist < 18 * tol;

    if (forwardOk || reverseOk) {
      setCompletedCount((c) => c + 1);
      setStrokeMisses(0);
      setHintFlash(false);
    } else {
      setMistakes((m) => m + 1);
      setStrokeMisses((s) => s + 1);
      setHintFlash(true);
    }
    setUserPts([]);
  };

  if (words.length === 0 || !model) return null;

  const practiceDone = practiceMode && completedCount >= strokes.length;
  const activeStroke = practiceMode && !practiceDone ? strokes[completedCount] : null;
  const activeStartPt = activeStroke ? activeStroke.points[0] : null;
  const stageHeight = 164;
  const stageWidth = Math.round((model.width / model.height) * stageHeight);

  return (
    <div className="space-y-4 pt-2 border-t border-sanzar-border">
      {/* Header / Expandable Toggle (matches EnglishWordStudio) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted group-hover:text-sanzar-primary transition">
            বাংলা লেখা অনুশীলন • Whole-Word Writing &amp; Stroke Studio
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-sanzar-muted" />
          ) : (
            <ChevronUp className="w-4 h-4 text-sanzar-muted" />
          )}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-1.5">
            <span
              className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold"
              style={{ fontFamily: BANGLA_DEFAULT_FONT }}
            >
              {matraInfo.bnLabel} ({matraInfo.label})
            </span>
            <span className="sanzar-pill text-[11px]">{strokes.length} strokes</span>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Multi-word selector pills (for multi-word Bangla phrases) */}
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
                  style={{ fontFamily: BANGLA_DEFAULT_FONT }}
                  className={`px-3 py-1 rounded-xl border text-sm font-bold transition ${
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

          {/* Whole-word vs Grapheme Cluster tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFocusTarget('word')}
              style={{ fontFamily: BANGLA_DEFAULT_FONT }}
              className={`px-3 py-1 rounded-xl border text-xs font-bold transition ${
                focusTarget === 'word'
                  ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                  : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
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
                  className={`px-3 py-1 rounded-xl border text-sm font-bold transition ${
                    focusTarget === idx
                      ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                      : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                  }`}
                >
                  {cl}
                </button>
              ))}
          </div>

          {/* Juktakkhor / Kar breakdown pills when inspecting a cluster */}
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
                    className={`px-2 py-0.5 rounded-lg border text-xs font-semibold transition ${
                      focusTarget === part.symbol
                        ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                        : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                    }`}
                  >
                    {part.symbol}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Wide 4-Line Ruled Kalpurush Penmanship Strip (matches EnglishWordStudio) */}
          <div className="relative rounded-2xl bg-white dark:bg-black/35 border-2 border-emerald-900/25 dark:border-white/20 shadow-inner overflow-x-auto select-none">
            {/* Full-width 4-Line Ruled Bangla Notebook Lines */}
            <svg
              viewBox={`0 0 100 ${model.height}`}
              preserveAspectRatio="none"
              style={{ height: `${stageHeight}px` }}
              className="pointer-events-none absolute inset-x-0 top-0 w-full block"
            >
              <line x1="0" y1={model.crownY} x2="100" y2={model.crownY} stroke="#0ea5e9" strokeOpacity="0.4" strokeWidth="0.65" vectorEffect="non-scaling-stroke" />
              <line
                x1="0"
                y1={model.matraY}
                x2="100"
                y2={model.matraY}
                stroke="#10b981"
                strokeOpacity="0.5"
                strokeWidth="0.75"
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
              />
              <line x1="0" y1={model.baseY} x2="100" y2={model.baseY} stroke="#ef4444" strokeOpacity="0.45" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={model.subY} x2="100" y2={model.subY} stroke="#64748b" strokeOpacity="0.32" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            </svg>

            <div
              className="relative mx-auto"
              style={{
                width: `${stageWidth}px`,
                height: `${stageHeight}px`,
              }}
            >
              {/* 2x Retina Authentic Kalpurush Stroke Canvas */}
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 w-full h-full block"
              />

              {/* Top Interactive SVG Layer (Nib, Practice Start Dot, Hint Flash, User Live Ink) */}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${model.width} ${model.height}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`absolute inset-0 w-full h-full block touch-none ${
                  practiceMode && !practiceDone ? 'cursor-crosshair' : ''
                }`}
              >
                {/* Practice Hint Flash on Current Stroke */}
                {practiceMode && hintFlash && activeStroke && (
                  <path
                    d={activeStroke.d}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                  />
                )}

                {/* Glowing Pen-Tip Nib during 60fps Animation */}
                {animating && animState?.nib && (
                  <g>
                    <circle cx={animState.nib.x} cy={animState.nib.y} r="5.8" fill="#19B46B" fillOpacity="0.28" />
                    <circle cx={animState.nib.x} cy={animState.nib.y} r="2.9" fill="#19B46B" />
                  </g>
                )}

                {/* Practice Mode: Start-Point Guide Dot */}
                {activeStartPt && showOutline && (
                  <g>
                    <circle cx={activeStartPt.x} cy={activeStartPt.y} r="5.5" fill="#19B46B" fillOpacity="0.25" />
                    <circle cx={activeStartPt.x} cy={activeStartPt.y} r="2.8" fill="#19B46B" />
                  </g>
                )}

                {/* Practice Mode: Live User Drawing Trail */}
                {userPts.length > 1 && (
                  <path
                    d={userPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}
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
          </div>

          {/* Controls Toolbar (matches EnglishWordStudio) */}
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
                onClick={practiceMode ? () => setPracticeMode(false) : handleStartPractice}
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

          {/* Live Practice Status Banner (matches EnglishWordStudio) */}
          {practiceMode && (
            <div className="p-3 rounded-xl bg-sanzar-surface2 border border-sanzar-border text-xs flex items-center justify-between gap-2">
              {practiceDone ? (
                <span className="font-bold text-sanzar-primary inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  অসাধারণ! Completed "{activeText}" ({mistakes === 0 ? 'Perfect — 0 mistakes' : `${mistakes} mistake(s)`})
                </span>
              ) : (
                <span className="text-sanzar-text2 font-medium">
                  Draw stroke <b>{completedCount + 1}</b> of <b>{strokes.length}</b>{' '}
                  {activeStroke && (
                    <span className="text-sanzar-muted" style={{ fontFamily: BANGLA_DEFAULT_FONT }}>
                      (অংশ "{activeStroke.cluster}")
                    </span>
                  )}{' '}
                  — start at the green dot
                </span>
              )}
              <button
                type="button"
                onClick={handleStartPractice}
                className="text-sanzar-primary font-bold hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
