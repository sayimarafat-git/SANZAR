import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject, localizedName } from '../../lib/i18n';
import { LEVELS } from '../../lib/models';
import { BookCover, ErrorRetry, LoadingState } from '../../components/SanzarUI';

export const LibraryPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { lang, t } = useSettings();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>(profile?.level_id || 'all');
  const selectedSubject = params.get('subject') || '';

  const catQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalogWithCache,
    enabled: !!user,
    staleTime: 60_000,
  });

  const cat = catQuery.data?.catalog;

  const baseBooks = useMemo(() => {
    if (!cat) return [];
    if (selectedLevel === 'all') return cat.books;
    return cat.books.filter((b) => !b.levels.length || b.levels.includes(selectedLevel));
  }, [cat, selectedLevel]);

  const subjects = useMemo(() => {
    if (!cat) return [];
    return cat.subjects.filter((s) => baseBooks.some((b) => b.subjectId === s.id));
  }, [cat, baseBooks]);

  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseBooks.filter(
      (b) =>
        (!selectedSubject || b.subjectId === selectedSubject) &&
        (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
    );
  }, [baseBooks, selectedSubject, query]);

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('library')}</h1>
        <p className="text-sm text-sanzar-text2">{t('guestMode')}</p>
        <Link
          to="/login"
          className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
        >
          {t('signIn')}
        </Link>
      </div>
    );
  }

  if (catQuery.isLoading) return <LoadingState />;
  if (catQuery.isError && !cat) {
    return <ErrorRetry message={t('err.network')} onRetry={() => catQuery.refetch()} />;
  }

  const levelOptions = cat?.levels?.length
    ? cat.levels
    : LEVELS.map((l) => ({ id: l.id, name_en: l.name, name_bn: l.name_bn, name_zh: l.name_zh }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('library')}</h1>
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="sanzar-input pl-10 text-sm"
          />
        </div>
      </div>

      {/* Class Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedLevel('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
            selectedLevel === 'all'
              ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
              : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
          }`}
        >
          {t('allClasses')}
        </button>
        {levelOptions.map((lvl) => (
          <button
            key={lvl.id}
            onClick={() => setSelectedLevel(lvl.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              selectedLevel === lvl.id
                ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
            }`}
          >
            {localizedName(lvl, lang, lvl.id)}
          </button>
        ))}
      </div>

      {/* Subject Filter Chips */}
      {subjects.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setParams({})}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap border transition ${
              !selectedSubject
                ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                : 'bg-sanzar-surface border-sanzar-border text-sanzar-muted hover:text-sanzar-text'
            }`}
          >
            {t('seeAll')}
          </button>
          {subjects.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setParams(selectedSubject === sub.id ? {} : { subject: sub.id })}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap border flex items-center gap-1.5 transition ${
                selectedSubject === sub.id
                  ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40'
                  : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colorForSubject(sub.id) }}
              />
              {localizedName(sub, lang)}
            </button>
          ))}
        </div>
      )}

      {/* Book Grid */}
      {books.length === 0 ? (
        <div className="sanzar-card p-10 text-center text-sm text-sanzar-muted">{t('noBooks')}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((b) => {
            const sub = cat?.subjects.find((s) => s.id === b.subjectId);
            return (
              <Link
                key={b.id}
                to={`/learn/book/${b.id}`}
                className="sanzar-card p-3.5 flex items-center gap-4 hover:border-sanzar-primary/50 transition group"
              >
                <BookCover colors={b.cover} title={b.title} className="w-16 h-22 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <h2 className="font-bold text-sm truncate group-hover:text-sanzar-primary transition">
                    {b.title}
                  </h2>
                  {b.author && <p className="text-xs text-sanzar-muted truncate">{b.author}</p>}
                  <div className="flex items-center gap-1.5 text-xs text-sanzar-text2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: colorForSubject(b.subjectId) }}
                    />
                    <span className="truncate">
                      {localizedName(sub, lang, b.subjectId)} · {t('chapters', { n: b.chapters.length })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sanzar-muted shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
