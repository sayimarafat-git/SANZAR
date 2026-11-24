/**
 * Sanzar Dictionary, Online Translation, Saved Vocabulary, and History API.
 * Keeps dictionary_entries, saved_vocabulary, and translation_history strictly separate.
 */
import { HttpError, audit, body, json, newId, now, requireRole, str } from './worker.js';

/* ============================== normalization ============================== */
const TONE_MAP = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v', ü: 'v',
};

export function stripPinyinTones(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, (ch) => TONE_MAP[ch] || ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes incoming language code to canonical API code: 'en' | 'bn' | 'zh-Hans'. */
export function normalizeApiLang(lang) {
  const v = String(lang || '').trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'bn' || v === 'bangla' || v === 'bengali') return 'bn';
  if (v === 'zh' || v === 'zh-hans' || v === 'zh-cn' || v === 'chinese') return 'zh-Hans';
  return null;
}

/** Maps canonical API code to DB storage code ('zh' | 'en' | 'bn') to preserve compatibility. */
export function toDbLang(lang) {
  const norm = normalizeApiLang(lang);
  if (!norm) return null;
  return norm === 'zh-Hans' ? 'zh' : norm;
}

export function shapeDictionaryRow(row) {
  return {
    ...row,
    language_code: row.language === 'zh' ? 'zh-Hans' : row.language,
  };
}

/* ============================== language detection ============================== */
export function detectLanguageFromText(text) {
  const s = String(text || '').trim();
  if (!s) return { language: 'en', confidence: 0 };
  let bn = 0;
  let zh = 0;
  let latin = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code >= 0x0980 && code <= 0x09ff) bn++;
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) zh++;
    else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) latin++;
  }
  const total = bn + zh + latin;
  if (total === 0) return { language: 'en', confidence: 0.2 };
  if (bn >= zh && bn >= latin && bn > 0) return { language: 'bn', confidence: Number((bn / total).toFixed(2)) };
  if (zh >= bn && zh >= latin && zh > 0) return { language: 'zh-Hans', confidence: Number((zh / total).toFixed(2)) };
  return { language: 'en', confidence: Number((latin / total).toFixed(2)) };
}

/* ============================== public dictionary search ============================== */
export async function searchDictionary(env, url) {
  const rawQ = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const q = rawQ.toLowerCase();
  const qPlain = stripPinyinTones(rawQ);
  const qCompact = qPlain.replace(/\s+/g, '');
  const langParam = url.searchParams.get('lang');
  const dbLang = langParam && langParam !== 'all' ? toDbLang(langParam) : null;
  const hsk = (url.searchParams.get('hsk_level') || '').trim().slice(0, 20);
  const pos = (url.searchParams.get('part_of_speech') || '').trim().toLowerCase().slice(0, 40);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  const offset = Math.max(0, Number(url.searchParams.get('cursor')) || 0);

  const where = ["status = 'published'"];
  const args = [];

  if (dbLang) {
    where.push('language = ?');
    args.push(dbLang);
  }
  if (hsk) {
    where.push('lower(hsk_level) = lower(?)');
    args.push(hsk);
  }
  if (pos) {
    where.push('lower(part_of_speech) LIKE ?');
    args.push(`%${pos}%`);
  }
  if (q) {
    where.push(
      `(lower(word) LIKE ? OR lower(phonetic) LIKE ? OR phonetic_plain LIKE ? OR replace(phonetic_plain, ' ', '') LIKE ? OR lower(meaning_en) LIKE ? OR lower(meaning_bn) LIKE ? OR lower(meaning_zh) LIKE ?)`
    );
    const like = `%${q}%`;
    const likePlain = `%${qPlain}%`;
    const likeCompact = `%${qCompact}%`;
    args.push(like, like, likePlain, likeCompact, like, like, like);
  }

  const fetchLimit = limit + 1;
  let orderSql;
  let orderArgs;
  if (q) {
    orderSql = `ORDER BY CASE
      WHEN lower(word) = ? THEN 0
      WHEN phonetic_plain = ? OR replace(phonetic_plain, ' ', '') = ? THEN 1
      WHEN lower(word) LIKE ? THEN 2
      WHEN phonetic_plain LIKE ? OR replace(phonetic_plain, ' ', '') LIKE ? THEN 3
      WHEN lower(meaning_en) LIKE ? OR lower(meaning_bn) LIKE ? OR lower(meaning_zh) LIKE ? THEN 4
      ELSE 5
    END, word ASC, id ASC LIMIT ? OFFSET ?`;
    orderArgs = [
      q,
      qPlain,
      qCompact,
      `${q}%`,
      `${qPlain}%`,
      `${qCompact}%`,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
      fetchLimit,
      offset,
    ];
  } else {
    orderSql = 'ORDER BY word ASC, id ASC LIMIT ? OFFSET ?';
    orderArgs = [fetchLimit, offset];
  }

  const rows = (
    await env.DB.prepare(
      `SELECT id, language, word, phonetic, part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, updated_at
       FROM dictionary_entries WHERE ${where.join(' AND ')} ${orderSql}`
    )
      .bind(...args, ...orderArgs)
      .all()
  ).results;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: page.map(shapeDictionaryRow),
    nextCursor: hasMore ? String(offset + limit) : null,
    hasMore,
  };
}

/* ============================== online translation service ============================== */
function toProviderLang(code, provider) {
  if (provider === 'mymemory') {
    if (code === 'zh-Hans') return 'zh-CN';
    return code;
  }
  if (provider === 'google') {
    if (code === 'zh-Hans') return 'zh-CN';
    return code;
  }
  if (provider === 'libretranslate') {
    if (code === 'zh-Hans') return 'zh';
    return code;
  }
  return code;
}

async function callTranslationProvider(env, text, sourceLang, targetLang) {
  // 1. Google Cloud Translate v2 (if secret configured)
  if (env.GOOGLE_TRANSLATE_API_KEY) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            q: text,
            source: toProviderLang(sourceLang, 'google'),
            target: toProviderLang(targetLang, 'google'),
            format: 'text',
          }),
          signal: controller.signal,
        }
      );
      if (!res.ok) throw new HttpError(502, 'provider-error', 'Translation provider returned an error');
      const data = await res.json();
      const translated = data?.data?.translations?.[0]?.translatedText;
      if (!translated) throw new HttpError(502, 'provider-error', 'Empty translation response');
      return { translatedText: translated, provider: 'google-translate' };
    } finally {
      clearTimeout(timer);
    }
  }

  // 2. LibreTranslate (if self-hosted URL configured)
  if (env.LIBRETRANSLATE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const payload = {
        q: text,
        source: toProviderLang(sourceLang, 'libretranslate'),
        target: toProviderLang(targetLang, 'libretranslate'),
        format: 'text',
      };
      if (env.LIBRETRANSLATE_API_KEY) payload.api_key = env.LIBRETRANSLATE_API_KEY;
      const res = await fetch(`${env.LIBRETRANSLATE_URL.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new HttpError(502, 'provider-error', 'Translation provider returned an error');
      const data = await res.json();
      if (!data?.translatedText) throw new HttpError(502, 'provider-error', 'Empty translation response');
      return { translatedText: data.translatedText, provider: 'libretranslate' };
    } finally {
      clearTimeout(timer);
    }
  }

  // 3. Default zero-config provider: MyMemory (supports en, bn, zh-CN)
  const pair = `${toProviderLang(sourceLang, 'mymemory')}|${toProviderLang(targetLang, 'mymemory')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new HttpError(502, 'provider-error', 'Online translation service unavailable');
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || data?.responseStatus === 403 || data?.responseStatus === 429) {
      throw new HttpError(503, 'rate-limited', 'Online translation rate limit reached. Try again shortly.');
    }
    return { translatedText: translated, provider: 'mymemory' };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(504, 'provider-timeout', 'Online translation timed out. Please retry.');
  } finally {
    clearTimeout(timer);
  }
}

export async function handleTranslate(env, input) {
  const text = str(input.text, { min: 1, max: 2000, field: 'Text' });
  const targetLang = normalizeApiLang(input.targetLanguage || input.target_language);
  if (!targetLang) {
    throw new HttpError(400, 'unsupported-language', 'Target language must be en, bn, or zh-Hans');
  }

  let sourceLang = input.sourceLanguage && input.sourceLanguage !== 'auto'
    ? normalizeApiLang(input.sourceLanguage)
    : null;
  const detected = detectLanguageFromText(text);
  if (!sourceLang) {
    sourceLang = detected.language;
  }

  if (sourceLang === targetLang) {
    return {
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      detectedSourceLanguage: detected.language,
      confidence: detected.confidence,
      provider: 'identity',
      matchedEntries: [],
    };
  }

  const result = await callTranslationProvider(env, text, sourceLang, targetLang);

  // Optional curated dictionary enrichment for short words/phrases (<= 40 chars)
  let matchedEntries = [];
  if (text.length <= 40) {
    const q = text.toLowerCase();
    const qPlain = stripPinyinTones(text);
    const dbLang = toDbLang(sourceLang);
    const rows = (
      await env.DB.prepare(
        `SELECT id, language, word, phonetic, part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, updated_at
         FROM dictionary_entries
         WHERE status = 'published' AND language = ? AND (lower(word) = ? OR phonetic_plain = ?)
         LIMIT 5`
      )
        .bind(dbLang, q, qPlain)
        .all()
    ).results;
    matchedEntries = rows.map(shapeDictionaryRow);
  }

  return {
    translatedText: result.translatedText,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    detectedSourceLanguage: detected.language,
    confidence: detected.confidence,
    provider: result.provider,
    matchedEntries,
  };
}

export function handleDetectLanguage(input) {
  const text = str(input.text, { min: 1, max: 2000, field: 'Text' });
  const detected = detectLanguageFromText(text);
  return {
    language: detected.language,
    confidence: detected.confidence,
  };
}

/* ============================== saved vocabulary (per-UID sync) ============================== */
export async function listSavedVocabulary(env, ctx, url) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const rows = since > 0
    ? (
        await env.DB.prepare(
          `SELECT id, dictionary_entry_id, source_language, target_language, word, phonetic, meaning, example, hsk_level, part_of_speech, created_at, updated_at, deleted_at
           FROM saved_vocabulary WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT ?`
        )
          .bind(ctx.user.uid, since, limit)
          .all()
      ).results
    : (
        await env.DB.prepare(
          `SELECT id, dictionary_entry_id, source_language, target_language, word, phonetic, meaning, example, hsk_level, part_of_speech, created_at, updated_at, deleted_at
           FROM saved_vocabulary WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`
        )
          .bind(ctx.user.uid, limit)
          .all()
      ).results;

  return { items: rows, serverTime: now() };
}

export async function upsertSavedVocabulary(env, ctx, input) {
  const items = Array.isArray(input.items) ? input.items : [input];
  if (items.length === 0 || items.length > 100) {
    throw new HttpError(400, 'invalid-argument', 'Provide 1 to 100 saved items');
  }
  const t = now();
  const saved = [];

  for (const raw of items) {
    const id = str(raw.id || newId('sv'), { min: 2, max: 80, field: 'ID' });
    const sourceLang = normalizeApiLang(raw.source_language || raw.sourceLanguage || 'en') || 'en';
    const targetLang = normalizeApiLang(raw.target_language || raw.targetLanguage || 'bn') || 'bn';
    const word = str(raw.word, { min: 1, max: 200, field: 'Word' });
    const meaning = str(raw.meaning || '', { max: 1000, field: 'Meaning' });
    const phonetic = str(raw.phonetic || '', { max: 200, field: 'Phonetic' });
    const example = str(raw.example || '', { max: 500, field: 'Example' });
    const hskLevel = str(raw.hsk_level || raw.hskLevel || '', { max: 30, field: 'HSK level' });
    const partOfSpeech = str(raw.part_of_speech || raw.partOfSpeech || '', { max: 60, field: 'Part of speech' });
    const dictEntryId = raw.dictionary_entry_id || raw.dictionaryEntryId ? String(raw.dictionary_entry_id || raw.dictionaryEntryId).slice(0, 80) : null;
    const createdAt = Number(raw.created_at || raw.createdAt) || t;
    const updatedAt = Math.max(Number(raw.updated_at || raw.updatedAt) || t, t);
    const deletedAt = raw.deleted_at || raw.deletedAt ? Number(raw.deleted_at || raw.deletedAt) : null;

    await env.DB.prepare(
      `INSERT INTO saved_vocabulary (id, user_id, dictionary_entry_id, source_language, target_language, word, phonetic, meaning, example, hsk_level, part_of_speech, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         dictionary_entry_id = excluded.dictionary_entry_id,
         source_language = excluded.source_language,
         target_language = excluded.target_language,
         word = excluded.word,
         phonetic = excluded.phonetic,
         meaning = excluded.meaning,
         example = excluded.example,
         hsk_level = excluded.hsk_level,
         part_of_speech = excluded.part_of_speech,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at
       WHERE saved_vocabulary.user_id = excluded.user_id AND excluded.updated_at >= saved_vocabulary.updated_at`
    )
      .bind(id, ctx.user.uid, dictEntryId, sourceLang, targetLang, word, phonetic, meaning, example, hskLevel, partOfSpeech, createdAt, updatedAt, deletedAt)
      .run();

    saved.push({
      id,
      dictionary_entry_id: dictEntryId,
      source_language: sourceLang,
      target_language: targetLang,
      word,
      phonetic,
      meaning,
      example,
      hsk_level: hskLevel,
      part_of_speech: partOfSpeech,
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: deletedAt,
    });
  }

  return { items: saved, serverTime: t };
}

export async function deleteSavedVocabulary(env, ctx, id) {
  const cleanId = str(id, { min: 2, max: 80, field: 'ID' });
  const t = now();
  await env.DB.prepare(
    'UPDATE saved_vocabulary SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(t, t, cleanId, ctx.user.uid)
    .run();
  return { deleted: true, id: cleanId, serverTime: t };
}

/* ============================== translation history (per-UID sync) ============================== */
export async function listTranslationHistory(env, ctx, url) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const rows = since > 0
    ? (
        await env.DB.prepare(
          `SELECT id, source_language, target_language, source_text, translated_text, provider, created_at, updated_at, deleted_at
           FROM translation_history WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT ?`
        )
          .bind(ctx.user.uid, since, limit)
          .all()
      ).results
    : (
        await env.DB.prepare(
          `SELECT id, source_language, target_language, source_text, translated_text, provider, created_at, updated_at, deleted_at
           FROM translation_history WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`
        )
          .bind(ctx.user.uid, limit)
          .all()
      ).results;

  return { items: rows, serverTime: now() };
}

export async function batchTranslationHistory(env, ctx, input) {
  const items = Array.isArray(input.items) ? input.items : [input];
  if (items.length === 0 || items.length > 100) {
    throw new HttpError(400, 'invalid-argument', 'Provide 1 to 100 history items');
  }
  const t = now();
  const synced = [];

  for (const raw of items) {
    const id = str(raw.id || newId('th'), { min: 2, max: 80, field: 'ID' });
    const sourceLang = normalizeApiLang(raw.source_language || raw.sourceLanguage || 'en') || 'en';
    const targetLang = normalizeApiLang(raw.target_language || raw.targetLanguage || 'bn') || 'bn';
    const sourceText = str(raw.source_text || raw.sourceText, { min: 1, max: 2000, field: 'Source text' });
    const translatedText = str(raw.translated_text || raw.translatedText, { min: 1, max: 4000, field: 'Translated text' });
    const provider = str(raw.provider || '', { max: 60, field: 'Provider' });
    const createdAt = Number(raw.created_at || raw.createdAt) || t;
    const updatedAt = Math.max(Number(raw.updated_at || raw.updatedAt) || t, t);
    const deletedAt = raw.deleted_at || raw.deletedAt ? Number(raw.deleted_at || raw.deletedAt) : null;

    await env.DB.prepare(
      `INSERT INTO translation_history (id, user_id, source_language, target_language, source_text, translated_text, provider, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at
       WHERE translation_history.user_id = excluded.user_id AND excluded.updated_at >= translation_history.updated_at`
    )
      .bind(id, ctx.user.uid, sourceLang, targetLang, sourceText, translatedText, provider, createdAt, updatedAt, deletedAt)
      .run();

    synced.push({
      id,
      source_language: sourceLang,
      target_language: targetLang,
      source_text: sourceText,
      translated_text: translatedText,
      provider,
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: deletedAt,
    });
  }

  return { items: synced, serverTime: t };
}

export async function deleteTranslationHistory(env, ctx, id) {
  const cleanId = str(id, { min: 2, max: 80, field: 'ID' });
  const t = now();
  await env.DB.prepare(
    'UPDATE translation_history SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(t, t, cleanId, ctx.user.uid)
    .run();
  return { deleted: true, id: cleanId, serverTime: t };
}

/* ============================== admin bulk import ============================== */
export async function adminBulkImportDictionary(env, ctx, input) {
  requireRole(ctx.user, 'content_admin');
  const rows = Array.isArray(input.entries) ? input.entries : [];
  if (rows.length === 0 || rows.length > 500) {
    throw new HttpError(400, 'invalid-argument', 'Provide 1 to 500 entries per import');
  }
  const defaultStatus = ['draft', 'published'].includes(input.defaultStatus) ? input.defaultStatus : 'draft';
  const t = now();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const dbLang = toDbLang(r.language);
    const word = typeof r.word === 'string' ? r.word.trim() : '';
    if (!dbLang) {
      errors.push({ row: i + 1, reason: `Invalid language: ${r.language}` });
      skipped++;
      continue;
    }
    if (!word || word.length > 160) {
      errors.push({ row: i + 1, reason: 'Missing or invalid word' });
      skipped++;
      continue;
    }
    const id = (typeof r.id === 'string' && r.id.trim())
      ? r.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60)
      : `${dbLang}-${word.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff\u4e00-\u9fff]+/g, '-').slice(0, 40)}-${i}`;
    const phonetic = String(r.phonetic || '').trim().slice(0, 160);
    const phoneticPlain = stripPinyinTones(phonetic);
    const partOfSpeech = String(r.part_of_speech || '').trim().slice(0, 60);
    const meaningEn = String(r.meaning_en || '').trim().slice(0, 500);
    const meaningBn = String(r.meaning_bn || '').trim().slice(0, 500);
    const meaningZh = String(r.meaning_zh || '').trim().slice(0, 500);
    const example = String(r.example || '').trim().slice(0, 500);
    const exampleTranslation = String(r.example_translation || '').trim().slice(0, 500);
    const hskLevel = String(r.hsk_level || '').trim().slice(0, 30);
    const status = ['draft', 'published', 'archived'].includes(r.status) ? r.status : defaultStatus;

    await env.DB.prepare(
      `INSERT INTO dictionary_entries
        (id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        language=excluded.language, word=excluded.word, phonetic=excluded.phonetic, phonetic_plain=excluded.phonetic_plain,
        part_of_speech=excluded.part_of_speech, meaning_en=excluded.meaning_en, meaning_bn=excluded.meaning_bn,
        meaning_zh=excluded.meaning_zh, example=excluded.example, example_translation=excluded.example_translation,
        hsk_level=excluded.hsk_level, status=excluded.status, updated_at=excluded.updated_at`
    )
      .bind(id, dbLang, word, phonetic, phoneticPlain, partOfSpeech, meaningEn, meaningBn, meaningZh, example, exampleTranslation, hskLevel, status, ctx.user.uid, t, t)
      .run();
    imported++;
  }

  await audit(env, ctx, 'dictionary.import', `imported=${imported},skipped=${skipped}`);
  return { imported, skipped, errors };
}

/* ============================== router ============================== */
export async function routeDictionaryAuth(req, env, ctx, url) {
  const p = url.pathname;
  const m = req.method;
  let mm;

  if (p === '/v1/translation' && m === 'POST') {
    return json(await handleTranslate(env, await body(req, 16_000)));
  }
  if (p === '/v1/translation/detect' && m === 'POST') {
    return json(handleDetectLanguage(await body(req, 16_000)));
  }
  if (p === '/v1/dictionary/saved' && m === 'GET') {
    return json(await listSavedVocabulary(env, ctx, url));
  }
  if (p === '/v1/dictionary/saved' && m === 'POST') {
    return json(await upsertSavedVocabulary(env, ctx, await body(req, 100_000)));
  }
  if ((mm = p.match(/^\/v1\/dictionary\/saved\/([\w-]{2,80})$/)) && m === 'DELETE') {
    return json(await deleteSavedVocabulary(env, ctx, mm[1]));
  }
  if (p === '/v1/translation/history' && m === 'GET') {
    return json(await listTranslationHistory(env, ctx, url));
  }
  if (p === '/v1/translation/history/batch' && m === 'POST') {
    return json(await batchTranslationHistory(env, ctx, await body(req, 120_000)));
  }
  if ((mm = p.match(/^\/v1\/translation\/history\/([\w-]{2,80})$/)) && m === 'DELETE') {
    return json(await deleteTranslationHistory(env, ctx, mm[1]));
  }
  if (p === '/v1/admin/dictionary/import' && m === 'POST') {
    return json(await adminBulkImportDictionary(env, ctx, await body(req, 500_000)));
  }
  return null;
}
