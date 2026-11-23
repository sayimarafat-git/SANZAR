import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Flame,
  Star,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  Trophy,
  Megaphone,
  ChevronRight,
  CloudOff,
  BookOpen,
  BookA,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest, fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject, localizedName } from '../../lib/i18n';
import { LEVELS, type ProgressData } from '../../lib/models';
import { BookCover, BrandMark, LoadingState, SubjectIcon } from '../../components/SanzarUI';
import { AnalogFocusTimer } from '../../components/AnalogFocusTimer';

export const HomePage: React.FC = () => {
  const { user, profile } = useAuth();
  const { lang, t } = useSettings();

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const progQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => apiRequest<ProgressData>('/v1/progress'),
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
  });

  const cat = catQuery.data?.catalog;
  const offline = catQuery.data?.offline ?? false;
  const prog = progQuery.data;
  const levelId = profile?.level_id ?? null;
  const firstName = profile?.display_name?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const levelLabel =
    localizedName(cat?.levels.find((l) => l.id === levelId), lang) ||
    LEVELS.find((l) => l.id === levelId)?.name ||
    null;

  // Unauthenticated welcome landing matching Sanzar onboarding
  if (!user) {
    return (
      <div className="space-y-8">
        <section className="bg-hero-grad text-white rounded-3xl p-8 sm:p-12 shadow-lg relative overflow-hidden">
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center gap-3">
              <BrandMark size={44} />
              <span className="font-extrabold text-xl tracking-wide">SANZAR</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
              {t('onb1.title')}
            </h1>
            <p className="text-white/80 text-base sm:text-lg leading-relaxed">
              {t('onb1.body')}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/register"
                className="px-6 py-3 rounded-xl bg-white text-sanzar-forest font-bold text-sm shadow hover:bg-white/90 transition"
              >
                {t('getStarted')}
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/10 transition"
              >
                {t('signIn')}
              </Link>
            </div>
          </div>
        </section>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { title: t('onb1.title'), body: t('onb1.body'), icon: BookOpen },
            { title: t('onb2.title'), body: t('onb2.body'), icon: Sparkles },
            { title: t('onb3.title'), body: t('onb3.body'), icon: Star },
          ].map((c, idx) => (
            <div key={idx} className="sanzar-card p-6 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center">
                <c.icon className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-base">{c.title}</h2>
              <p className="text-sm text-sanzar-text2 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const bannerCfg = cat?.config?.banner as { enabled?: boolean; text?: string; expires_at?: number | null } | undefined;
  const activeBanner = bannerCfg && typeof bannerCfg === 'object'
    ? (bannerCfg.enabled !== false &&
       typeof bannerCfg.text === 'string' &&
       bannerCfg.text.trim() &&
       (!bannerCfg.expires_at || bannerCfg.expires_at > Date.now())
         ? bannerCfg.text.trim()
         : '')
    : typeof cat?.config?.notice === 'string'
      ? cat.config.notice.trim()
      : '';

  const booksForLevel = cat
    ? levelId
      ? cat.books.filter((b) => !b.levels.length || b.levels.includes(levelId))
      : cat.books
    : [];

  const featuredBooks = booksForLevel
    .filter((b) => b.featuredRank != null)
    .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999));

  const activeSubjects = cat
    ? cat.subjects.filter((s) => booksForLevel.some((b) => b.subjectId === s.id))
    : [];

  const goalPct = prog ? Math.min(100, Math.round((prog.todaySec / (prog.goalSec || 3600)) * 100)) : 0;
  const todayMin = prog ? Math.floor(prog.todaySec / 60) : 0;
  const goalMin = prog ? Math.round((prog.goalSec || 3600) / 60) : 60;

  return (
    <div className="space-y-6">
      {activeBanner && (
        <div className="sanzar-card p-3.5 bg-sanzar-primarySoft/60 border-sanzar-primary/30 flex items-center gap-2.5 text-sm font-medium text-sanzar-primary">
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>{activeBanner}</span>
        </div>
      )}

      {/* Hero Gradient Banner */}
      <section className="bg-hero-grad text-white rounded-3xl p-7 sm:p-10 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {levelLabel && (
                <span className="px-3 py-0.5 rounded-full bg-white/15 text-xs font-semibold backdrop-blur">
                  {levelLabel}
                </span>
              )}
              {offline && (
                <span className="px-3 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-xs font-semibold flex items-center gap-1">
                  <CloudOff className="w-3.5 h-3.5" /> {t('offline')}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {t('hello', { name: firstName })}
            </h1>
            <p className="text-white/80 text-sm sm:text-base">{t('tagline')}</p>
          </div>

          {prog && (
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur flex items-center gap-2 text-sm font-semibold">
                <Flame className="w-4 h-4 text-sanzar-warning" />
                <span>{t('streak', { n: prog.streak })}</span>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur flex items-center gap-2 text-sm font-semibold">
                <Star className="w-4 h-4 text-sanzar-gold" />
                <span>
                  {t('levelN', { n: prog.level })} · {t('xpTotal', { n: prog.xp })}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Daily Study Goal & Analog Focus Timer (under Streak & XP) */}
      <div className={`grid gap-4 ${prog ? 'md:grid-cols-2 items-stretch' : ''}`}>
        {prog && (
          <Link to="/progress" className="sanzar-card p-4 hover:border-sanzar-primary/50 transition flex items-center">
            <div className="flex items-center gap-3.5 w-full">
              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="33"
                    fill="none"
                    stroke="var(--primary-soft)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="33"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 33}
                    strokeDashoffset={2 * Math.PI * 33 * (1 - goalPct / 100)}
                  />
                </svg>
                <span className="absolute font-extrabold text-sm">{todayMin}′</span>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{t('today')}</span>
                  <span className="text-xs font-semibold text-sanzar-primary">{goalPct}%</span>
                </div>
                <p className="text-xs text-sanzar-text2">{t('goalOf', { m: todayMin, g: goalMin })}</p>
                <div className="h-1.5 rounded-full bg-sanzar-primarySoft overflow-hidden">
                  <div className="h-full bg-brand-grad rounded-full transition-all" style={{ width: `${goalPct}%` }} />
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
            </div>
          </Link>
        )}
        <AnalogFocusTimer />
      </div>

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">{t('quickActions')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/library', label: t('library'), icon: BookOpen },
            { to: '/dictionary', label: t('dictionary'), icon: BookA },
            { to: '/exams', label: t('exams'), icon: ClipboardCheck },
            { to: '/progress?tab=leaderboard', label: t('leaderboard'), icon: Trophy },
          ].map((qa) => (
            <Link
              key={qa.to}
              to={qa.to}
              className="sanzar-card p-4 flex items-center gap-3 hover:border-sanzar-primary/50 transition"
            >
              <div className="w-11 h-11 rounded-xl bg-sanzar-primarySoft text-sanzar-primary flex items-center justify-center shrink-0">
                <qa.icon className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm truncate">{qa.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {catQuery.isLoading ? (
        <LoadingState />
      ) : catQuery.isError && !cat ? (
        <div className="sanzar-card p-6 text-center text-sm text-sanzar-muted space-y-2">
          <p>{t('noBooks')}</p>
          <button
            onClick={() => catQuery.refetch()}
            className="sanzar-pill text-sanzar-primary hover:opacity-90"
          >
            {t('retry')}
          </button>
        </div>
      ) : cat ? (
        <>
          {/* Announcements */}
          {cat.announcements.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold">{t('announcements')}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.announcements.slice(0, 6).map((a) => (
                  <div key={a.id} className="sanzar-card p-4 space-y-1.5">
                    <h3 className="font-bold text-sm truncate">{a.title}</h3>
                    <p className="text-xs text-sanzar-text2 line-clamp-3 leading-relaxed">{a.body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Subjects Grid */}
          {activeSubjects.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-bold">{t('subjects')}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {activeSubjects.map((sub) => {
                  const col = colorForSubject(sub.id);
                  return (
                    <Link
                      key={sub.id}
                      to={`/library?subject=${encodeURIComponent(sub.id)}`}
                      className="sanzar-card p-3 flex flex-col items-center text-center gap-2 hover:border-sanzar-primary/50 transition"
                    >
                      <div
                        style={{ backgroundColor: `${col}22` }}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      >
                        <SubjectIcon icon={sub.icon} color={col} className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-semibold line-clamp-2">
                        {localizedName(sub, lang)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Featured Books */}
          {featuredBooks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">{t('featured')}</h2>
                <Link to="/library" className="text-sm font-semibold text-sanzar-primary hover:underline">
                  {t('seeAll')}
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 items-end">
                {featuredBooks.map((b) => (
                  <Link
                    key={b.id}
                    to={`/learn/book/${b.id}`}
                    className="group space-y-2 flex flex-col"
                  >
                    <div className="w-full h-44 flex items-end justify-center">
                      <BookCover
                        colors={b.cover}
                        title={b.title}
                        imageUrl={b.coverImage}
                        aspectRatio={b.coverRatio}
                        previewDoc={b.previewDoc}
                        size="card"
                        className="w-full max-h-44 group-hover:scale-[1.02] transition-transform"
                      />
                    </div>
                    <div>
                      <p className="font-bold text-sm line-clamp-1">{b.title}</p>
                      <p className="text-xs text-sanzar-muted">
                        {t('chapters', { n: b.chapters.length })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
};
