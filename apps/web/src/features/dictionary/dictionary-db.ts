/**
 * Local-first IndexedDB storage for SANZAR Dictionary & Translator.
 * Strictly separates:
 *  - saved_vocabulary (per Firebase UID, synced)
 *  - translation_history (per Firebase UID, synced)
 *  - translation_cache (local performance cache, LRU-capped, never creates history)
 *  - sync_meta (incremental sync cursors per UID)
 */
import { apiRequest } from '../../lib/api-client';
import type { DictLangCode, SavedVocabularyItem, TranslationHistoryItem } from '../../lib/models';

const DB_NAME = 'sanzar_dictionary_v1';
const DB_VERSION = 1;
const MAX_CACHE_ENTRIES = 250;

export interface TranslationCacheEntry {
  key: string;
  sourceLanguage: DictLangCode;
  targetLanguage: DictLangCode;
  sourceText: string;
  translatedText: string;
  sourcePinyin?: string;
  targetPinyin?: string;
  provider: string;
  accessedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('saved_vocabulary')) {
        const s = db.createObjectStore('saved_vocabulary', { keyPath: 'id' });
        s.createIndex('by_user', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('translation_history')) {
        const s = db.createObjectStore('translation_history', { keyPath: 'id' });
        s.createIndex('by_user', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('translation_cache')) {
        const s = db.createObjectStore('translation_cache', { keyPath: 'key' });
        s.createIndex('by_accessed', 'accessedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('sync_meta')) {
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPromise<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = fn(tx.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/* ============================== translation cache (LRU) ============================== */
const CACHE_KEY_VERSION = 'v2';

export function buildCacheKey(source: DictLangCode, target: DictLangCode, text: string): string {
  return `${CACHE_KEY_VERSION}::${source}::${target}::${text.trim().toLowerCase()}`;
}

export async function getCachedTranslation(
  source: DictLangCode,
  target: DictLangCode,
  text: string
): Promise<TranslationCacheEntry | null> {
  try {
    const key = buildCacheKey(source, target, text);
    const entry = await txPromise<TranslationCacheEntry | undefined>('translation_cache', 'readonly', (s) => s.get(key));
    if (!entry) return null;
    // Update LRU timestamp asynchronously
    void txPromise('translation_cache', 'readwrite', (s) => s.put({ ...entry, accessedAt: Date.now() }));
    return entry;
  } catch {
    return null;
  }
}

export async function putCachedTranslation(entry: Omit<TranslationCacheEntry, 'key' | 'accessedAt'>): Promise<void> {
  try {
    const key = buildCacheKey(entry.sourceLanguage, entry.targetLanguage, entry.sourceText);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('translation_cache', 'readwrite');
      const store = tx.objectStore('translation_cache');
      store.put({ ...entry, key, accessedAt: Date.now() });
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_CACHE_ENTRIES) {
          const idx = store.index('by_accessed');
          const excess = countReq.result - MAX_CACHE_ENTRIES;
          let removed = 0;
          idx.openCursor().onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (cursor && removed < excess) {
              cursor.delete();
              removed++;
              cursor.continue();
            }
          };
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal cache error
  }
}

/* ============================== saved vocabulary (per-UID) ============================== */
export async function getLocalSavedVocabulary(uid: string): Promise<SavedVocabularyItem[]> {
  try {
    const rows = await txPromise<SavedVocabularyItem[]>('saved_vocabulary', 'readonly', (s) =>
      s.index('by_user').getAll(uid)
    );
    return rows
      .filter((r) => !r.deleted_at)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  } catch {
    return [];
  }
}

export async function saveLocalVocabularyItem(uid: string, item: SavedVocabularyItem): Promise<SavedVocabularyItem> {
  const record: SavedVocabularyItem = {
    ...item,
    user_id: uid,
    updated_at: Date.now(),
    deleted_at: null,
    sync_status: 'pending',
  };
  await txPromise('saved_vocabulary', 'readwrite', (s) => s.put(record));
  return record;
}

export async function deleteLocalVocabularyItem(uid: string, id: string): Promise<void> {
  const existing = await txPromise<SavedVocabularyItem | undefined>('saved_vocabulary', 'readonly', (s) => s.get(id));
  if (!existing || existing.user_id !== uid) return;
  const t = Date.now();
  await txPromise('saved_vocabulary', 'readwrite', (s) =>
    s.put({ ...existing, deleted_at: t, updated_at: t, sync_status: 'pending' })
  );
}

export async function syncSavedVocabulary(uid: string): Promise<SavedVocabularyItem[]> {
  if (!uid) return [];
  try {
    const allForUser = await txPromise<SavedVocabularyItem[]>('saved_vocabulary', 'readonly', (s) =>
      s.index('by_user').getAll(uid)
    );
    const pending = allForUser.filter((r) => r.sync_status === 'pending');

    if (pending.length > 0) {
      await apiRequest('/v1/dictionary/saved', {
        method: 'POST',
        bodyJson: { items: pending },
      });
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saved_vocabulary', 'readwrite');
        const store = tx.objectStore('saved_vocabulary');
        for (const p of pending) {
          store.put({ ...p, sync_status: 'synced' });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const metaKey = `saved::${uid}`;
    const meta = await txPromise<{ key: string; since: number } | undefined>('sync_meta', 'readonly', (s) =>
      s.get(metaKey)
    );
    const since = meta?.since || 0;
    const res = await apiRequest<{ items: SavedVocabularyItem[]; serverTime: number }>(
      `/v1/dictionary/saved?since=${since}`
    );

    if (res.items.length > 0) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saved_vocabulary', 'readwrite');
        const store = tx.objectStore('saved_vocabulary');
        for (const remote of res.items) {
          store.put({ ...remote, user_id: uid, sync_status: 'synced' });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    await txPromise('sync_meta', 'readwrite', (s) => s.put({ key: metaKey, since: res.serverTime || Date.now() }));
  } catch {
    // Offline or transient failure: local records remain pending for next sync
  }
  return getLocalSavedVocabulary(uid);
}

/* ============================== translation history (per-UID) ============================== */
function historyDedupKey(item: Pick<TranslationHistoryItem, 'source_language' | 'target_language' | 'source_text'>): string {
  return `${item.source_language}::${item.target_language}::${item.source_text.trim().toLowerCase()}`;
}

export async function getLocalTranslationHistory(uid: string): Promise<TranslationHistoryItem[]> {
  try {
    const rows = await txPromise<TranslationHistoryItem[]>('translation_history', 'readonly', (s) =>
      s.index('by_user').getAll(uid)
    );
    const activeSorted = rows
      .filter((r) => !r.deleted_at)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // Deduplicate by (source_language, target_language, normalized source_text) keeping the most recent
    const seen = new Set<string>();
    const deduped: TranslationHistoryItem[] = [];
    for (const r of activeSorted) {
      const k = historyDedupKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(r);
    }
    return deduped;
  } catch {
    return [];
  }
}

export async function addLocalTranslationHistory(
  uid: string,
  item: Omit<TranslationHistoryItem, 'user_id' | 'sync_status'>
): Promise<TranslationHistoryItem> {
  const existingRows = await txPromise<TranslationHistoryItem[]>('translation_history', 'readonly', (s) =>
    s.index('by_user').getAll(uid)
  );
  const targetKey = historyDedupKey(item);
  const matching = existingRows
    .filter((r) => !r.deleted_at && historyDedupKey(r) === targetKey)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  const primaryId = matching[0]?.id || item.id;
  const nowMs = Date.now();
  const record: TranslationHistoryItem = {
    ...item,
    id: primaryId,
    user_id: uid,
    created_at: nowMs,
    updated_at: nowMs,
    deleted_at: null,
    sync_status: 'pending',
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('translation_history', 'readwrite');
    const store = tx.objectStore('translation_history');
    store.put(record);
    // Soft-delete any extra older local duplicates for the same word + pair
    for (const extra of matching.slice(1)) {
      store.put({ ...extra, deleted_at: nowMs, updated_at: nowMs, sync_status: 'pending' });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return record;
}

export async function deleteLocalTranslationHistory(uid: string, id: string): Promise<void> {
  const existing = await txPromise<TranslationHistoryItem | undefined>('translation_history', 'readonly', (s) =>
    s.get(id)
  );
  if (!existing || existing.user_id !== uid) return;
  const t = Date.now();
  await txPromise('translation_history', 'readwrite', (s) =>
    s.put({ ...existing, deleted_at: t, updated_at: t, sync_status: 'pending' })
  );
}

export async function syncTranslationHistory(uid: string): Promise<TranslationHistoryItem[]> {
  if (!uid) return [];
  try {
    const allForUser = await txPromise<TranslationHistoryItem[]>('translation_history', 'readonly', (s) =>
      s.index('by_user').getAll(uid)
    );
    const pending = allForUser.filter((r) => r.sync_status === 'pending');

    if (pending.length > 0) {
      await apiRequest('/v1/translation/history/batch', {
        method: 'POST',
        bodyJson: { items: pending },
      });
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('translation_history', 'readwrite');
        const store = tx.objectStore('translation_history');
        for (const p of pending) {
          store.put({ ...p, sync_status: 'synced' });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const metaKey = `history::${uid}`;
    const meta = await txPromise<{ key: string; since: number } | undefined>('sync_meta', 'readonly', (s) =>
      s.get(metaKey)
    );
    const since = meta?.since || 0;
    const res = await apiRequest<{ items: TranslationHistoryItem[]; serverTime: number }>(
      `/v1/translation/history?since=${since}`
    );

    if (res.items.length > 0) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('translation_history', 'readwrite');
        const store = tx.objectStore('translation_history');
        for (const remote of res.items) {
          store.put({ ...remote, user_id: uid, sync_status: 'synced' });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    await txPromise('sync_meta', 'readwrite', (s) => s.put({ key: metaKey, since: res.serverTime || Date.now() }));
  } catch {
    // Offline or transient failure: local records remain pending
  }
  return getLocalTranslationHistory(uid);
}
