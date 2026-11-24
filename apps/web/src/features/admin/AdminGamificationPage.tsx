import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, Star } from 'lucide-react';
import { apiRequest, errorText } from '../../lib/api-client';
import { ErrorRetry, LoadingState, useToast } from '../../components/SanzarUI';

const XP_FIELDS: [string, string][] = [
  ['resourceComplete', 'Finishing notes or a material'],
  ['quizCorrect', 'Each correct exam answer'],
  ['dailyGoal', 'Reaching the daily goal'],
  ['post', 'First community post of the day'],
];

const DEFAULT_XP: Record<string, number> = {
  resourceComplete: 10,
  quizCorrect: 5,
  dailyGoal: 20,
  post: 5,
};

const STREAK_FIELDS: [string, string, number, number][] = [
  ['minDailyMinutes', 'Minimum daily study minutes to count a streak day', 1, 180],
  ['graceDaysPerWeek', 'Grace / freeze days allowed per week', 0, 3],
  ['bonus7DayXp', '7-day streak milestone bonus XP', 0, 1000],
  ['bonus30DayXp', '30-day streak milestone bonus XP', 0, 2000],
];

const DEFAULT_STREAK: Record<string, number> = {
  minDailyMinutes: 5,
  graceDaysPerWeek: 1,
  bonus7DayXp: 50,
  bonus30DayXp: 250,
};

export const AdminGamificationPage: React.FC = () => {
  const toast = useToast();
  const q = useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ config: Record<string, unknown> }>('/v1/config'),
  });

  const [xp, setXp] = useState<Record<string, string>>({});
  const [streak, setStreak] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const curXp = { ...DEFAULT_XP, ...((q.data.config.xp as Record<string, number>) ?? {}) };
    setXp(Object.fromEntries(Object.entries(curXp).map(([k, v]) => [k, String(v)])));

    const curStreak = { ...DEFAULT_STREAK, ...((q.data.config.streak as Record<string, number>) ?? {}) };
    setStreak(Object.fromEntries(Object.entries(curStreak).map(([k, v]) => [k, String(v)])));
  }, [q.data]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const saveXp = async () => {
    const vals = Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, Number(v)]));
    if (Object.values(vals).some((v) => !Number.isInteger(v) || v < 0 || v > 1000)) {
      setErr('XP values must be whole numbers from 0 to 1000.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/config/xp', { method: 'PUT', bodyJson: { value: vals } });
      toast('XP rules saved');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveStreak = async () => {
    const vals = Object.fromEntries(Object.entries(streak).map(([k, v]) => [k, Number(v)]));
    for (const [key, label, min, max] of STREAK_FIELDS) {
      const v = vals[key];
      if (!Number.isInteger(v) || v < min || v > max) {
        setErr(`${label} must be a whole number from ${min} to ${max}.`);
        return;
      }
    }
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/config/streak', { method: 'PUT', bodyJson: { value: vals } });
      toast('Streak rules saved');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">XP &amp; Streaks</h1>
        <p className="text-xs text-sanzar-muted mt-0.5">
          Configure XP rewards, daily streak thresholds, grace days, and milestone bonuses.
        </p>
      </div>

      {/* XP Points Card */}
      <div className="sanzar-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-sanzar-gold" />
          <h2 className="text-lg font-bold">XP points</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
          {XP_FIELDS.map(([k, label]) => (
            <label key={k} className="space-y-1">
              <span>{label}</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={xp[k] ?? ''}
                onChange={(e) => setXp({ ...xp, [k]: e.target.value })}
                className="sanzar-input text-sm"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-sanzar-muted">
          Changes apply to new activity only. Points already earned are not recalculated.
        </p>
        <button
          onClick={saveXp}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
        >
          Save XP
        </button>
      </div>

      {/* Streak Controls Card */}
      <div className="sanzar-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-sanzar-warning" />
          <h2 className="text-lg font-bold">Streak controls</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-sanzar-text2">
          {STREAK_FIELDS.map(([k, label, min, max]) => (
            <label key={k} className="space-y-1">
              <span>{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                value={streak[k] ?? ''}
                onChange={(e) => setStreak({ ...streak, [k]: e.target.value })}
                className="sanzar-input text-sm"
              />
            </label>
          ))}
        </div>
        <button
          onClick={saveStreak}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
        >
          Save streak rules
        </button>
      </div>

      {err && <div className="text-sm text-sanzar-danger">{err}</div>}
    </div>
  );
};
