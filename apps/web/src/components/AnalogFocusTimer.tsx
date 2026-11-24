import React from 'react';
import { Play, Square } from 'lucide-react';
import { useFocusTimer } from '../lib/focus-timer-context';
import { useSettings } from '../lib/settings-context';
import { mmss } from './SanzarUI';

const DIAL_RADIUS = 56;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const PRESETS = [15, 25, 45];

export const AnalogFocusTimer: React.FC = () => {
  const { t } = useSettings();
  const { durationMins, setDurationMins, remainingSec, running, start, stop } = useFocusTimer();

  // 60-minute analog dial geometry: 0m at 12 o'clock, clockwise
  const clampedForDial = Math.min(3600, Math.max(0, remainingSec));
  const minuteDeg = (clampedForDial / 3600) * 360;
  const secondDeg = running ? (remainingSec % 60) * 6 : 0;
  const dialDashOffset = DIAL_CIRCUMFERENCE * (1 - clampedForDial / 3600);

  return (
    <div className="sanzar-card px-4 py-2.5 flex items-center gap-3.5">
      {/* Compact 48px Analog Clock Dial matching Today Goal Ring */}
      <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
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

      {/* Slim 2-Row Controls & Digital Readout */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-sm truncate">{t('focus')}</span>
            {running && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sanzar-primary shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-sanzar-primary animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <span className="text-base font-extrabold tracking-tight text-sanzar-primary tabular-nums shrink-0">
            {mmss(remainingSec)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {!running ? (
            <div className="flex items-center gap-1">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMins(m)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition leading-tight ${
                    durationMins === m
                      ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                      : 'border-sanzar-border text-sanzar-muted hover:text-sanzar-text'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-sanzar-text2 truncate">{t('focus')}</span>
          )}

          {running ? (
            <button
              type="button"
              onClick={stop}
              className="px-2.5 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface2 hover:bg-sanzar-surface text-xs font-bold inline-flex items-center gap-1 transition shrink-0 whitespace-nowrap leading-tight"
            >
              <Square className="w-3 h-3 fill-current" />
              {t('focusStop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start()}
              className="px-2.5 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1 shadow-sm hover:opacity-95 transition shrink-0 whitespace-nowrap leading-tight"
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
