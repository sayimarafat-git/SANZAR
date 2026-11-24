import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookA,
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Copy,
  Globe,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest, errorText } from '../../lib/api-client';
import type {
  DictLangCode,
  DictionaryEntry,
  SavedVocabularyItem,
  TranslationHistoryItem,
  TranslationResult,
} from '../../lib/models';
import { LoadingState, Modal } from '../../components/SanzarUI';
import {
  addLocalTranslationHistory,
  deleteLocalTranslationHistory,
  deleteLocalVocabularyItem,
  getCachedTranslation,
  getLocalSavedVocabulary,
  getLocalTranslationHistory,
  putCachedTranslation,
  saveLocalVocabularyItem,
  syncSavedVocabulary,
  syncTranslationHistory,
} from './dictionary-db';

const LANG_OPTIONS: { code: DictLangCode; label: string; short: string }[] = [
  { code: 'bn', label: 'বাংলা', short: 'BN' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh-Hans', label: '简体中文', short: '中文' },
];

const HSK_OPTIONS = ['', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
const POS_OPTIONS = ['', 'noun', 'verb', 'adjective', 'adverb', 'phrase'];

function langLabel(code: string): string {
  if (code === 'zh' || code === 'zh-Hans') return '简体中文';
  if (code === 'bn') return 'বাংলা';
  return 'English';
}

function langShort(code: string): string {
  if (code === 'zh' || code === 'zh-Hans') return '中文';
  if (code === 'bn') return 'BN';
  return 'EN';
}

function toCanonicalLang(code: string): DictLangCode {
  if (code === 'zh' || code === 'zh-Hans') return 'zh-Hans';
  if (code === 'bn') return 'bn';
  return 'en';
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-sanzar-primarySoft text-sanzar-primary rounded px-0.5 font-semibold">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function speakText(text: string, langCode: DictLangCode | 'zh') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langCode === 'zh-Hans' || langCode === 'zh' ? 'zh-CN' : langCode === 'bn' ? 'bn-BD' : 'en-US';
  window.speechSynthesis.speak(u);
}

export const DictionaryPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useSettings();
  const uid = user?.uid || '';

  const [activeTab, setActiveTab] = useState<'dictionary' | 'saved' | 'history'>('dictionary');

  // Unified search + inline translation state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [targetLang, setTargetLang] = useState<DictLangCode>('bn');
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dictionary filters & pagination
  const [langFilter, setLangFilter] = useState<'all' | DictLangCode>('all');
  const [hskFilter, setHskFilter] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [dictLoading, setDictLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);

  // Saved vocabulary & History (IndexedDB + D1 sync, isolated by UID)
  const [savedItems, setSavedItems] = useState<SavedVocabularyItem[]>([]);
  const [historyItems, setHistoryItems] = useState<TranslationHistoryItem[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Clear translation when search is cleared
  useEffect(() => {
    if (!query.trim()) {
      setTranslation(null);
      setTranslateError(null);
    }
  }, [query]);

  // Load & sync personal data when account changes (strict UID isolation)
  useEffect(() => {
    if (!uid) {
      setSavedItems([]);
      setHistoryItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [localSaved, localHist] = await Promise.all([
        getLocalSavedVocabulary(uid),
        getLocalTranslationHistory(uid),
      ]);
      if (!cancelled) {
        setSavedItems(localSaved);
        setHistoryItems(localHist);
      }
      const [syncedSaved, syncedHist] = await Promise.all([
        syncSavedVocabulary(uid),
        syncTranslationHistory(uid),
      ]);
      if (!cancelled) {
        setSavedItems(syncedSaved);
        setHistoryItems(syncedHist);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Fetch curated dictionary entries
  const fetchDictionary = useCallback(
    async (cursor?: string | null) => {
      const isMore = Boolean(cursor);
      if (isMore) setLoadingMore(true);
      else setDictLoading(true);
      setDictError(null);

      try {
        const qs = new URLSearchParams();
        if (langFilter !== 'all') qs.set('lang', langFilter);
        if (debouncedQuery) qs.set('q', debouncedQuery);
        if (hskFilter) qs.set('hsk_level', hskFilter);
        if (posFilter) qs.set('part_of_speech', posFilter);
        qs.set('limit', '40');
        if (cursor) qs.set('cursor', cursor);

        const data = await apiRequest<{
          entries: DictionaryEntry[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(`/v1/dictionary?${qs.toString()}`);

        setEntries((prev) => (isMore ? [...prev, ...data.entries] : data.entries));
        setNextCursor(data.nextCursor);
        setHasMore(Boolean(data.hasMore));
      } catch (e) {
        setDictError(errorText(e));
      } finally {
        setDictLoading(false);
        setLoadingMore(false);
      }
    },
    [langFilter, debouncedQuery, hskFilter, posFilter]
  );

  useEffect(() => {
    if (activeTab === 'dictionary') {
      void fetchDictionary(null);
    }
  }, [activeTab, fetchDictionary]);

  const savedEntryIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const item of savedItems) {
      if (item.dictionary_entry_id) s.add(item.dictionary_entry_id);
      s.add(item.id);
    }
    return s;
  }, [savedItems]);

  const handleToggleSaveEntry = async (entry: DictionaryEntry) => {
    if (!uid) return;
    const existing = savedItems.find((s) => s.dictionary_entry_id === entry.id || s.id === entry.id);
    if (existing) {
      await deleteLocalVocabularyItem(uid, existing.id);
      setSavedItems((prev) => prev.filter((x) => x.id !== existing.id));
      void syncSavedVocabulary(uid).then(setSavedItems);
      return;
    }
    const nowMs = Date.now();
    const meaning = [entry.meaning_en, entry.meaning_bn, entry.meaning_zh].filter(Boolean).join(' · ');
    const newItem: SavedVocabularyItem = {
      id: `sv_${entry.id}`,
      dictionary_entry_id: entry.id,
      source_language: toCanonicalLang(entry.language),
      target_language: entry.language === 'en' ? 'bn' : 'en',
      word: entry.word,
      phonetic: entry.phonetic,
      meaning,
      example: entry.example,
      hsk_level: entry.hsk_level,
      part_of_speech: entry.part_of_speech,
      created_at: nowMs,
      updated_at: nowMs,
    };
    await saveLocalVocabularyItem(uid, newItem);
    setSavedItems((prev) => [newItem, ...prev]);
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleSaveTranslationResult = async () => {
    if (!uid || !translation || !query.trim()) return;
    const nowMs = Date.now();
    const id = `sv_tr_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const newItem: SavedVocabularyItem = {
      id,
      dictionary_entry_id: null,
      source_language: translation.sourceLanguage,
      target_language: translation.targetLanguage,
      word: query.trim().slice(0, 200),
      meaning: translation.translatedText.slice(0, 1000),
      created_at: nowMs,
      updated_at: nowMs,
    };
    await saveLocalVocabularyItem(uid, newItem);
    setSavedItems((prev) => [newItem, ...prev]);
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleDeleteSaved = async (id: string) => {
    if (!uid) return;
    await deleteLocalVocabularyItem(uid, id);
    setSavedItems((prev) => prev.filter((x) => x.id !== id));
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleDeleteHistory = async (id: string) => {
    if (!uid) return;
    await deleteLocalTranslationHistory(uid, id);
    setHistoryItems((prev) => prev.filter((x) => x.id !== id));
    void syncTranslationHistory(uid).then(setHistoryItems);
  };

  const handleTranslate = async (overrideTarget?: DictLangCode) => {
    const clean = query.trim();
    if (!clean) return;
    const tgt = overrideTarget || targetLang;
    if (!uid) {
      setTranslateError('Sign in to translate words and sentences.');
      return;
    }

    setTranslating(true);
    setTranslateError(null);

    try {
      const sourceParam = langFilter !== 'all' ? langFilter : 'auto';
      if (sourceParam !== 'auto') {
        const cached = await getCachedTranslation(sourceParam, tgt, clean);
        if (cached) {
          setTranslation({
            translatedText: cached.translatedText,
            sourceLanguage: cached.sourceLanguage,
            targetLanguage: cached.targetLanguage,
            detectedSourceLanguage: cached.sourceLanguage,
            confidence: 1,
            provider: cached.provider,
            fromCache: true,
          });
          setTranslating(false);
          return;
        }
      }

      const res = await apiRequest<TranslationResult>('/v1/translation', {
        method: 'POST',
        bodyJson: {
          text: clean,
          sourceLanguage: sourceParam,
          targetLanguage: tgt,
        },
      });

      setTranslation(res);

      void putCachedTranslation({
        sourceLanguage: res.sourceLanguage,
        targetLanguage: res.targetLanguage,
        sourceText: clean,
        translatedText: res.translatedText,
        provider: res.provider,
      });

      const nowMs = Date.now();
      const histItem = await addLocalTranslationHistory(uid, {
        id: `th_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
        source_language: res.sourceLanguage,
        target_language: res.targetLanguage,
        source_text: clean,
        translated_text: res.translatedText,
        provider: res.provider,
        created_at: nowMs,
        updated_at: nowMs,
      });
      setHistoryItems((prev) => [histItem, ...prev]);
      void syncTranslationHistory(uid).then(setHistoryItems);
    } catch (e) {
      setTranslateError(errorText(e));
    } finally {
      setTranslating(false);
    }
  };

  const handleReopenHistory = (item: TranslationHistoryItem) => {
    setQuery(item.source_text);
    setTargetLang(item.target_language);
    setTranslation({
      translatedText: item.translated_text,
      sourceLanguage: item.source_language,
      targetLanguage: item.target_language,
      detectedSourceLanguage: item.source_language,
      confidence: 1,
      provider: item.provider || 'history',
      fromCache: true,
    });
    setTranslateError(null);
    setActiveTab('dictionary');
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <BookA className="w-6 h-6 text-sanzar-primary" />
            <span>{t('dictionary')}</span>
          </h1>
          <p className="text-xs text-sanzar-muted mt-0.5">
            Search & translate English · বাংলা · 简体中文 words, phrases, or sentences
          </p>
        </div>
        {!user && (
          <Link
            to="/login"
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold"
          >
            {t('signIn')} to Sync
          </Link>
        )}
      </div>

      {/* 3 Clean Tabs: Dictionary, Saved, History */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: 'dictionary', label: 'Dictionary', icon: BookA },
            { k: 'saved', label: `Saved (${savedItems.length})`, icon: BookmarkCheck },
            { k: 'history', label: `History (${historyItems.length})`, icon: Clock },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.k;
          return (
            <button
              key={tab.k}
              type="button"
              onClick={() => setActiveTab(tab.k)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                active
                  ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                  : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== TAB 1: UNIFIED DICTIONARY + INLINE TRANSLATION ==================== */}
      {activeTab === 'dictionary' && (
        <div className="space-y-4">
          {/* Unified Search + Translate + Filters Card */}
          <div className="sanzar-card p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && query.trim()) {
                      e.preventDefault();
                      void handleTranslate();
                    }
                  }}
                  placeholder="Search word, Pinyin, or enter a sentence to translate…"
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

              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label="Translate to language"
                  value={targetLang}
                  onChange={(e) => {
                    const next = e.target.value as DictLangCode;
                    setTargetLang(next);
                    if (query.trim() && translation) void handleTranslate(next);
                  }}
                  className="sanzar-input text-xs font-semibold py-2 w-auto"
                >
                  {LANG_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code}>
                      → {l.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={translating || !query.trim()}
                  onClick={() => void handleTranslate()}
                  className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Translate
                </button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { k: 'all', label: t('allWords') },
                  { k: 'zh-Hans', label: '简体中文' },
                  { k: 'en', label: 'English' },
                  { k: 'bn', label: 'বাংলা' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.k}
                  type="button"
                  onClick={() => setLangFilter(tab.k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    langFilter === tab.k
                      ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                      : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <select
                aria-label="Filter by HSK level"
                value={hskFilter}
                onChange={(e) => setHskFilter(e.target.value)}
                className="sanzar-input text-xs py-1.5 w-auto"
              >
                {HSK_OPTIONS.map((h) => (
                  <option key={h || 'all'} value={h}>
                    {h || 'All HSK'}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by part of speech"
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
                className="sanzar-input text-xs py-1.5 w-auto"
              >
                {POS_OPTIONS.map((p) => (
                  <option key={p || 'all'} value={p}>
                    {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All POS'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inline Translation Error */}
          {translateError && (
            <div className="p-3 rounded-xl bg-sanzar-danger/10 border border-sanzar-danger/30 text-xs text-sanzar-danger flex items-center justify-between gap-2">
              <span>{translateError}</span>
              {uid && (
                <button type="button" onClick={() => void handleTranslate()} className="underline font-semibold shrink-0">
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Inline Translation Result Card (top of search results) */}
          {translation && (
            <div className="sanzar-card p-4 sm:p-5 border-sanzar-primary/40 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="sanzar-pill">
                      {langShort(translation.sourceLanguage)} → {langShort(translation.targetLanguage)}
                    </span>
                    <span className="sanzar-pill text-sanzar-primary gap-1">
                      <Globe className="w-3 h-3" />
                      {translation.fromCache ? 'Cached' : `Translation (${translation.provider})`}
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-sanzar-text whitespace-pre-wrap">
                    {translation.translatedText}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => speakText(translation.translatedText, translation.targetLanguage)}
                    title="Listen"
                    aria-label="Listen"
                    className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(translation.translatedText)}
                    title="Copy"
                    aria-label="Copy"
                    className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-text2"
                  >
                    {copied ? <Check className="w-4 h-4 text-sanzar-primary" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {uid && (
                    <button
                      type="button"
                      onClick={() => void handleSaveTranslationResult()}
                      title="Save to vocabulary"
                      aria-label="Save to vocabulary"
                      className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Curated Dictionary Results */}
          {dictError && (
            <div className="sanzar-card p-4 text-xs text-sanzar-danger flex items-center justify-between">
              <span>{dictError}</span>
              <button type="button" onClick={() => void fetchDictionary(null)} className="underline font-semibold">
                Retry
              </button>
            </div>
          )}

          {dictLoading ? (
            <LoadingState />
          ) : entries.length === 0 && !translation ? (
            <div className="sanzar-card p-10 text-center space-y-2">
              <p className="text-sm text-sanzar-muted">{t('noWordsFound')}</p>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => void handleTranslate()}
                  className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Translate "{query.trim()}" to {langLabel(targetLang)}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3.5">
                {entries.map((entry) => {
                  const isSaved = savedEntryIdSet.has(entry.id);
                  return (
                    <article
                      key={entry.id}
                      onClick={() => setDetailEntry(entry)}
                      className="sanzar-card p-4 sm:p-5 space-y-2.5 flex flex-col justify-between cursor-pointer hover:border-sanzar-primary/40 transition"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h2 className="text-lg font-extrabold text-sanzar-text">
                                {highlightMatch(entry.word, debouncedQuery)}
                              </h2>
                              {entry.phonetic && (
                                <span className="text-xs font-semibold text-sanzar-primary">
                                  {highlightMatch(entry.phonetic, debouncedQuery)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className="sanzar-pill">{langShort(entry.language)}</span>
                              {entry.part_of_speech && <span className="sanzar-pill">{entry.part_of_speech}</span>}
                              {entry.hsk_level && <span className="sanzar-pill published">{entry.hsk_level}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => speakText(entry.word, toCanonicalLang(entry.language))}
                              title={t('pronounce')}
                              aria-label={t('pronounce')}
                              className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary transition"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            {uid && (
                              <button
                                type="button"
                                onClick={() => void handleToggleSaveEntry(entry)}
                                aria-label={t('savedWords')}
                                className={`p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 transition ${
                                  isSaved ? 'text-sanzar-primary bg-sanzar-primarySoft/60' : 'text-sanzar-muted'
                                }`}
                              >
                                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 text-sm pt-1">
                          {entry.meaning_en && (
                            <p className="text-sanzar-text">
                              <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">EN</span>
                              {highlightMatch(entry.meaning_en, debouncedQuery)}
                            </p>
                          )}
                          {entry.meaning_bn && (
                            <p className="text-sanzar-text2">
                              <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">BN</span>
                              {highlightMatch(entry.meaning_bn, debouncedQuery)}
                            </p>
                          )}
                          {entry.meaning_zh && (
                            <p className="text-sanzar-text2">
                              <span className="text-[11px] font-bold text-sanzar-muted mr-1.5">中文</span>
                              {highlightMatch(entry.meaning_zh, debouncedQuery)}
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

              {hasMore && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void fetchDictionary(nextCursor)}
                    className="px-5 py-2.5 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-2"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Load more words
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 2: SAVED VOCABULARY ==================== */}
      {activeTab === 'saved' && (
        <div className="space-y-3">
          {!uid ? (
            <div className="sanzar-card p-8 text-center space-y-3">
              <p className="text-sm text-sanzar-text2">Sign in to save vocabulary and sync across Web and Android.</p>
              <Link
                to="/login"
                className="inline-block px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : savedItems.length === 0 ? (
            <div className="sanzar-card p-10 text-center text-sm text-sanzar-muted">
              No saved vocabulary yet. Save words or translations from the Dictionary to build your personal list.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3.5">
              {savedItems.map((item) => (
                <article key={item.id} className="sanzar-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="text-base font-extrabold">{item.word}</h3>
                        {item.phonetic && <span className="text-xs text-sanzar-primary font-semibold">{item.phonetic}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="sanzar-pill">{langShort(item.source_language)}</span>
                        {item.hsk_level && <span className="sanzar-pill published">{item.hsk_level}</span>}
                        {item.sync_status === 'pending' && <span className="sanzar-pill">Pending sync</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => speakText(item.word, item.source_language)}
                        aria-label="Listen"
                        className="p-1.5 rounded-lg border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSaved(item.id)}
                        aria-label="Remove saved word"
                        className="p-1.5 rounded-lg border border-sanzar-danger/30 text-sanzar-danger hover:bg-sanzar-danger/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {item.meaning && <p className="text-sm text-sanzar-text2">{item.meaning}</p>}
                  {item.example && <p className="text-xs text-sanzar-muted italic pt-1 border-t border-sanzar-border/60">{item.example}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: TRANSLATION HISTORY ==================== */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {!uid ? (
            <div className="sanzar-card p-8 text-center space-y-3">
              <p className="text-sm text-sanzar-text2">Sign in to view and synchronize your translation history.</p>
              <Link
                to="/login"
                className="inline-block px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="sanzar-card p-10 text-center text-sm text-sanzar-muted">
              No translation history yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleReopenHistory(item)}
                  className="sanzar-card p-4 flex items-start justify-between gap-3 cursor-pointer hover:border-sanzar-primary/40 transition"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="sanzar-pill">
                        {langShort(item.source_language)} → {langShort(item.target_language)}
                      </span>
                      <span className="text-[11px] text-sanzar-muted">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-sanzar-text truncate">{item.source_text}</p>
                    <p className="text-sm text-sanzar-text2 truncate">{item.translated_text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteHistory(item.id);
                    }}
                    aria-label="Delete history item"
                    className="p-2 rounded-xl border border-sanzar-danger/30 text-sanzar-danger hover:bg-sanzar-danger/10 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== VOCABULARY DETAIL MODAL ==================== */}
      {detailEntry && (
        <Modal title={detailEntry.word} onClose={() => setDetailEntry(null)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {detailEntry.phonetic && (
                  <span className="text-sm font-semibold text-sanzar-primary">{detailEntry.phonetic}</span>
                )}
                <span className="sanzar-pill">{langLabel(detailEntry.language)}</span>
                {detailEntry.part_of_speech && <span className="sanzar-pill">{detailEntry.part_of_speech}</span>}
                {detailEntry.hsk_level && <span className="sanzar-pill published">{detailEntry.hsk_level}</span>}
              </div>
              <button
                type="button"
                onClick={() => speakText(detailEntry.word, toCanonicalLang(detailEntry.language))}
                className="px-3 py-1.5 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-xs font-semibold text-sanzar-primary inline-flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" /> Pronounce
              </button>
            </div>

            <div className="space-y-2 text-sm">
              {detailEntry.meaning_en && (
                <p><span className="font-bold text-sanzar-muted mr-2">EN</span>{detailEntry.meaning_en}</p>
              )}
              {detailEntry.meaning_bn && (
                <p><span className="font-bold text-sanzar-muted mr-2">BN</span>{detailEntry.meaning_bn}</p>
              )}
              {detailEntry.meaning_zh && (
                <p><span className="font-bold text-sanzar-muted mr-2">中文</span>{detailEntry.meaning_zh}</p>
              )}
            </div>

            {detailEntry.example && (
              <div className="p-3 rounded-xl bg-sanzar-surface2 space-y-1 text-xs">
                <p className="font-semibold text-sanzar-text">{detailEntry.example}</p>
                {detailEntry.example_translation && (
                  <p className="text-sanzar-muted">{detailEntry.example_translation}</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
