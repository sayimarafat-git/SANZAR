import React, { useState } from 'react';
import { Pencil, Play, Square } from 'lucide-react';
import { useFocusTimer } from '../lib/focus-timer-context';
import { useSettings } from '../lib/settings-context';
import { mmss } from './SanzarUI';

const DIAL_RADIUS = 56;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const PRESETS = [15, 25, 45];

export const AnalogFocusTimer: React.FC = () => {
  const { t } = useSettings();
  const { durationMins, setDurationMins, remainingSec, running, start, stop } = useFocusTimer();
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState(String(durationMins));

  const applyCustom = () => {
    const parsed = Number(customVal);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 180) {
      setDurationMins(Math.round(parsed));
      setCustomOpen(false);
    }
  };

  // 60-minute analog dial geometry: 0m at 12 o'clock, clockwise
  const clampedForDial = Math.min(3600, Math.max(0, remainingSec));
  const minuteDeg = (clampedForDial / 3600) * 360;
  const secondDeg = running ? (remainingSec % 60) * 6 : 0;
  const dialDashOffset = DIAL_CIRCUMFERENCE * (1 - clampedForDial / 3600);

  return (
    <div className="sanzar-card p-3 sm:p-5 sm:min-h-[114px] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 min-w-0">
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
        {/* Analog Clock Dial: 40px on mobile, 64px on sm+ */}
        <div className="relative w-10 h-10 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 140 140" aria-hidden="true">
            <circle
              cx="70"
              cy="70"
              r="66"
              fill="var(--surface2)"
              stroke="var(--glass-border)"
              strokeWidth="2.5"
            />

            {/* Track + remaining-time arc */}
            <g transform="rotate(-90 70 70)">
              <circle
                cx="70"
                cy="70"
                r={DIAL_RADIUS}
                fill="none"
                stroke="var(--primary-soft)"
                strokeWidth="8"
              />
              <circle
                cx="70"
                cy="70"
                r={DIAL_RADIUS}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={DIAL_CIRCUMFERENCE}
                strokeDashoffset={dialDashOffset}
                style={{ transition: 'stroke-dashoffset 0.35s linear' }}
              />
            </g>

            {/* 12 crisp hour/5-min dial markers (12/3/6/9 emphasized) */}
            {Array.from({ length: 12 }, (_, idx) => {
              const isCardinal = idx % 3 === 0;
              const angle = idx * 30;
              return (
                <line
                  key={idx}
                  x1="70"
                  y1={isCardinal ? 21 : 23}
                  x2="70"
                  y2={isCardinal ? 31 : 29}
                  stroke={isCardinal ? 'var(--text)' : 'var(--muted)'}
                  strokeWidth={isCardinal ? 3 : 2}
                  strokeLinecap="round"
                  opacity={isCardinal ? 0.85 : 0.65}
                  transform={`rotate(${angle} 70 70)`}
                />
              );
            })}

            {/* Minute / Remaining-Time Hand */}
            <g transform={`rotate(${minuteDeg} 70 70)`} style={{ transition: 'transform 0.35s ease-out' }}>
              <line
                x1="70"
                y1="78"
                x2="70"
                y2="31"
                stroke="var(--text)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            </g>

            {/* Second Sweep Hand */}
            <g transform={`rotate(${secondDeg} 70 70)`}>
              <line
                x1="70"
                y1="82"
                x2="70"
                y2="24"
                stroke="var(--gold)"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity={running ? 1 : 0.6}
              />
            </g>

            {/* Center Pivot */}
            <circle cx="70" cy="70" r="6" fill="var(--primary)" />
            <circle cx="70" cy="70" r="2.2" fill="var(--on-primary)" />
          </svg>
        </div>

        {/* Mobile header beside dial */}
        <div className="sm:hidden flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-bold text-xs truncate">{t('focus')}</span>
            {running && <span className="w-1.5 h-1.5 rounded-full bg-sanzar-primary animate-pulse shrink-0" />}
          </div>
          <p className="text-sm font-extrabold tracking-tight text-sanzar-primary tabular-nums">
            {mmss(remainingSec)}
          </p>
        </div>
      </div>

      {/* Controls & Digital Readout */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="hidden sm:flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-sm truncate">{t('focus')}</span>
            {running && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sanzar-primary shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-sanzar-primary animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <span className="text-lg font-extrabold tracking-tight text-sanzar-primary tabular-nums shrink-0">
            {mmss(remainingSec)}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          {!running ? (
            <div className="flex items-center flex-wrap gap-1">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setDurationMins(m);
                    setCustomOpen(false);
                  }}
                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold border transition leading-tight ${
                    durationMins === m && !customOpen
                      ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                      : 'border-sanzar-border text-sanzar-muted hover:text-sanzar-text'
                  }`}
                >
                  {m}m
                </button>
              ))}
              {customOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyCustom();
                  }}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={customVal}
                    onChange={(e) => setCustomVal(e.target.value)}
                    onBlur={applyCustom}
                    aria-label="Custom minutes"
                    autoFocus
                    className="w-12 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-sanzar-surface2 border border-sanzar-primary text-sanzar-text outline-none"
                  />
                  <span className="text-[10px] text-sanzar-muted">m</span>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCustomVal(String(durationMins));
                    setCustomOpen(true);
                  }}
                  title="Set custom minutes"
                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold border transition leading-tight inline-flex items-center gap-1 ${
                    !PRESETS.includes(durationMins)
                      ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                      : 'border-sanzar-border text-sanzar-muted hover:text-sanzar-text'
                  }`}
                >
                  <Pencil className="w-2.5 h-2.5 shrink-0" />
                  <span>{!PRESETS.includes(durationMins) ? `Custom (${durationMins}m)` : 'Custom'}</span>
                </button>
              )}
            </div>
          ) : (
            <span className="hidden sm:inline text-xs text-sanzar-text2 truncate">{t('focus')}</span>
          )}

          {running ? (
            <button
              type="button"
              onClick={stop}
              className="w-full sm:w-auto justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 hover:bg-sanzar-surface text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 transition shrink-0 whitespace-nowrap"
            >
              <Square className="w-3 h-3 fill-current" />
              {t('focusStop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start()}
              className="w-full sm:w-auto justify-center px-2.5 sm:px-3 py-1.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition shrink-0 whitespace-nowrap"
            >
              <Play className="w-3 h-3 fill-current" />
              {t('focusStart', { n: durationMins })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
