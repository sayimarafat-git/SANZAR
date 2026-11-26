import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { slugify, isId, type DictionaryEntry } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, StatusPill, useToast } from '../../components/SanzarUI';

interface AdminDictionaryStats {
  total: number;
  byHsk: Record<string, number>;
  byLang: Record<string, number>;
  byStatus: Record<string, number>;
}

interface AdminTranslationQuota {
  month: string;
  googleConfigured: boolean;
  charsUsed: number;
  charCap: number;
  charsRemaining: number;
  percentUsed: number;
  cache: { entries: number; totalHits: number };
}

interface AdminTranslationCacheItem {
  cacheKey: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  sourcePinyin: string;
  targetPinyin: string;
  provider: string;
  hits: number;
  reported: number;
  reportNote: string;
  updatedAt: number;
}

const HSK_LEVELS = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

export const AdminDictionaryPage: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'dictionary' | 'cache'>('dictionary');
  const [editing, setEditing] = useState<DictionaryEntry | null | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [hskFilter, setHskFilter] = useState('');

  const q = useQuery({
    queryKey: ['admin', 'dictionary', hskFilter, search.trim()],
    enabled: activeTab === 'dictionary',
    queryFn: () => {
      const qs = new URLSearchParams();
      if (hskFilter) qs.set('hsk_level', hskFilter);
      if (search.trim()) qs.set('q', search.trim());
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiRequest<{ entries: DictionaryEntry[]; stats?: AdminDictionaryStats }>(`/v1/admin/dictionary${suffix}`);
    },
  });

  const entries = q.data?.entries ?? [];
  const stats = q.data?.stats;

  const remove = async (id: string) => {
    try {
      await apiRequest(`/v1/admin/dictionary/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('Deleted');
      void qc.invalidateQueries({ queryKey: ['admin', 'dictionary'] });
    } catch (e) {
      toast(errorText(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">Dictionary</h1>
          <div className="inline-flex p-1 rounded-xl border border-sanzar-border bg-sanzar-surface2">
            {(
              [
                { k: 'dictionary', label: 'Dictionary' },
                { k: 'cache', label: 'Translation Cache' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setActiveTab(tab.k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === tab.k
                    ? 'bg-sanzar-surface text-sanzar-text shadow-sm'
                    : 'text-sanzar-text2 hover:text-sanzar-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'dictionary' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-sm font-semibold"
            >
              Import CSV / JSON
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
            >
              Add word
            </button>
          </div>
        )}
      </div>

      {activeTab === 'cache' ? (
        <TranslationCacheTab />
      ) : q.isLoading && !q.data ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>

      {/* Live Dataset Summary & Clickable Per-Level HSK Breakdown */}
      {stats && (
        <div className="sanzar-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-sm text-sanzar-text">
                {stats.total.toLocaleString()} total entries
              </span>
              {stats.byStatus?.published != null && (
                <span className="sanzar-pill published text-[11px]">
                  {stats.byStatus.published.toLocaleString()} published
                </span>
              )}
              {(stats.byStatus?.draft || 0) > 0 && (
                <span className="sanzar-pill draft text-[11px]">
                  {stats.byStatus.draft.toLocaleString()} draft
                </span>
              )}
            </div>
            {hskFilter && (
              <button
                type="button"
                onClick={() => setHskFilter('')}
                className="text-xs font-semibold text-sanzar-primary hover:underline"
              >
                Show all levels
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <button
              type="button"
              onClick={() => setHskFilter('')}
              className={`p-2.5 rounded-xl border text-left transition ${
                hskFilter === ''
                  ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                  : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:border-sanzar-primary/40'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">All</div>
              <div className="text-lg font-extrabold">{stats.total.toLocaleString()}</div>
            </button>
            {HSK_LEVELS.map((lvl) => {
              const count = stats.byHsk?.[lvl] || 0;
              const active = hskFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setHskFilter(active ? '' : lvl)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    active
                      ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                      : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:border-sanzar-primary/40'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{lvl}</div>
                  <div className="text-lg font-extrabold">{count.toLocaleString()}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CEFR_LEVELS.map((lvl) => {
              const count = stats.byHsk?.[lvl] || 0;
              const active = hskFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setHskFilter(active ? '' : lvl)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    active
                      ? 'bg-sanzar-primarySoft border-sanzar-primary/50 text-sanzar-primary'
                      : 'bg-sanzar-surface2/70 border-sanzar-border text-sanzar-text2 hover:border-sanzar-primary/40'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">CEFR {lvl}</div>
                  <div className="text-lg font-extrabold">{count.toLocaleString()}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search dictionary entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sanzar-input max-w-sm text-sm"
        />
        <span className="text-xs text-sanzar-muted">
          Showing {entries.length.toLocaleString()} {hskFilter ? `${hskFilter} ` : ''}entries (up to 300 per view)
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="sanzar-card p-6 text-xs text-sanzar-muted">
          No dictionary entries yet.
        </div>
      ) : (
        <div className="sanzar-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                <th className="p-3 font-semibold">Word</th>
                <th className="p-3 font-semibold">Lang</th>
                <th className="p-3 font-semibold">Meanings</th>
                <th className="p-3 font-semibold">Level</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-sanzar-border last:border-0">
                  <td className="p-3">
                    <div className="font-bold">{e.word}</div>
                    {e.phonetic && <div className="text-xs text-sanzar-muted">{e.phonetic}</div>}
                  </td>
                  <td className="p-3 text-xs font-semibold uppercase">{e.language}</td>
                  <td className="p-3 text-xs text-sanzar-text2 max-w-xs truncate">
                    {[e.meaning_en, e.meaning_bn, e.meaning_zh].filter(Boolean).join(' · ')}
                  </td>
                  <td className="p-3 text-xs">{e.hsk_level || '—'}</td>
                  <td className="p-3"><StatusPill s={e.status || 'published'} /></td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => setEditing(e)}
                      className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(e.id)}
                      className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <Modal
          title={editing ? `Edit ${editing.word}` : 'Add dictionary word'}
          onClose={() => setEditing(undefined)}
        >
          <DictionaryForm
            entry={editing}
            onDone={() => {
              setEditing(undefined);
              void qc.invalidateQueries({ queryKey: ['admin', 'dictionary'] });
            }}
          />
        </Modal>
      )}
      {showImport && (
        <Modal title="Bulk import dictionary (CSV / JSON)" onClose={() => setShowImport(false)}>
          <BulkImportForm
            existingWords={new Set((q.data?.entries ?? []).map((e) => `${e.language}:${e.word.toLowerCase()}`))}
            onDone={() => {
              setShowImport(false);
              void qc.invalidateQueries({ queryKey: ['admin', 'dictionary'] });
            }}
          />
        </Modal>
      )}
        </>
      )}
    </div>
  );
};

const TranslationCacheTab: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [reportedOnly, setReportedOnly] = useState(false);
  const [editing, setEditing] = useState<AdminTranslationCacheItem | null>(null);

  const quotaQuery = useQuery({
    queryKey: ['admin', 'translation-quota'],
    queryFn: () => apiRequest<AdminTranslationQuota>('/v1/admin/translation-quota'),
  });

  const cacheQuery = useQuery({
    queryKey: ['admin', 'translation-cache', search.trim(), reportedOnly],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('q', search.trim());
      if (reportedOnly) qs.set('reported', '1');
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiRequest<{ items: AdminTranslationCacheItem[] }>(`/v1/admin/translation-cache${suffix}`);
    },
  });

  const removeItem = async (cacheKey: string) => {
    try {
      await apiRequest(`/v1/admin/translation-cache?cacheKey=${encodeURIComponent(cacheKey)}`, {
        method: 'DELETE',
      });
      toast('Cache entry deleted');
      void qc.invalidateQueries({ queryKey: ['admin', 'translation-cache'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'translation-quota'] });
    } catch (e) {
      toast(errorText(e));
    }
  };

  const quota = quotaQuery.data;
  const items = cacheQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      {quota && (
        <div className="sanzar-card p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-sanzar-text">Quota ({quota.month})</span>
            <span className="sanzar-pill text-[11px]">
              Google: {quota.googleConfigured ? 'Configured' : 'Not configured'}
            </span>
            <span className="text-sanzar-text2">
              {quota.charsUsed.toLocaleString()} / {quota.charCap.toLocaleString()} chars ({quota.percentUsed}%) ·{' '}
              {quota.charsRemaining.toLocaleString()} left
            </span>
          </div>
          <div className="text-sanzar-muted font-semibold">
            {quota.cache.entries.toLocaleString()} cached · {quota.cache.totalHits.toLocaleString()} hits
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search translation cache…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sanzar-input max-w-sm text-sm"
        />
        <button
          type="button"
          onClick={() => setReportedOnly((v) => !v)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
            reportedOnly
              ? 'bg-sanzar-danger/10 border-sanzar-danger/40 text-sanzar-danger'
              : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
          }`}
        >
          Reported only
        </button>
      </div>

      {cacheQuery.isLoading && !cacheQuery.data ? (
        <LoadingState />
      ) : cacheQuery.isError ? (
        <ErrorRetry message={errorText(cacheQuery.error)} onRetry={() => cacheQuery.refetch()} />
      ) : items.length === 0 ? (
        <div className="sanzar-card p-6 text-xs text-sanzar-muted">No cached translations found.</div>
      ) : (
        <div className="sanzar-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-sanzar-surface2 text-sanzar-text2 text-left border-b border-sanzar-border">
                <th className="p-3 font-semibold">Translation</th>
                <th className="p-3 font-semibold">Pair</th>
                <th className="p-3 font-semibold">Provider</th>
                <th className="p-3 font-semibold">Hits</th>
                <th className="p-3 font-semibold">Flags</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.cacheKey} className="border-b border-sanzar-border last:border-0 align-top">
                  <td className="p-3 max-w-md space-y-1">
                    <div className="font-semibold text-sanzar-text break-words">
                      {item.sourceText}{' '}
                      <span className="text-sanzar-muted font-normal">→</span>{' '}
                      {item.translatedText}
                    </div>
                    {(item.sourcePinyin || item.targetPinyin) && (
                      <div className="text-xs text-sanzar-muted">
                        {[item.sourcePinyin, item.targetPinyin].filter(Boolean).join(' → ')}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs font-semibold whitespace-nowrap">
                    {item.sourceLanguage} → {item.targetLanguage}
                  </td>
                  <td className="p-3">
                    <span className="sanzar-pill text-[11px]">{item.provider}</span>
                  </td>
                  <td className="p-3 text-xs font-semibold">{item.hits.toLocaleString()}</td>
                  <td className="p-3 text-xs">
                    {item.reported > 0 ? (
                      <div className="space-y-1">
                        <span className="sanzar-pill text-[11px] bg-sanzar-danger/10 text-sanzar-danger border-sanzar-danger/30">
                          Reported ({item.reported})
                        </span>
                        {item.reportNote && (
                          <div className="text-[11px] text-sanzar-muted max-w-xs break-words">{item.reportNote}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sanzar-muted">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="px-3 py-1 rounded-lg border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.cacheKey)}
                      className="px-2.5 py-1 rounded-lg border border-sanzar-danger/40 text-sanzar-danger text-xs font-semibold hover:bg-sanzar-danger/10"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title="Edit cached translation" onClose={() => setEditing(null)}>
          <TranslationCacheEditForm
            item={editing}
            onDone={() => {
              setEditing(null);
              void qc.invalidateQueries({ queryKey: ['admin', 'translation-cache'] });
            }}
          />
        </Modal>
      )}
    </div>
  );
};

const TranslationCacheEditForm: React.FC<{ item: AdminTranslationCacheItem; onDone: () => void }> = ({
  item,
  onDone,
}) => {
  const toast = useToast();
  const [translatedText, setTranslatedText] = useState(item.translatedText);
  const [sourcePinyin, setSourcePinyin] = useState(item.sourcePinyin || '');
  const [targetPinyin, setTargetPinyin] = useState(item.targetPinyin || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!translatedText.trim()) return setErr('Translated text is required.');
    setErr(null);
    setBusy(true);
    try {
      await apiRequest('/v1/admin/translation-cache', {
        method: 'PATCH',
        bodyJson: {
          cacheKey: item.cacheKey,
          translatedText: translatedText.trim(),
          sourcePinyin: sourcePinyin.trim(),
          targetPinyin: targetPinyin.trim(),
        },
      });
      toast('Cached translation updated');
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-xs font-semibold text-sanzar-text2">
      <div className="p-2.5 rounded-xl bg-sanzar-surface2 text-sanzar-text">
        <div className="text-[11px] text-sanzar-muted mb-0.5">
          {item.sourceLanguage} → {item.targetLanguage}
        </div>
        <div className="font-bold">{item.sourceText}</div>
      </div>
      <label className="block space-y-1">
        <span>Translated text</span>
        <textarea
          rows={3}
          value={translatedText}
          onChange={(e) => setTranslatedText(e.target.value)}
          className="sanzar-input text-sm"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Source Pinyin</span>
          <input
            value={sourcePinyin}
            onChange={(e) => setSourcePinyin(e.target.value)}
            className="sanzar-input text-sm"
          />
        </label>
        <label className="space-y-1">
          <span>Target Pinyin</span>
          <input
            value={targetPinyin}
            onChange={(e) => setTargetPinyin(e.target.value)}
            className="sanzar-input text-sm"
          />
        </label>
      </div>
      {err && <p className="text-sanzar-danger text-xs">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
};

const DictionaryForm: React.FC<{ entry: DictionaryEntry | null; onDone: () => void }> = ({ entry, onDone }) => {
  const toast = useToast();
  const isNew = !entry;
  const [f, setF] = useState({
    id: entry?.id ?? '',
    language: (entry?.language ?? 'zh') as 'zh' | 'en' | 'bn',
    word: entry?.word ?? '',
    phonetic: entry?.phonetic ?? '',
    part_of_speech: entry?.part_of_speech ?? '',
    meaning_en: entry?.meaning_en ?? '',
    meaning_bn: entry?.meaning_bn ?? '',
    meaning_zh: entry?.meaning_zh ?? '',
    example: entry?.example ?? '',
    example_translation: entry?.example_translation ?? '',
    hsk_level: entry?.hsk_level ?? '',
    synonyms_csv: (entry?.synonyms ?? []).map((x) => x.word).join(', '),
    antonyms_csv: (entry?.antonyms ?? []).map((x) => x.word).join(', '),
    grammar_note: entry?.grammar_note ?? '',
    status: entry?.status ?? 'published',
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.word.trim()) return setErr('Word is required.');
    const autoId = `${f.language}-${slugify(f.phonetic || f.word) || Date.now().toString(36)}`;
    const id = isNew ? (f.id.trim() || autoId) : entry!.id;
    if (!isId(id)) return setErr('Invalid ID (use ASCII letters, digits, dash).');
    setErr(null);
    setBusy(true);
    try {
      await apiRequest(`/v1/admin/dictionary/${encodeURIComponent(id)}`, {
        method: 'PUT',
        bodyJson: {
          language: f.language,
          word: f.word.trim(),
          phonetic: f.phonetic.trim(),
          part_of_speech: f.part_of_speech.trim(),
          meaning_en: f.meaning_en.trim(),
          meaning_bn: f.meaning_bn.trim(),
          meaning_zh: f.meaning_zh.trim(),
          example: f.example.trim(),
          example_translation: f.example_translation.trim(),
          hsk_level: f.hsk_level.trim(),
          synonyms: f.synonyms_csv.split(',').map((s) => s.trim()).filter(Boolean).map((word) => ({ word })),
          antonyms: f.antonyms_csv.split(',').map((s) => s.trim()).filter(Boolean).map((word) => ({ word })),
          grammar_note: f.grammar_note.trim(),
          status: f.status,
        },
      });
      toast('Saved');
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-xs font-semibold text-sanzar-text2">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Language</span>
          <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as 'zh' | 'en' | 'bn' })} className="sanzar-input text-sm">
            <option value="zh">Chinese (简体中文)</option>
            <option value="en">English</option>
            <option value="bn">Bangla (বাংলা)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span>Word / Phrase</span>
          <input value={f.word} onChange={(e) => setF({ ...f, word: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Pinyin / IPA</span>
          <input value={f.phonetic} onChange={(e) => setF({ ...f, phonetic: e.target.value })} className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Part of speech</span>
          <input value={f.part_of_speech} onChange={(e) => setF({ ...f, part_of_speech: e.target.value })} placeholder="noun / verb / adj" className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>HSK / Level tag</span>
          <input value={f.hsk_level} onChange={(e) => setF({ ...f, hsk_level: e.target.value })} placeholder="HSK 1 / Core" className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Status</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="sanzar-input text-sm">
            <option value="published">published</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span>English meaning</span>
        <input value={f.meaning_en} onChange={(e) => setF({ ...f, meaning_en: e.target.value })} className="sanzar-input text-sm" />
      </label>
      <label className="block space-y-1">
        <span>Bengali meaning</span>
        <input value={f.meaning_bn} onChange={(e) => setF({ ...f, meaning_bn: e.target.value })} className="sanzar-input text-sm" />
      </label>
      <label className="block space-y-1">
        <span>Chinese meaning</span>
        <input value={f.meaning_zh} onChange={(e) => setF({ ...f, meaning_zh: e.target.value })} className="sanzar-input text-sm" />
      </label>
      <label className="block space-y-1">
        <span>Example sentence</span>
        <input value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} className="sanzar-input text-sm" />
      </label>
      <label className="block space-y-1">
        <span>Example translation</span>
        <input value={f.example_translation} onChange={(e) => setF({ ...f, example_translation: e.target.value })} className="sanzar-input text-sm" />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span>Synonyms (comma-separated)</span>
          <input value={f.synonyms_csv} onChange={(e) => setF({ ...f, synonyms_csv: e.target.value })} placeholder="happy, joyful, glad" className="sanzar-input text-sm" />
        </label>
        <label className="space-y-1">
          <span>Antonyms (comma-separated)</span>
          <input value={f.antonyms_csv} onChange={(e) => setF({ ...f, antonyms_csv: e.target.value })} placeholder="sad, unhappy" className="sanzar-input text-sm" />
        </label>
      </div>
      <label className="block space-y-1">
        <span>Grammar &amp; usage note</span>
        <input value={f.grammar_note} onChange={(e) => setF({ ...f, grammar_note: e.target.value })} placeholder="Countable noun / transitive verb usage note…" className="sanzar-input text-sm" />
      </label>
      {err && <p className="text-sanzar-danger text-xs">{err}</p>}
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50">
        Save word
      </button>
    </div>
  );
};

interface ImportRow {
  id?: string;
  language: string;
  word: string;
  phonetic?: string;
  part_of_speech?: string;
  meaning_en?: string;
  meaning_bn?: string;
  meaning_zh?: string;
  example?: string;
  example_translation?: string;
  hsk_level?: string;
  synonyms?: { word: string; pinyin?: string; note?: string }[];
  antonyms?: { word: string; pinyin?: string; note?: string }[];
  collocations?: { phrase: string; pinyin?: string; meaning?: string }[];
  grammar_note?: string;
}

function parseCsvOrJson(raw: string): ImportRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] || '';
    });
    return {
      language: obj.language || 'zh',
      word: obj.word || '',
      phonetic: obj.phonetic || '',
      part_of_speech: obj.part_of_speech || '',
      meaning_en: obj.meaning_en || '',
      meaning_bn: obj.meaning_bn || '',
      meaning_zh: obj.meaning_zh || '',
      example: obj.example || '',
      example_translation: obj.example_translation || '',
      hsk_level: obj.hsk_level || '',
    };
  });
}

const BulkImportForm: React.FC<{ existingWords: Set<string>; onDone: () => void }> = ({ existingWords, onDone }) => {
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published'>('published');
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  let parsed: ImportRow[] = [];
  let parseErr: string | null = null;
  try {
    parsed = parseCsvOrJson(raw);
  } catch (e) {
    parseErr = errorText(e);
  }

  const validLangs = new Set(['en', 'bn', 'zh', 'zh-hans', 'zh-Hans']);
  const preview = parsed.map((row, idx) => {
    const langOk = validLangs.has(String(row.language || '').trim());
    const wordOk = Boolean(String(row.word || '').trim());
    const normLang = String(row.language || '').toLowerCase().startsWith('zh') ? 'zh' : String(row.language || '').toLowerCase();
    const isDuplicate = wordOk && existingWords.has(`${normLang}:${String(row.word).trim().toLowerCase()}`);
    return { row, idx: idx + 1, valid: langOk && wordOk, isDuplicate };
  });

  const validCount = preview.filter((p) => p.valid).length;
  const dupCount = preview.filter((p) => p.isDuplicate).length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const text = await file.text();
      setRaw(text);
      setFileName(file.name);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      e.target.value = '';
    }
  };

  const submit = async () => {
    if (validCount === 0) return setErr('No valid rows to import.');
    setBusy(true);
    setErr(null);
    const BATCH_SIZE = 350;
    const totalBatches = Math.ceil(parsed.length / BATCH_SIZE);
    let totalImported = 0;
    let totalSkipped = 0;

    try {
      for (let b = 0; b < totalBatches; b++) {
        const chunk = parsed.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        setProgressText(
          totalBatches > 1 ? `Importing batch ${b + 1} / ${totalBatches} (${chunk.length} rows)…` : 'Importing…'
        );
        const res = await apiRequest<{ imported: number; skipped: number }>('/v1/admin/dictionary/import', {
          method: 'POST',
          bodyJson: { entries: chunk, defaultStatus },
        });
        totalImported += res.imported;
        totalSkipped += res.skipped;
      }
      toast(`Imported ${totalImported} words (${totalSkipped} skipped)`);
      onDone();
    } catch (e) {
      setErr(
        totalImported > 0
          ? `Imported ${totalImported} words before error: ${errorText(e)}`
          : errorText(e)
      );
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sanzar-muted">
          Upload a <code>.json</code> / <code>.csv</code> file or paste directly below (large files auto-split into 350-row batches).
        </p>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer px-3 py-1.5 rounded-xl border border-sanzar-primary/40 bg-sanzar-primarySoft text-sanzar-primary font-semibold hover:opacity-90 transition">
            Choose JSON / CSV file
            <input
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
          </label>
          {fileName && (
            <button
              type="button"
              onClick={() => {
                setFileName(null);
                setRaw('');
              }}
              className="text-sanzar-muted hover:text-sanzar-danger underline"
            >
              Clear ({fileName})
            </button>
          )}
        </div>
      </div>
      <textarea
        rows={6}
        value={raw.length > 25000 ? `${raw.slice(0, 25000)}\n... (${parsed.length} rows loaded from ${fileName || 'input'})` : raw}
        readOnly={raw.length > 25000}
        onChange={(e) => {
          setFileName(null);
          setRaw(e.target.value);
        }}
        placeholder={'language,word,phonetic,part_of_speech,meaning_en,meaning_bn,hsk_level\nzh,你好,nǐ hǎo,phrase,hello,হ্যালো,HSK 1'}
        className="sanzar-input font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-semibold text-sanzar-text2">
          <span>Import as:</span>
          <select
            value={defaultStatus}
            onChange={(e) => setDefaultStatus(e.target.value as 'draft' | 'published')}
            className="sanzar-input py-1 w-auto text-xs"
          >
            <option value="published">Published immediately</option>
            <option value="draft">Draft (review first)</option>
          </select>
        </label>
        {parsed.length > 0 && (
          <span className="text-sanzar-muted">
            {validCount}/{parsed.length} valid {dupCount > 0 ? `· ${dupCount} duplicates` : ''}
          </span>
        )}
      </div>
      {parseErr && <p className="text-sanzar-danger">{parseErr}</p>}
      {err && <p className="text-sanzar-danger">{err}</p>}
      <button
        type="button"
        disabled={busy || validCount === 0}
        onClick={() => void submit()}
        className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
      >
        {progressText || (busy ? 'Importing…' : `Import ${validCount} valid rows`)}
      </button>
    </div>
  );
};
