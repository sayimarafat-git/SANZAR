import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { fetchCatalogWithCache } from '../../lib/api-client';
import { colorForSubject, localizedName } from '../../lib/i18n';
import { LEVELS } from '../../lib/models';
import { BookCover, LoadingState } from '../../components/SanzarUI';

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
    retry: false,
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

  const levelOptions = cat?.levels?.length
    ? cat.levels
    : LEVELS.map((l) => ({ id: l.id, name_en: l.name, name_bn: l.name_bn, name_zh: l.name_zh }));

  return (
    <div className="space-y-5">
      {/* Clean Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">{t('library')}</h1>
          <span className="sanzar-pill">{t('booksCount', { n: books.length })}</span>
          {catQuery.isError && !cat && (
            <button
              onClick={() => catQuery.refetch()}
              className="sanzar-pill text-sanzar-primary hover:opacity-90"
            >
              {t('offline')} · {t('retry')}
            </button>
          )}
        </div>
      </div>

      {/* Unified Frosted Filter & Search Toolbar */}
      <div className="sanzar-card p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              className="sanzar-input pl-10 pr-9 text-sm"
            />
            {query && (
              <button
                type="button"
                aria-label={t('clearSearch')}
                onClick={() => setQuery('')}
                className="p-1 rounded-lg text-sanzar-muted hover:text-sanzar-text absolute right-2.5 top-1/2 -translate-y-1/2 z-10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setSelectedLevel('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                selectedLevel === 'all'
                  ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary shadow-sm'
                  : 'bg-sanzar-surface2/80 border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface'
              }`}
            >
              {t('allClasses')}
            </button>
            {levelOptions.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setSelectedLevel(lvl.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                  selectedLevel === lvl.id
                    ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary shadow-sm'
                    : 'bg-sanzar-surface2/80 border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface'
                }`}
              >
                {localizedName(lvl, lang, lvl.id)}
              </button>
            ))}
          </div>
        </div>

        {/* Subject Filter Chips */}
        {subjects.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 border-t border-sanzar-border/70">
            <button
              type="button"
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
                type="button"
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
      </div>

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
                <BookCover
                  colors={b.cover}
                  title={b.title}
                  imageUrl={b.coverImage}
                  aspectRatio={b.coverRatio}
                  previewDoc={b.previewDoc}
                  size="sm"
                />
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
