import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Flame,
  Star,
  Timer,
  Trophy,
  Lock,
  Award,
  TrendingUp,
  CloudOff,
  RefreshCw,
  Target,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useFocusTimer } from '../../lib/focus-timer-context';
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN, useSettings } from '../../lib/settings-context';
import { apiRequest, fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject, localizedName } from '../../lib/i18n';
import type { LeaderEntry, ProgressData } from '../../lib/models';
import { LoadingState, mmss, useToast } from '../../components/SanzarUI';

type ProgressTab = 'overview' | 'leaderboard';
const GOAL_PRESETS = [10, 15, 30, 60] as const;

const FALLBACK_PROGRESS: ProgressData = {
  xp: 0,
  level: 1,
  levelXp: 2000,
  intoLevel: 0,
  weekXp: 0,
  todaySec: 0,
  goalSec: 3600,
  totalSec: 0,
  streak: 0,
  series: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    return { day: d.toISOString().slice(0, 10), sec: 0 };
  }),
  bySubject: [],
  completions: [],
  achievements: [],
  attempts: [],
};

export const ProgressPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { lang, dailyGoalMinutes, setDailyGoalMinutes, t } = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: ProgressTab = rawTab === 'leaderboard' ? 'leaderboard' : 'overview';
  const setTab = (next: ProgressTab) => {
    setParams(next === 'overview' ? {} : { tab: next });
  };
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all'>('weekly');
  const [myClassOnly, setMyClassOnly] = useState(false);

  const {
    durationMins: focusMins,
    setDurationMins: setFocusMins,
    remainingSec: focusLeft,
    running: focusRunning,
    start: startFocus,
    stop: stopFocus,
  } = useFocusTimer();

  const progQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => apiRequest<ProgressData>('/v1/progress'),
    enabled: !!user,
    retry: false,
  });

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const lbQuery = useQuery({
    queryKey: ['leaderboard', period, myClassOnly ? profile?.level_id : null],
    queryFn: () =>
      apiRequest<{ entries: LeaderEntry[]; me: LeaderEntry | null }>(
        `/v1/leaderboard?period=${period}${myClassOnly && profile?.level_id ? `&level=${profile.level_id}` : ''}`
      ),
    enabled: !!user && tab === 'leaderboard',
    retry: false,
  });

  const p = progQuery.data ?? FALLBACK_PROGRESS;
  const cat = catQuery.data?.catalog;
  const todayMin = Math.floor(p.todaySec / 60);
  const goalMin = dailyGoalMinutes ?? Math.round((p.goalSec || 3600) / 60);
  const goalPct = Math.min(100, Math.round((p.todaySec / (goalMin * 60)) * 100));

  const [customGoalInput, setCustomGoalInput] = useState(() => String(goalMin));
  useEffect(() => {
    setCustomGoalInput(String(goalMin));
  }, [goalMin]);

  const applyDailyGoal = (minutes: number) => {
    const saved = setDailyGoalMinutes(minutes);
    setCustomGoalInput(String(saved));
    toast(t('saved'));
  };

  const handleCustomGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(customGoalInput);
    if (!Number.isFinite(parsed)) {
      setCustomGoalInput(String(goalMin));
      return;
    }
    applyDailyGoal(parsed);
  };

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('progress')}</h1>
        <p className="text-sm text-sanzar-text2">{t('guestMode')}</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">{t('progress')}</h1>
          {progQuery.isError && (
            <button
              onClick={() => progQuery.refetch()}
              className="sanzar-pill gap-1.5 text-sanzar-muted hover:text-sanzar-primary transition"
              title={t('retry')}
            >
              <CloudOff className="w-3.5 h-3.5" /> {t('offline')} <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Compact Frosted Segmented Toggle */}
        <div className="inline-flex flex-wrap items-center rounded-xl sanzar-glass p-1 gap-1 self-start sm:self-auto">
          {(
            [
              { id: 'overview', label: t('overview'), icon: TrendingUp },
              { id: 'leaderboard', label: t('leaderboard'), icon: Trophy },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                tab === item.id
                  ? 'bg-sanzar-primary text-sanzar-onPrimary shadow-sm'
                  : 'text-sanzar-text2 hover:bg-white/40 dark:hover:bg-white/5'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' ? (
        progQuery.isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            {/* XP Level + Streak + Focus Timer */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="sanzar-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <Star className="w-5 h-5 text-sanzar-gold" />
                    <span>{t('levelN', { n: p.level })}</span>
                  </div>
                  <span className="text-sm font-extrabold text-sanzar-primary">
                    {t('xpTotal', { n: p.xp })}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-sanzar-primarySoft overflow-hidden">
                  <div
                    className="h-full bg-brand-grad rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round((p.intoLevel / (p.levelXp || 2000)) * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-sanzar-muted">
                  <span>
                    {p.intoLevel} / {p.levelXp} XP
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-sanzar-warning">
                    <Flame className="w-4 h-4" /> {t('streak', { n: p.streak })}
                  </span>
                </div>
              </div>

              {/* Focus Timer */}
              <div className="sanzar-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                    <Timer className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{t('focus')}</p>
                    {focusRunning ? (
                      <p className="text-2xl font-black text-sanzar-primary">{mmss(focusLeft)}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {[15, 25, 45].map((m) => (
                          <button
                            key={m}
                            onClick={() => setFocusMins(m)}
                            className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${
                              focusMins === m
                                ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                                : 'border-sanzar-border text-sanzar-muted'
                            }`}
                          >
                            {m}m
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {focusRunning ? (
                  <button
                    onClick={stopFocus}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl border border-sanzar-border text-xs font-bold shrink-0"
                  >
                    {t('focusStop')}
                  </button>
                ) : (
                  <button
                    onClick={() => startFocus()}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold shrink-0"
                  >
                    {t('focusStart', { n: focusMins })}
                  </button>
                )}
              </div>
            </div>

            {/* Daily Study Goal Customizer */}
            <section className="sanzar-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm sm:text-base">{t('dailyGoal')}</h2>
                    <p className="text-xs text-sanzar-muted">{t('goalOf', { m: todayMin, g: goalMin })}</p>
                  </div>
                </div>
                <span className="text-sm font-extrabold text-sanzar-primary">{goalPct}%</span>
              </div>

              <div className="h-2.5 rounded-full bg-sanzar-primarySoft overflow-hidden">
                <div className="h-full bg-brand-grad rounded-full transition-all" style={{ width: `${goalPct}%` }} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {GOAL_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => applyDailyGoal(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        goalMin === m
                          ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary shadow-sm'
                          : 'border-sanzar-border text-sanzar-text2 hover:border-sanzar-primary/50'
                      }`}
                    >
                      {t('minutes', { n: m })}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleCustomGoalSubmit} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={DAILY_GOAL_MIN}
                    max={DAILY_GOAL_MAX}
                    value={customGoalInput}
                    onChange={(e) => setCustomGoalInput(e.target.value)}
                    aria-label={t('customGoal')}
                    placeholder={t('customGoal')}
                    className="w-24 px-3 py-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface2 text-xs font-semibold text-sanzar-text focus:outline-none focus:border-sanzar-primary"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-sanzar-primarySoft text-sanzar-primary hover:bg-sanzar-primary hover:text-sanzar-onPrimary text-xs font-bold transition"
                  >
                    {t('apply')}
                  </button>
                </form>
              </div>
            </section>

            {/* 7-Day Study Bar Chart */}
            <section className="sanzar-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-base">{t('last7')}</h2>
                <span className="text-xs text-sanzar-muted">
                  {t('goalOf', { m: todayMin, g: goalMin })}
                </span>
              </div>
              <div className="h-40 flex items-end gap-1.5 sm:gap-4 pt-4">
                {(() => {
                  const maxSec = Math.max(60, ...p.series.map((d) => d.sec));
                  return p.series.map((d) => {
                    const mins = Math.round(d.sec / 60);
                    const pct = Math.max(4, Math.round((d.sec / maxSec) * 100));
                    return (
                      <div key={d.day} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[10px] sm:text-[11px] font-semibold text-sanzar-muted">{mins}m</span>
                        <div className="w-full max-w-[44px] flex-1 flex items-end">
                          <div
                            style={{ height: `${pct}%` }}
                            className="w-full rounded-t-lg bg-brand-grad transition-all"
                          />
                        </div>
                        <span className="text-[10px] sm:text-[11px] font-medium text-sanzar-text2 truncate">{d.day.slice(5)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>

            {/* Subject Breakdown */}
            {p.bySubject.length > 0 && (
              <section className="sanzar-card p-5 space-y-3">
                <h2 className="font-bold text-base">{t('bySubject')}</h2>
                <div className="space-y-3">
                  {(() => {
                    const maxSub = Math.max(60, ...p.bySubject.map((s) => s.sec));
                    return p.bySubject.map((s) => {
                      const sub = cat?.subjects.find((x) => x.id === s.subjectId);
                      const col = colorForSubject(s.subjectId);
                      const pct = Math.round((s.sec / maxSub) * 100);
                      return (
                        <div key={s.subjectId} className="flex items-center gap-2.5 sm:gap-3 text-xs">
                          <span className="w-20 sm:w-28 font-semibold truncate shrink-0">
                            {localizedName(sub, lang, s.subjectId)}
                          </span>
                          <div className="flex-1 h-2.5 rounded-full bg-sanzar-surface2 overflow-hidden">
                            <div
                              style={{ width: `${pct}%`, backgroundColor: col }}
                              className="h-full rounded-full"
                            />
                          </div>
                          <span className="w-14 sm:w-16 text-right font-semibold text-sanzar-muted shrink-0">
                            {t('minutes', { n: Math.round(s.sec / 60) })}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </section>
            )}

            {/* Achievements Grid */}
            <section className="space-y-3">
              <h2 className="font-bold text-base">{t('achievements')}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {p.achievements.map((a) => {
                  const unlocked = a.unlockedAt != null;
                  return (
                    <div
                      key={a.id}
                      className={`sanzar-card p-4 flex items-center gap-3 ${
                        unlocked ? 'border-sanzar-gold/50' : 'opacity-65'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          unlocked
                            ? 'bg-sanzar-gold/20 text-sanzar-gold'
                            : 'bg-sanzar-surface2 text-sanzar-muted'
                        }`}
                      >
                        {unlocked ? <Award className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{a.title}</p>
                        <p className="text-xs text-sanzar-muted line-clamp-2">{a.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )
      ) : (
        /* Leaderboard */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-sanzar-border bg-sanzar-surface p-1 gap-1">
              {(['weekly', 'monthly', 'all'] as const).map((pr) => (
                <button
                  key={pr}
                  onClick={() => setPeriod(pr)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    period === pr ? 'bg-sanzar-primary text-sanzar-onPrimary' : 'text-sanzar-text2'
                  }`}
                >
                  {pr === 'weekly' ? t('weekly') : pr === 'monthly' ? t('monthly') : t('allTime')}
                </button>
              ))}
            </div>
            {profile?.level_id && (
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={myClassOnly}
                  onChange={(e) => setMyClassOnly(e.target.checked)}
                  className="rounded accent-sanzar-primary"
                />
                {t('myClassOnly')}
              </label>
            )}
          </div>

          {lbQuery.isLoading ? (
            <LoadingState />
          ) : lbQuery.isError || (lbQuery.data?.entries.length ?? 0) === 0 ? (
            <div className="sanzar-card p-8 text-center text-sm text-sanzar-muted space-y-2">
              <p>{t('noRanking')}</p>
              {lbQuery.isError && (
                <button
                  onClick={() => lbQuery.refetch()}
                  className="sanzar-pill gap-1 text-sanzar-primary hover:opacity-90"
                >
                  <RefreshCw className="w-3 h-3" /> {t('retry')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {lbQuery.data?.me && (
                <p className="text-sm font-bold text-sanzar-primary">
                  {t('yourRank', { n: lbQuery.data.me.rank })}
                </p>
              )}
              {lbQuery.data!.entries.map((entry) => (
                <div
                  key={`${entry.rank}-${entry.uid || entry.name}`}
                  className={`sanzar-card p-3.5 flex items-center justify-between gap-3 ${
                    entry.me ? 'bg-sanzar-primarySoft border-sanzar-primary/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0 ${
                        entry.rank === 1
                          ? 'bg-sanzar-gold text-white'
                          : entry.rank === 2
                            ? 'bg-slate-300 text-slate-900'
                            : entry.rank === 3
                              ? 'bg-amber-600 text-white'
                              : 'bg-sanzar-surface2 text-sanzar-text2'
                      }`}
                    >
                      {entry.rank}
                    </div>
                    <span className="font-bold text-sm truncate">{entry.name}</span>
                  </div>
                  <span className="font-extrabold text-sm text-sanzar-primary shrink-0">
                    {t('xpTotal', { n: entry.xp })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
