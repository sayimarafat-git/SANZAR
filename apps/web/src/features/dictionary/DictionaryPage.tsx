import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookA, Bookmark, BookmarkCheck, Globe, Search, Volume2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest } from '../../lib/api-client';
import type { DictionaryEntry } from '../../lib/models';
import { STARTER_WORDS } from './starter-words';
import { LoadingState } from '../../components/SanzarUI';

const K_SAVED = 'sanzar.dict.saved';

interface OnlineLookupResult {
  word: string;
  phonetic?: string;
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
}

export const DictionaryPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useSettings();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'zh' | 'en' | 'saved'>(() =>
    profile?.level_id === 'zh' ? 'zh' : profile?.level_id === 'en' ? 'en' : 'all'
  );
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(K_SAVED);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  const [onlineEntry, setOnlineEntry] = useState<OnlineLookupResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  const dictQuery = useQuery({
    queryKey: ['dictionary', filter === 'zh' || filter === 'en' ? filter : 'all', debouncedQuery],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter === 'zh' || filter === 'en') qs.set('lang', filter);
      if (debouncedQuery) qs.set('q', debouncedQuery);
      return apiRequest<{ entries: DictionaryEntry[] }>(`/v1/dictionary?${qs.toString()}`);
    },
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const mergedEntries = useMemo(() => {
    const apiList = dictQuery.data?.entries ?? [];
    const byKey = new Map<string, DictionaryEntry>();
    for (const s of STARTER_WORDS) {
      byKey.set(`${s.language}:${s.word.toLowerCase()}`, s);
    }
    for (const a of apiList) {
      byKey.set(`${a.language}:${a.word.toLowerCase()}`, a);
    }
    const q = query.trim().toLowerCase();
    return Array.from(byKey.values()).filter((e) => {
      if (filter === 'saved' && !savedSet.has(e.id)) return false;
      if ((filter === 'zh' || filter === 'en') && e.language !== filter) return false;
      if (!q) return true;
      return [e.word, e.phonetic, e.meaning_en, e.meaning_bn, e.meaning_zh, e.hsk_level]
        .some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [dictQuery.data, query, filter, savedSet]);

  useEffect(() => {
    const q = debouncedQuery;
    if (!q || !/^[a-zA-Z-]{2,40}$/.test(q) || filter === 'zh' || filter === 'saved') {
      setOnlineEntry(null);
      return;
    }
    const hasExact = mergedEntries.some(
      (e) => e.language === 'en' && e.word.toLowerCase() === q.toLowerCase()
    );
    if (hasExact) {
      setOnlineEntry(null);
      return;
    }
    let cancelled = false;
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((arr) => {
        if (cancelled) return;
        const first = Array.isArray(arr) ? arr[0] : null;
        if (first && first.word && Array.isArray(first.meanings)) {
          setOnlineEntry(first as OnlineLookupResult);
        } else {
          setOnlineEntry(null);
        }
      })
      .catch(() => {
        if (!cancelled) setOnlineEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filter, mergedEntries.length]);

  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(K_SAVED, JSON.stringify(next));
      return next;
    });
  };

  const speakWord = (text: string, langCode: 'zh' | 'en') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langCode === 'zh' ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(u);
  };

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <BookA className="w-10 h-10 text-sanzar-primary mx-auto" />
        <h1 className="text-xl font-bold">{t('dictionary')}</h1>
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

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <BookA className="w-6 h-6 text-sanzar-primary" />
            <span>{t('dictionary')}</span>
          </h1>
          <p className="text-xs text-sanzar-muted mt-0.5">{t('dictionarySubtitle')}</p>
        </div>
        <span className="sanzar-pill">{mergedEntries.length}</span>
      </div>

      {/* Unified Search + Filter Card */}
      <div className="sanzar-card p-3.5 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDictionary')}
            aria-label={t('searchDictionary')}
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

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { k: 'all', label: t('allWords') },
              { k: 'zh', label: '中文 Chinese' },
              { k: 'en', label: 'English' },
              { k: 'saved', label: `${t('savedWords')} (${savedIds.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setFilter(tab.k)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                filter === tab.k
                  ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                  : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {dictQuery.isLoading && mergedEntries.length === 0 ? (
        <LoadingState />
      ) : (
        <div className="space-y-3">
          {onlineEntry && (
            <div className="sanzar-card p-5 border-sanzar-primary/40 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-extrabold">{onlineEntry.word}</h2>
                    {onlineEntry.phonetic && (
                      <span className="text-xs font-medium text-sanzar-muted">{onlineEntry.phonetic}</span>
                    )}
                    <span className="sanzar-pill gap-1 text-sanzar-primary">
                      <Globe className="w-3 h-3" /> {t('onlineResult')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => speakWord(onlineEntry.word, 'en')}
                  aria-label={t('pronounce')}
                  className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                {onlineEntry.meanings.slice(0, 3).map((m, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <span className="text-xs font-bold uppercase text-sanzar-primary">{m.partOfSpeech}</span>
                    {m.definitions.slice(0, 2).map((d, j) => (
                      <p key={j} className="text-sanzar-text2">
                        • {d.definition}
                        {d.example && <span className="block text-xs text-sanzar-muted italic mt-0.5">"{d.example}"</span>}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mergedEntries.length === 0 && !onlineEntry ? (
            <div className="sanzar-card p-10 text-center text-sm text-sanzar-muted">
              {t('noWordsFound')}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3.5">
              {mergedEntries.map((entry) => {
                const isSaved = savedSet.has(entry.id);
                return (
                  <article key={entry.id} className="sanzar-card p-4 sm:p-5 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <h2 className="text-lg font-extrabold text-sanzar-text">{entry.word}</h2>
                            {entry.phonetic && (
                              <span className="text-xs font-semibold text-sanzar-primary">{entry.phonetic}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="sanzar-pill">{entry.language === 'zh' ? '中文' : 'EN'}</span>
                            {entry.part_of_speech && <span className="sanzar-pill">{entry.part_of_speech}</span>}
                            {entry.hsk_level && <span className="sanzar-pill published">{entry.hsk_level}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => speakWord(entry.word, entry.language)}
                            title={t('pronounce')}
                            aria-label={t('pronounce')}
                            className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary transition"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSave(entry.id)}
                            aria-label={t('savedWords')}
                            className={`p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 transition ${
                              isSaved ? 'text-sanzar-primary bg-sanzar-primarySoft/60' : 'text-sanzar-muted'
                            }`}
                          >
                            {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm pt-1">
                        {entry.meaning_en && (
                          <p className="text-sanzar-text">
                            <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">EN</span>
                            {entry.meaning_en}
                          </p>
                        )}
                        {entry.meaning_bn && (
                          <p className="text-sanzar-text2">
                            <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">BN</span>
                            {entry.meaning_bn}
                          </p>
                        )}
                        {entry.meaning_zh && (
                          <p className="text-sanzar-text2">
                            <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">中文</span>
                            {entry.meaning_zh}
                          </p>
                        )}
                      </div>
                    </div>

                    {entry.example && (
                      <div className="pt-2.5 border-t border-sanzar-border/70 text-xs space-y-0.5">
                        <p className="font-medium text-sanzar-text">{entry.example}</p>
                        {entry.example_translation && (
                          <p className="text-sanzar-muted">{entry.example_translation}</p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
