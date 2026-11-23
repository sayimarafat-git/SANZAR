import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, errorText } from '../../lib/api-client';
import { slugify, isId, type DictionaryEntry } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, StatusPill, useToast } from '../../components/SanzarUI';

export const AdminDictionaryPage: React.FC = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin', 'dictionary'],
    queryFn: () => apiRequest<{ entries: DictionaryEntry[] }>('/v1/admin/dictionary'),
  });
  const [editing, setEditing] = useState<DictionaryEntry | null | undefined>(undefined);
  const [search, setSearch] = useState('');

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorRetry message={errorText(q.error)} onRetry={() => q.refetch()} />;

  const entries = q.data.entries.filter((e) => {
    const k = search.trim().toLowerCase();
    return !k || [e.word, e.phonetic, e.meaning_en, e.meaning_bn, e.meaning_zh].some((v) => (v || '').toLowerCase().includes(k));
  });

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
        <h1 className="text-2xl font-extrabold">Dictionary</h1>
        <button
          onClick={() => setEditing(null)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold"
        >
          Add word
        </button>
      </div>

      <input
        placeholder="Search dictionary entries…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sanzar-input max-w-sm text-sm"
      />

      {entries.length === 0 ? (
        <div className="sanzar-card p-6 text-xs text-sanzar-muted">
          No custom dictionary entries yet. Built-in starter words are shown automatically; any entries added here appear for all students.
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
    </div>
  );
};

const DictionaryForm: React.FC<{ entry: DictionaryEntry | null; onDone: () => void }> = ({ entry, onDone }) => {
  const toast = useToast();
  const isNew = !entry;
  const [f, setF] = useState({
    id: entry?.id ?? '',
    language: (entry?.language ?? 'zh') as 'zh' | 'en',
    word: entry?.word ?? '',
    phonetic: entry?.phonetic ?? '',
    part_of_speech: entry?.part_of_speech ?? '',
    meaning_en: entry?.meaning_en ?? '',
    meaning_bn: entry?.meaning_bn ?? '',
    meaning_zh: entry?.meaning_zh ?? '',
    example: entry?.example ?? '',
    example_translation: entry?.example_translation ?? '',
    hsk_level: entry?.hsk_level ?? '',
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
          <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as 'zh' | 'en' })} className="sanzar-input text-sm">
            <option value="zh">Chinese (中文)</option>
            <option value="en">English</option>
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
      {err && <p className="text-sanzar-danger text-xs">{err}</p>}
      <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50">
        Save word
      </button>
    </div>
  );
};
