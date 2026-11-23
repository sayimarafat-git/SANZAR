import React from 'react';
import { Play, Square } from 'lucide-react';
import { useFocusTimer } from '../lib/focus-timer-context';
import { useSettings } from '../lib/settings-context';
import { mmss } from './SanzarUI';

const DIAL_RADIUS = 50;
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
    <div className="sanzar-card p-5 flex items-center gap-4">
      {/* Compact Analog Clock Dial matching Today Goal Ring */}
      <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 140 140" aria-hidden="true">
          {/* Outer frosted bezel */}
          <circle
            cx="70"
            cy="70"
            r="64"
            fill="var(--surface2)"
            stroke="var(--glass-border)"
            strokeWidth="2"
          />

          {/* Track + remaining-time arc */}
          <g transform="rotate(-90 70 70)">
            <circle
              cx="70"
              cy="70"
              r={DIAL_RADIUS}
              fill="none"
              stroke="var(--primary-soft)"
              strokeWidth="7"
            />
            <circle
              cx="70"
              cy="70"
              r={DIAL_RADIUS}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={DIAL_CIRCUMFERENCE}
              strokeDashoffset={dialDashOffset}
              style={{ transition: 'stroke-dashoffset 0.35s linear' }}
            />
          </g>

          {/* 60 analog tick marks around the dial */}
          {Array.from({ length: 60 }, (_, idx) => {
            const isMajor = idx % 5 === 0;
            const angle = idx * 6;
            return (
              <line
                key={idx}
                x1="70"
                y1={isMajor ? 10 : 12.5}
                x2="70"
                y2={isMajor ? 17.5 : 15.5}
                stroke={isMajor ? 'var(--text2)' : 'var(--muted)'}
                strokeWidth={isMajor ? 1.8 : 1}
                strokeLinecap="round"
                opacity={isMajor ? 0.85 : 0.45}
                transform={`rotate(${angle} 70 70)`}
              />
            );
          })}

          {/* Cardinal dial labels (60 / 15 / 30 / 45) */}
          <text x="70" y="27" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--muted)">
            60
          </text>
          <text x="115" y="73" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--muted)">
            15
          </text>
          <text x="70" y="119" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--muted)">
            30
          </text>
          <text x="25" y="73" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--muted)">
            45
          </text>

          {/* Minute / Remaining-Time Hand */}
          <g transform={`rotate(${minuteDeg} 70 70)`} style={{ transition: 'transform 0.35s ease-out' }}>
            <line
              x1="70"
              y1="77"
              x2="70"
              y2="29"
              stroke="var(--text)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>

          {/* Second Sweep Hand */}
          <g transform={`rotate(${secondDeg} 70 70)`}>
            <line
              x1="70"
              y1="81"
              x2="70"
              y2="22"
              stroke="var(--gold)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={running ? 1 : 0.45}
            />
          </g>

          {/* Center Pivot */}
          <circle cx="70" cy="70" r="4.5" fill="var(--primary)" />
          <circle cx="70" cy="70" r="1.8" fill="var(--on-primary)" />
        </svg>
      </div>

      {/* Compact Controls & Digital Readout */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-base truncate">{t('focus')}</span>
            {running && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sanzar-primary shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-sanzar-primary animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <span className="text-xl font-extrabold tracking-tight text-sanzar-primary tabular-nums shrink-0">
            {mmss(remainingSec)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!running ? (
            <div className="flex items-center gap-1">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMins(m)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold border transition ${
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
            <span className="text-xs text-sanzar-text2">{t('focus')}</span>
          )}

          {running ? (
            <button
              type="button"
              onClick={stop}
              className="px-3 py-1.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 hover:bg-sanzar-surface text-xs font-bold inline-flex items-center gap-1.5 transition shrink-0"
            >
              <Square className="w-3 h-3 fill-current" />
              {t('focusStop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start()}
              className="px-3 py-1.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition shrink-0"
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
