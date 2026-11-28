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

/** Normalizes incoming language code to canonical API code: 'en' | 'bn' | 'zh-Hans' | 'id'. */
export function normalizeApiLang(lang) {
  const v = String(lang || '').trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'bn' || v === 'bangla' || v === 'bengali') return 'bn';
  if (v === 'zh' || v === 'zh-hans' || v === 'zh-cn' || v === 'chinese') return 'zh-Hans';
  if (v === 'id' || v === 'indonesian' || v === 'bahasa' || v === 'bahasa indonesia') return 'id';
  return null;
}

/** Maps canonical API code to DB storage code ('zh' | 'en' | 'bn' | 'id') to preserve compatibility. */
export function toDbLang(lang) {
  const norm = normalizeApiLang(lang);
  if (!norm) return null;
  return norm === 'zh-Hans' ? 'zh' : norm;
}

function safeParseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function shapeDictionaryRow(row) {
  return {
    ...row,
    language_code: row.language === 'zh' ? 'zh-Hans' : row.language,
    synonyms: safeParseArray(row.synonyms_json),
    antonyms: safeParseArray(row.antonyms_json),
    collocations: safeParseArray(row.collocations_json),
    grammar_note: row.grammar_note || '',
  };
}

/* ============================== language & pinyin detection ============================== */
const PINYIN_SYLLABLES = new Set([
  'a','ai','an','ang','ao','ba','bai','ban','bang','bao','bei','ben','beng','bi','bian','biao','bie','bin','bing','bo','bu',
  'ca','cai','can','cang','cao','ce','cen','ceng','cha','chai','chan','chang','chao','che','chen','cheng','chi','chong','chou','chu','chua','chuai','chuan','chuang','chui','chun','chuo','ci','cong','cou','cu','cuan','cui','cun','cuo',
  'da','dai','dan','dang','dao','de','dei','den','deng','di','dia','dian','diao','die','ding','diu','dong','dou','du','duan','dui','dun','duo',
  'e','ei','en','eng','er',
  'fa','fan','fang','fei','fen','feng','fo','fou','fu',
  'ga','gai','gan','gang','gao','ge','gei','gen','geng','gong','gou','gu','gua','guai','guan','guang','gui','gun','guo',
  'ha','hai','han','hang','hao','he','hei','hen','heng','hong','hou','hu','hua','huai','huan','huang','hui','hun','huo',
  'ji','jia','jian','jiang','jiao','jie','jin','jing','jiong','jiu','ju','juan','jue','jun',
  'ka','kai','kan','kang','kao','ke','kei','ken','keng','kong','kou','ku','kua','kuai','kuan','kuang','kui','kun','kuo',
  'la','lai','lan','lang','lao','le','lei','leng','li','lia','lian','liang','liao','lie','lin','ling','liu','lo','long','lou','lu','luan','lue','lun','luo','lv','lve',
  'ma','mai','man','mang','mao','me','mei','men','meng','mi','mian','miao','mie','min','ming','miu','mo','mou','mu',
  'na','nai','nan','nang','nao','ne','nei','nen','neng','ni','nian','niang','niao','nie','nin','ning','niu','nong','nou','nu','nuan','nue','nuo','nv','nve',
  'o','ou',
  'pa','pai','pan','pang','pao','pei','pen','peng','pi','pian','piao','pie','pin','ping','po','pou','pu',
  'qi','qia','qian','qiang','qiao','qie','qin','qing','qiong','qiu','qu','quan','que','qun',
  'ran','rang','rao','re','ren','reng','ri','rong','rou','ru','rua','ruan','rui','run','ruo',
  'sa','sai','san','sang','sao','se','sen','seng','sha','shai','shan','shang','shao','she','shei','shen','sheng','shi','shou','shu','shua','shuai','shuan','shuang','shui','shun','shuo','si','song','sou','su','suan','sui','sun','suo',
  'ta','tai','tan','tang','tao','te','tei','teng','ti','tian','tiao','tie','ting','tong','tou','tu','tuan','tui','tun','tuo',
  'wa','wai','wan','wang','wei','wen','weng','wo','wu',
  'xi','xia','xian','xiang','xiao','xie','xin','xing','xiong','xiu','xu','xuan','xue','xun',
  'ya','yan','yang','yao','ye','yi','yin','ying','yo','yong','you','yu','yuan','yue','yun',
  'za','zai','zan','zang','zao','ze','zei','zen','zeng','zha','zhai','zhan','zhang','zhao','zhe','zhei','zhen','zheng','zhi','zhong','zhou','zhu','zhua','zhuai','zhuan','zhuang','zhui','zhun','zhuo','zi','zong','zou','zu','zuan','zui','zun','zuo',
]);

const COMMON_ENGLISH_AMBIGUOUS = new Set([
  'a','an','am','as','at','be','by','do','go','he','hi','in','is','it','me','my','no','of','on','or','so','to','up','us','we',
  'ban','can','dan','fan','man','pan','ran','tan','van','bin','din','fin','pin','sin','tin','win','bun','fun','gun','nun','run','sun',
  'die','lie','pie','tie','due','hue','sue','age','are','bad','bag','bar','bat','bed','big','bit','box','boy','bus','but','buy',
  'car','cat','cup','cut','day','did','dog','ear','eat','end','eye','far','fat','few','fit','fly','for','get','god','got','had',
  'has','hat','her','him','his','hot','how','ice','its','job','joy','key','kid','law','lay','leg','let','lot','low','mad','map',
  'may','men','met','mix','mom','mud','new','not','now','nut','odd','off','oil','old','one','our','out','own','pay','pen','pet',
  'pig','pot','put','raw','red','rid','row','rub','sad','sat','saw','say','sea','see','set','she','shy','sit','six','sky','son',
  'tea','ten','the','too','top','toy','try','two','use','war','was','way','wet','who','why','yes','yet','you','zoo',
  'hello','world','good','morning','night','thank','thanks','please','sorry','water','food','book','time','love','home','work',
  'name','make','made','take','come','came','give','gave','find','know','knew','look','want','need','help','like','live','life',
  'here','there','where','when','what','which','this','that','these','those','with','from','have','been','were','will','would',
  'could','should','about','after','before','under','over','again','never','always','every','other','their','about','people',
  'china','chinese','english','bangla','bengali','study','learn','learning','school','teacher','student','friend','family','happy',
  'banana','mango','camera','piano','radio','video','music','paper','table','chair','house','phone','money','today','tomorrow',
]);

function canSegmentPinyinToken(token) {
  const clean = stripPinyinTones(token).replace(/[1-5]/g, '');
  if (!clean || !/^[a-z]+$/.test(clean)) return 0;
  const n = clean.length;
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1; // 1 = reachable (actual syllable count = dp[i] - 1)
  for (let i = 0; i < n; i++) {
    if (!dp[i]) continue;
    for (let len = 1; len <= 6 && i + len <= n; len++) {
      const sub = clean.slice(i, i + len);
      if (PINYIN_SYLLABLES.has(sub)) {
        const nextCount = dp[i] + 1;
        if (!dp[i + len] || nextCount < dp[i + len]) {
          dp[i + len] = nextCount;
        }
      }
    }
  }
  return dp[n] > 0 ? dp[n] - 1 : 0;
}

export function isLikelyPinyin(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  // Explicit Pinyin tone marks are a strong signal
  if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(s)) return true;
  // Must be Latin letters, spaces, apostrophes, or tone digits 1-4
  if (!/^[a-zA-Z0-9'\s-]+$/.test(s)) return false;

  const tokens = s.toLowerCase().split(/[\s'-]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 12) return false;

  // Tone-numbered pinyin like "ni3 hao3"
  if (tokens.some((tok) => /^[a-z]+[1-4]$/.test(tok) && canSegmentPinyinToken(tok) > 0)) {
    return true;
  }

  let totalSyllables = 0;
  let pinyinDistinctive = false;
  for (const tok of tokens) {
    if (COMMON_ENGLISH_AMBIGUOUS.has(tok)) return false;
    const count = canSegmentPinyinToken(tok);
    if (count === 0) return false;
    totalSyllables += count;
    if (/^(zh|ch|sh|q|x)/.test(tok) || /(zh|ch|sh|ao|uo|iu|ui|iang|iong|uang|uan|ue|ng)$/.test(tok) || count >= 2) {
      pinyinDistinctive = true;
    }
  }
  return totalSyllables >= 2 || (totalSyllables === 1 && pinyinDistinctive);
}

export function detectLanguageFromText(text) {
  const s = String(text || '').trim();
  if (!s) return { language: 'en', confidence: 0, isPinyin: false };
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
  if (total === 0) return { language: 'en', confidence: 0.2, isPinyin: false };
  if (bn >= zh && bn >= latin && bn > 0) return { language: 'bn', confidence: Number((bn / total).toFixed(2)), isPinyin: false };
  if (zh >= bn && zh >= latin && zh > 0) return { language: 'zh-Hans', confidence: Number((zh / total).toFixed(2)), isPinyin: false };
  if (isLikelyPinyin(s)) {
    return { language: 'zh-Hans', confidence: 0.85, isPinyin: true };
  }
  return { language: 'en', confidence: Number((latin / total).toFixed(2)), isPinyin: false };
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
      `(lower(word) LIKE ? OR lower(phonetic) LIKE ? OR phonetic_plain LIKE ? OR replace(phonetic_plain, ' ', '') LIKE ? OR lower(meaning_en) LIKE ? OR lower(meaning_bn) LIKE ? OR lower(meaning_zh) LIKE ? OR lower(meaning_id) LIKE ?)`
    );
    const like = `%${q}%`;
    const likePlain = `%${qPlain}%`;
    const likeCompact = `%${qCompact}%`;
    args.push(like, like, likePlain, likeCompact, like, like, like, like);
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
      WHEN lower(meaning_en) LIKE ? OR lower(meaning_bn) LIKE ? OR lower(meaning_zh) LIKE ? OR lower(meaning_id) LIKE ? THEN 4
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
      `SELECT id, language, word, phonetic, part_of_speech, meaning_en, meaning_bn, meaning_zh, meaning_id, example, example_translation, hsk_level, synonyms_json, antonyms_json, collocations_json, grammar_note, updated_at
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

/** Public single-entry lookup + Chinese character breakdown & related compound words for deep-linking (?w=...). */
export async function getDictionaryEntryDetails(env, url) {
  const id = (url.searchParams.get('id') || '').trim().slice(0, 80);
  const w = (url.searchParams.get('w') || '').trim().slice(0, 120);
  if (!id && !w) throw new HttpError(400, 'invalid-argument', 'Provide w or id');

  const row = id
    ? await env.DB.prepare(
        `SELECT * FROM dictionary_entries WHERE status = 'published' AND id = ? LIMIT 1`
      )
        .bind(id)
        .first()
    : await env.DB.prepare(
        `SELECT * FROM dictionary_entries WHERE status = 'published' AND lower(word) = lower(?) ORDER BY CASE WHEN language = 'zh' THEN 0 ELSE 1 END LIMIT 1`
      )
        .bind(w)
        .first();

  const targetWord = row?.word || w;
  const hanziChars = [...new Set(Array.from(targetWord).filter((ch) => /[\u4e00-\u9fff]/.test(ch)))].slice(0, 8);

  let charEntries = [];
  let relatedWords = [];

  if (hanziChars.length > 0) {
    const placeholders = hanziChars.map(() => '?').join(', ');
    const charRows = (
      await env.DB.prepare(
        `SELECT id, language, word, phonetic, part_of_speech, meaning_en, meaning_bn, meaning_zh, meaning_id, hsk_level
         FROM dictionary_entries
         WHERE status = 'published' AND language = 'zh' AND word IN (${placeholders})`
      )
        .bind(...hanziChars)
        .all()
    ).results;
    charEntries = charRows.map(shapeDictionaryRow);

    const likeClauses = hanziChars.map(() => 'word LIKE ?').join(' OR ');
    const likeArgs = hanziChars.map((ch) => `%${ch}%`);
    const relRows = (
      await env.DB.prepare(
        `SELECT id, language, word, phonetic, part_of_speech, meaning_en, meaning_bn, meaning_zh, meaning_id, hsk_level
         FROM dictionary_entries
         WHERE status = 'published' AND language = 'zh' AND word != ? AND (${likeClauses})
         ORDER BY length(word) ASC, word ASC LIMIT 8`
      )
        .bind(targetWord, ...likeArgs)
        .all()
    ).results;
    relatedWords = relRows.map(shapeDictionaryRow);
  }

  return {
    entry: row ? shapeDictionaryRow(row) : null,
    charEntries,
    relatedWords,
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

const GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP = 480000;

/** Normalize text before building a shared cache key (trim, collapse spaces, standardize quotes/punctuation). */
export function normalizeCacheText(text) {
  return String(text || '')
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/\s*([,.!?;:，。！？；：।])\s*/g, '$1')
    .replace(/([,.!?;:，。！？；：।])+$/g, '$1')
    .toLowerCase()
    .slice(0, 400);
}

export function buildTranslationCacheKey(sourceLang, targetLang, text) {
  return `${sourceLang}::${targetLang}::${normalizeCacheText(text)}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function canUseGoogleTranslate(env, charCount) {
  if (!env.GOOGLE_TRANSLATE_API_KEY) return false;
  try {
    const row = await env.DB.prepare(
      'SELECT chars_used FROM translation_quota_monthly WHERE month_key = ?'
    )
      .bind(currentMonthKey())
      .first();
    const used = Number(row?.chars_used || 0);
    return used + charCount <= GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP;
  } catch {
    return true;
  }
}

async function recordGoogleTranslateUsage(env, charCount) {
  try {
    const t = now();
    await env.DB.prepare(
      `INSERT INTO translation_quota_monthly (month_key, chars_used, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(month_key) DO UPDATE SET chars_used = chars_used + excluded.chars_used, updated_at = excluded.updated_at`
    )
      .bind(currentMonthKey(), charCount, t)
      .run();
  } catch {
    // Non-fatal quota telemetry error
  }
}

/** Admin-only ops view: Google free-tier usage this month + shared cache effectiveness. */
export async function adminTranslationQuota(env, ctx) {
  requireRole(ctx.user, 'teacher');
  const month = currentMonthKey();
  const q = await env.DB.prepare('SELECT chars_used, updated_at FROM translation_quota_monthly WHERE month_key = ?')
    .bind(month).first().catch(() => null);
  const c = await env.DB.prepare(
    'SELECT COUNT(*) AS entries, COALESCE(SUM(hits),0) AS hits FROM translation_cache'
  ).first().catch(() => null);
  const used = Number(q?.chars_used || 0);
  return {
    month,
    googleConfigured: Boolean(env.GOOGLE_TRANSLATE_API_KEY),
    charsUsed: used,
    charCap: GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP,
    charsRemaining: Math.max(0, GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP - used),
    percentUsed: Math.round((used / GOOGLE_TRANSLATE_MONTHLY_CHAR_CAP) * 1000) / 10,
    updatedAt: q?.updated_at || null,
    cache: { entries: Number(c?.entries || 0), totalHits: Number(c?.hits || 0) },
  };
}

async function callTranslationProvider(env, text, sourceLang, targetLang) {
  // 1. Google Cloud Translate v2 (if secret configured & within 480K/month free-tier safety cap)
  if (await canUseGoogleTranslate(env, text.length)) {
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
      if (res.ok) {
        const data = await res.json();
        const translated = data?.data?.translations?.[0]?.translatedText;
        if (translated) {
          await recordGoogleTranslateUsage(env, text.length);
          return { translatedText: translated, provider: 'google-translate' };
        }
      }
    } catch {
      // Fall through to next provider if Google Translate fails or times out
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

  // 3. Non-AI online fallback for multi-word sentences not in D1: MyMemory (supports en, bn, id, zh-CN)
  const pair = `${toProviderLang(sourceLang, 'mymemory')}|${toProviderLang(targetLang, 'mymemory')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`,
      {
        headers: { 'user-agent': 'Sanzar/1.0' },
        signal: controller.signal,
      }
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

function hasHanzi(text) {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(String(text || ''));
}

const EN_IRREGULAR_LEMMAS = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',
  went: 'go', gone: 'go', goes: 'go', going: 'go',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth', mice: 'mouse',
  said: 'say', made: 'make', took: 'take', taken: 'take', came: 'come', saw: 'see', seen: 'see',
  knew: 'know', known: 'know', got: 'get', gotten: 'get', gave: 'give', given: 'give',
  found: 'find', thought: 'think', told: 'tell', became: 'become', left: 'leave', felt: 'feel',
  brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep', held: 'hold',
  wrote: 'write', written: 'write', stood: 'stand', heard: 'hear', meant: 'mean', met: 'meet',
  ran: 'run', paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak', led: 'lead',
  grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall', fallen: 'fall', sent: 'send',
  built: 'build', understood: 'understand', drew: 'draw', drawn: 'draw', broke: 'break', broken: 'break',
  spent: 'spend', rose: 'rise', risen: 'rise', drove: 'drive', driven: 'drive', bought: 'buy',
  wore: 'wear', worn: 'wear', chose: 'choose', chosen: 'choose', ate: 'eat', eaten: 'eat',
  drank: 'drink', drunk: 'drink', slept: 'sleep', taught: 'teach', caught: 'catch', fought: 'fight',
  forgot: 'forget', forgotten: 'forget', forgave: 'forgive', forgiven: 'forgive',
  flew: 'fly', flown: 'fly', swam: 'swim', swum: 'swim', sang: 'sing', sung: 'sing', won: 'win',
};

const BN_SUFFIXES = [
  'গুলোকে', 'গুলির', 'গুলোর', 'গুলো', 'গুলি', 'দেরকে', 'দের',
  'টাকে', 'টিকে', 'টার', 'টির', 'খানা', 'খানি', 'টা', 'টি',
  'ছিলাম', 'ছিলে', 'ছিলেন', 'ছিল', 'তেছি', 'তেছে', 'ছেন', 'ছি', 'ছো', 'ছে',
  'লাম', 'লেন', 'বেন', 'বো', 'বে',
  'কে', 'তে', 'য়ে', 'এর', 'র',
];

/** Generate plausible dictionary base forms (lemmas) for inflected English or Bangla words. */
function getLemmaCandidates(word, dbLang) {
  const w = String(word || '').trim().toLowerCase();
  if (!w || w.includes(' ')) return [];
  const out = new Set();

  if (dbLang === 'en') {
    if (EN_IRREGULAR_LEMMAS[w]) out.add(EN_IRREGULAR_LEMMAS[w]);
    if (w.endsWith('ies') && w.length > 4) out.add(w.slice(0, -3) + 'y');
    if (w.endsWith('ied') && w.length > 4) out.add(w.slice(0, -3) + 'y');
    if (w.endsWith('ing') && w.length > 5) {
      const stem = w.slice(0, -3);
      out.add(stem);
      out.add(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        out.add(stem.slice(0, -1));
      }
    }
    if (w.endsWith('ed') && w.length > 4) {
      const stem = w.slice(0, -2);
      out.add(stem);
      out.add(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        out.add(stem.slice(0, -1));
      }
    }
    if (w.endsWith('es') && w.length > 3) out.add(w.slice(0, -2));
    if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) out.add(w.slice(0, -1));
    if (w.endsWith('er') && w.length > 4) {
      out.add(w.slice(0, -2));
      out.add(w.slice(0, -1));
    }
    if (w.endsWith('est') && w.length > 5) {
      out.add(w.slice(0, -3));
      out.add(w.slice(0, -2));
    }
    if (w.endsWith('ly') && w.length > 4) out.add(w.slice(0, -2));
  } else if (dbLang === 'bn') {
    for (const suf of BN_SUFFIXES) {
      if (w.endsWith(suf) && w.length - suf.length >= 2) {
        const stem = w.slice(0, -suf.length);
        out.add(stem);
        if (!stem.endsWith('া')) out.add(stem + 'া');
      }
    }
  }

  out.delete(w);
  return [...out].slice(0, 6);
}

/** 100% D1-backed Chinese word-by-word segmenter for tap-a-word sentence breakdown. */
async function lookupChineseSegments(env, text) {
  const clean = String(text || '').trim().slice(0, 180);
  if (!clean || !hasHanzi(clean)) return [];
  const hanziOnly = Array.from(clean).filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch));
  if (hanziOnly.length < 2) return [];
  const hanziSet = [...new Set(hanziOnly)].slice(0, 50);

  const placeholders = hanziSet.map(() => '?').join(', ');
  const rows = (
    await env.DB.prepare(
      `SELECT word, phonetic, meaning_en, meaning_bn, meaning_id, hsk_level FROM dictionary_entries
       WHERE status = 'published' AND language = 'zh' AND length(word) <= 4 AND substr(word, 1, 1) IN (${placeholders})`
    )
      .bind(...hanziSet)
      .all()
  ).results;

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.word)) map.set(r.word, r);
  }

  const chars = Array.from(clean);
  const segments = [];
  let i = 0;
  while (i < chars.length && segments.length < 24) {
    const ch = chars[i];
    if (!/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)) {
      i++;
      continue;
    }
    let matchedLen = 0;
    let matchedRow = null;
    for (let len = Math.min(4, chars.length - i); len >= 1; len--) {
      const sub = chars.slice(i, i + len).join('');
      if (map.has(sub)) {
        matchedLen = len;
        matchedRow = map.get(sub);
        break;
      }
    }
    if (matchedRow) {
      segments.push({
        word: matchedRow.word,
        pinyin: matchedRow.phonetic || '',
        meaningEn: matchedRow.meaning_en || '',
        meaningBn: matchedRow.meaning_bn || '',
        meaningId: matchedRow.meaning_id || '',
        hskLevel: matchedRow.hsk_level || '',
      });
      i += matchedLen;
    } else {
      segments.push({ word: ch, pinyin: '', meaningEn: '', meaningBn: '', meaningId: '', hskLevel: '' });
      i++;
    }
  }
  return segments;
}

/** 100% D1-backed Chinese Pinyin segmenter & lookup — zero AI cost, zero external API calls. */
/** High-frequency polyphone phrase disambiguation (zero-AI, <1ms). */
const POLYPHONE_PHRASES = {
  银行: 'yín háng', 行业: 'háng yè', 排行: 'pái háng', 同行: 'tóng háng',
  不行: 'bù xíng', 旅行: 'lǚ xíng', 步行: 'bù xíng', 行李: 'xíng li', 行动: 'xíng dòng', 举行: 'jǔ xíng',
  了解: 'liǎo jiě', 不得了: 'bù dé liǎo', 受不了: 'shòu bù liǎo', 来不了: 'lái bù liǎo',
  长大: 'zhǎng dà', 校长: 'xiào zhǎng', 家长: 'jiā zhǎng', 生长: 'shēng zhǎng', 成长: 'chéng zhǎng',
  很长: 'hěn cháng', 长期: 'cháng qī', 长城: 'cháng chéng', 长度: 'cháng dù',
  音乐: 'yīn yuè', 乐器: 'yuè qì', 快乐: 'kuài lè', 乐观: 'lè guān', 可乐: 'kě lè',
  头发: 'tóu fa', 理发: 'lǐ fà', 发现: 'fā xiàn', 发展: 'fā zhǎn', 发烧: 'fā shāo', 出发: 'chū fā',
  还是: 'hái shì', 还有: 'hái yǒu', 还没: 'hái méi', 还书: 'huán shū', 归还: 'guī huán', 还钱: 'huán qián',
  睡觉: 'shuì jiào', 午觉: 'wǔ jiào', 觉得: 'jué de', 感觉: 'gǎn jué', 决定: 'jué dìng',
  重要: 'zhòng yào', 严重: 'yán zhòng', 尊重: 'zūn zhòng', 重新: 'chóng xīn', 重复: 'chóng fù',
  首都: 'shǒu dū', 都市: 'dū shì', 都是: 'dōu shì', 都有: 'dōu yǒu',
  因为: 'yīn wèi', 为什么: 'wèi shén me', 为了: 'wèi le', 成为: 'chéng wéi', 认为: 'rèn wéi', 以为: 'yǐ wéi', 行为: 'xíng wéi',
  着急: 'zháo jí', 睡着: 'shuì zháo', 看着: 'kàn zhe', 拿着: 'ná zhe', 坐着: 'zuò zhe',
  得到: 'dé dào', 不得不: 'bù dé bù', 跑得快: 'pǎo de kuài', 说得好: 'shuō de hǎo',
  地方: 'dì fāng', 地图: 'dì tú', 地铁: 'dì tiě', 慢慢地: 'màn màn de', 认真地: 'rèn zhēn de',
  爱好: 'ài hào', 好奇: 'hào qí', 很好: 'hěn hǎo', 好吃: 'hǎo chī',
  少年: 'shào nián', 多少: 'duō shao', 很少: 'hěn shǎo',
  应该: 'yīng gāi', 答应: 'dā ying', 适应: 'shì yìng',
  教室: 'jiào shì', 教育: 'jiào yù', 教书: 'jiāo shū',
  空气: 'kōng qì', 有空: 'yǒu kòng', 空闲: 'kòng xián',
  困难: 'kùn nan', 灾难: 'zāi nàn', 数学: 'shù xué', 数字: 'shù zì', 数一数: 'shǔ yī shǔ',
  种类: 'zhǒng lèi', 种树: 'zhòng shù', 便宜: 'pián yi', 方便: 'fāng biàn',
  漂亮: 'piào liang', 干净: 'gān jìng', 干活: 'gàn huó', 饼干: 'bǐng gān',
  差不多: 'chà bù duō', 出差: 'chū chāi', 空调: 'kōng tiáo', 调查: 'diào chá',
};

/** Fallback single-character pinyin for high-frequency characters & polyphone default readings. */
const COMMON_CHAR_PINYIN = {
  的: 'de', 了: 'le', 地: 'de', 得: 'de', 着: 'zhe', 过: 'guò', 吗: 'ma', 呢: 'ne', 吧: 'ba', 啊: 'a',
  我: 'wǒ', 你: 'nǐ', 他: 'tā', 她: 'tā', 它: 'tā', 们: 'men', 这: 'zhè', 那: 'nà', 哪: 'nǎ', 谁: 'shuí',
  是: 'shì', 有: 'yǒu', 在: 'zài', 不: 'bù', 没: 'méi', 很: 'hěn', 太: 'tài', 都: 'dōu', 也: 'yě', 还: 'hái',
  就: 'jiù', 才: 'cái', 只: 'zhǐ', 把: 'bǎ', 被: 'bèi', 比: 'bǐ', 给: 'gěi', 对: 'duì', 跟: 'gēn', 和: 'hé',
  一: 'yī', 二: 'èr', 两: 'liǎng', 三: 'sān', 四: 'sì', 五: 'wǔ', 六: 'liù', 七: 'qī', 八: 'bā', 九: 'jiǔ', 十: 'shí',
  个: 'gè', 本: 'běn', 张: 'zhāng', 辆: 'liàng', 件: 'jiàn', 条: 'tiáo', 杯: 'bēi', 双: 'shuāng', 首: 'shǒu', 位: 'wèi',
  行: 'xíng', 长: 'cháng', 乐: 'lè', 发: 'fā', 觉: 'jué', 重: 'zhòng', 为: 'wèi', 好: 'hǎo', 少: 'shǎo', 干: 'gàn',
  去: 'qù', 来: 'lái', 做: 'zuò', 说: 'shuō', 看: 'kàn', 听: 'tīng', 吃: 'chī', 喝: 'hē', 买: 'mǎi', 写: 'xiě',
  读: 'dú', 学: 'xué', 想: 'xiǎng', 要: 'yào', 会: 'huì', 能: 'néng', 爱: 'ài', 跑: 'pǎo', 走: 'zǒu', 住: 'zhù',
  人: 'rén', 家: 'jiā', 书: 'shū', 钱: 'qián', 车: 'chē', 狗: 'gǒu', 猫: 'māo', 饭: 'fàn', 水: 'shuǐ', 茶: 'chá',
  大: 'dà', 小: 'xiǎo', 多: 'duō', 高: 'gāo', 快: 'kuài', 慢: 'màn', 新: 'xīn', 老: 'lǎo', 热: 'rè', 冷: 'lěng',
  天: 'tiān', 年: 'nián', 月: 'yuè', 日: 'rì', 今: 'jīn', 明: 'míng', 昨: 'zuó', 上: 'shàng', 下: 'xià', 中: 'zhōng',
};

async function lookupPinyinFromDb(env, text) {
  const clean = String(text || '').trim().slice(0, 300);
  if (!clean || !hasHanzi(clean)) return '';
  const hanziSet = [...new Set(Array.from(clean).filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)))].slice(0, 60);
  if (hanziSet.length === 0) return '';

  const placeholders = hanziSet.map(() => '?').join(', ');
  const rows = (
    await env.DB.prepare(
      `SELECT word, phonetic FROM dictionary_entries
       WHERE status = 'published' AND language = 'zh' AND phonetic != '' AND length(word) <= 4 AND substr(word, 1, 1) IN (${placeholders})`
    )
      .bind(...hanziSet)
      .all()
  ).results;

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.word)) map.set(r.word, r.phonetic);
  }
  for (const [phrase, py] of Object.entries(POLYPHONE_PHRASES)) {
    map.set(phrase, py);
  }

  const chars = Array.from(clean);
  const out = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (!/[\u3400-\u4dbf\u4e00-\u9fff]/.test(ch)) {
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      out.push(ch);
      i++;
      continue;
    }
    let matchedLen = 0;
    let matchedPy = '';
    for (let len = Math.min(4, chars.length - i); len >= 1; len--) {
      const sub = chars.slice(i, i + len).join('');
      if (map.has(sub)) {
        matchedLen = len;
        matchedPy = map.get(sub);
        break;
      }
    }
    if (matchedLen > 0) {
      out.push(matchedPy);
      i += matchedLen;
    } else if (COMMON_CHAR_PINYIN[ch]) {
      out.push(COMMON_CHAR_PINYIN[ch]);
      i++;
    } else {
      out.push(ch);
      i++;
    }
  }
  return out.join(' ').replace(/\s+([，。！？；：、,.!?;:])/g, '$1').trim();
}

export async function handleTranslate(env, input) {
  const text = str(input.text, { min: 1, max: 2000, field: 'Text' });
  const targetLang = normalizeApiLang(input.targetLanguage || input.target_language);
  if (!targetLang) {
    throw new HttpError(400, 'unsupported-language', 'Target language must be en, bn, id, or zh-Hans');
  }

  let sourceLang = input.sourceLanguage && input.sourceLanguage !== 'auto'
    ? normalizeApiLang(input.sourceLanguage)
    : null;
  const detected = detectLanguageFromText(text);
  if (!sourceLang) {
    sourceLang = detected.language;
  }

  // Symbols, punctuation, numbers, or emoji-only input needs no external translation
  if (!/\p{L}/u.test(text)) {
    return {
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      detectedSourceLanguage: detected.language,
      confidence: 1,
      provider: 'identity',
      matchedEntries: [],
    };
  }

  if (sourceLang === targetLang) {
    const samePinyin = sourceLang === 'zh-Hans' && hasHanzi(text) ? await lookupPinyinFromDb(env, text) : '';
    return {
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      detectedSourceLanguage: detected.language,
      confidence: detected.confidence,
      provider: 'identity',
      ...(samePinyin ? { sourcePinyin: samePinyin, targetPinyin: samePinyin } : {}),
      matchedEntries: [],
    };
  }

  let textToTranslate = text;
  let matchedEntries = [];
  if (text.length <= 80) {
    const q = text.trim().toLowerCase();
    const qPlain = stripPinyinTones(text);
    const qCompact = qPlain.replace(/\s+/g, '');
    const dbLang = toDbLang(sourceLang);
    let rows = (
      await env.DB.prepare(
        `SELECT * FROM dictionary_entries
         WHERE status = 'published' AND language = ? AND (lower(word) = ? OR phonetic_plain = ? OR replace(phonetic_plain, ' ', '') = ?)
         LIMIT 5`
      )
        .bind(dbLang, q, qPlain, qCompact)
        .all()
    ).results;
    if (rows.length === 0 && (dbLang === 'en' || dbLang === 'bn')) {
      const lemmas = getLemmaCandidates(q, dbLang);
      if (lemmas.length > 0) {
        const ph = lemmas.map(() => '?').join(', ');
        rows = (
          await env.DB.prepare(
            `SELECT * FROM dictionary_entries
             WHERE status = 'published' AND language = ? AND lower(word) IN (${ph})
             ORDER BY length(word) DESC LIMIT 5`
          )
            .bind(dbLang, ...lemmas)
            .all()
        ).results;
      }
    }
    matchedEntries = rows.map(shapeDictionaryRow);

    // Direct curated D1 dictionary translation first (instant, $0 cost, teacher-curated quality)
    if (matchedEntries.length > 0) {
      const top = matchedEntries[0];
      let directTranslated = '';
      let directTargetPinyin = '';
      if (targetLang === 'en' && top.meaning_en) directTranslated = top.meaning_en;
      else if (targetLang === 'bn' && top.meaning_bn) directTranslated = top.meaning_bn;
      else if (targetLang === 'id' && top.meaning_id) directTranslated = top.meaning_id;
      else if (targetLang === 'zh-Hans' && top.meaning_zh) directTranslated = top.meaning_zh;

      // Reverse lookup in Chinese HSK entries when translating EN/BN/ID -> ZH and meaning_zh wasn't filled
      if (targetLang === 'zh-Hans' && !directTranslated) {
        const revField = sourceLang === 'bn' ? 'meaning_bn' : sourceLang === 'id' ? 'meaning_id' : 'meaning_en';
        const rev = await env.DB.prepare(
          `SELECT word, phonetic FROM dictionary_entries
           WHERE status = 'published' AND language = 'zh' AND (lower(${revField}) = ? OR lower(${revField}) LIKE ? OR lower(${revField}) LIKE ?)
           ORDER BY length(word) ASC LIMIT 1`
        )
          .bind(q, `${q};%`, `%; ${q}%`)
          .first();
        if (rev?.word) {
          directTranslated = rev.word;
          directTargetPinyin = rev.phonetic || '';
        }
      }

      if (directTranslated) {
        const sourcePinyin = sourceLang === 'zh-Hans' ? (top.phonetic || await lookupPinyinFromDb(env, top.word)) : '';
        const targetPinyin = targetLang === 'zh-Hans'
          ? (directTargetPinyin || await lookupPinyinFromDb(env, directTranslated))
          : '';
        return {
          translatedText: directTranslated,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          detectedSourceLanguage: detected.language,
          isPinyin: Boolean(detected.isPinyin),
          confidence: 1,
          provider: 'sanzar-dictionary',
          ...(sourcePinyin ? { sourcePinyin } : {}),
          ...(targetPinyin ? { targetPinyin } : {}),
          matchedEntries,
        };
      }

      if (sourceLang === 'zh-Hans' && /^[a-zA-Z0-9'\s-]+$/.test(text)) {
        textToTranslate = top.word;
      }
    }
  }

  // Layer 2: Shared D1 translation_cache (instant <10ms for any repeated sentence across all students)
  const sharedCacheKey = buildTranslationCacheKey(sourceLang, targetLang, textToTranslate);
  try {
    const cached = await env.DB.prepare(
      `SELECT translated_text, source_pinyin, target_pinyin, provider FROM translation_cache WHERE cache_key = ? LIMIT 1`
    )
      .bind(sharedCacheKey)
      .first();
    if (cached?.translated_text) {
      env.DB.prepare(
        `UPDATE translation_cache SET hits = hits + 1, updated_at = ? WHERE cache_key = ?`
      )
        .bind(now(), sharedCacheKey)
        .run()
        .catch(() => {});
      return {
        translatedText: cached.translated_text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        detectedSourceLanguage: detected.language,
        isPinyin: Boolean(detected.isPinyin),
        confidence: detected.confidence,
        provider: cached.provider || 'sanzar-cache',
        cached: true,
        ...(cached.source_pinyin ? { sourcePinyin: cached.source_pinyin } : {}),
        ...(cached.target_pinyin ? { targetPinyin: cached.target_pinyin } : {}),
        matchedEntries,
      };
    }
  } catch {
    // Table not yet migrated or non-fatal cache miss
  }

  // Layer 3: External provider (Google Translate v2 within 480K/mo free cap -> LibreTranslate -> MyMemory)
  const result = await callTranslationProvider(env, textToTranslate, sourceLang, targetLang);

  const sourcePinyin = sourceLang === 'zh-Hans'
    ? (matchedEntries[0]?.phonetic || (hasHanzi(textToTranslate) ? await lookupPinyinFromDb(env, textToTranslate) : ''))
    : '';
  const targetPinyin = targetLang === 'zh-Hans' && hasHanzi(result.translatedText)
    ? await lookupPinyinFromDb(env, result.translatedText)
    : '';

  // Persist into shared D1 translation_cache so no other student ever triggers an external call for this phrase
  if (result.translatedText && textToTranslate.length <= 500) {
    try {
      const t = now();
      await env.DB.prepare(
        `INSERT INTO translation_cache (cache_key, source_language, target_language, source_text, translated_text, source_pinyin, target_pinyin, provider, hits, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           translated_text = excluded.translated_text,
           source_pinyin = excluded.source_pinyin,
           target_pinyin = excluded.target_pinyin,
           provider = excluded.provider,
           hits = translation_cache.hits + 1,
           updated_at = excluded.updated_at`
      )
        .bind(sharedCacheKey, sourceLang, targetLang, textToTranslate.trim(), result.translatedText, sourcePinyin, targetPinyin, result.provider, t, t)
        .run();
    } catch {
      // Non-fatal cache write error
    }
  }

  return {
    translatedText: result.translatedText,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    detectedSourceLanguage: detected.language,
    isPinyin: Boolean(detected.isPinyin),
    confidence: detected.confidence,
    provider: result.provider,
    ...(sourcePinyin ? { sourcePinyin } : {}),
    ...(targetPinyin ? { targetPinyin } : {}),
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

/** Public TTS audio proxy for English, Bangla, Indonesian, and Simplified Chinese (fixes missing OS voices & enables exact playbackRate). */
export async function handleDictionaryTts(url) {
  const text = (url.searchParams.get('text') || '').trim().slice(0, 200);
  if (!text) throw new HttpError(400, 'invalid-argument', 'Text is required');
  const norm = normalizeApiLang(url.searchParams.get('lang')) || 'en';
  const tl = norm === 'zh-Hans' ? 'zh-CN' : norm;

  const ttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(ttsUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      referer: 'https://translate.google.com/',
    },
  });
  if (!res.ok) throw new HttpError(502, 'tts-unavailable', 'Pronunciation audio unavailable');
  return new Response(res.body, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'public, max-age=86400',
    },
  });
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

  if (since > 0) {
    return { items: rows, serverTime: now() };
  }

  // Deduplicate active history by (source_language, target_language, normalized source_text)
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    const key = `${r.source_language}::${r.target_language}::${String(r.source_text || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return { items: deduped, serverTime: now() };
}

export async function batchTranslationHistory(env, ctx, input) {
  const items = Array.isArray(input.items) ? input.items : [input];
  if (items.length === 0 || items.length > 100) {
    throw new HttpError(400, 'invalid-argument', 'Provide 1 to 100 history items');
  }
  const t = now();
  const synced = [];

  for (const raw of items) {
    const incomingId = str(raw.id || newId('th'), { min: 2, max: 80, field: 'ID' });
    const sourceLang = normalizeApiLang(raw.source_language || raw.sourceLanguage || 'en') || 'en';
    const targetLang = normalizeApiLang(raw.target_language || raw.targetLanguage || 'bn') || 'bn';
    const sourceText = str(raw.source_text || raw.sourceText, { min: 1, max: 2000, field: 'Source text' });
    const translatedText = str(raw.translated_text || raw.translatedText, { min: 1, max: 4000, field: 'Translated text' });
    const provider = str(raw.provider || '', { max: 60, field: 'Provider' });
    const createdAt = Number(raw.created_at || raw.createdAt) || t;
    const updatedAt = Math.max(Number(raw.updated_at || raw.updatedAt) || t, t);
    const deletedAt = raw.deleted_at || raw.deletedAt ? Number(raw.deleted_at || raw.deletedAt) : null;

    // If an active record already exists for the exact same word + language pair, update it in place instead of duplicating
    if (!deletedAt) {
      const existing = await env.DB.prepare(
        `SELECT id FROM translation_history
         WHERE user_id = ? AND deleted_at IS NULL AND source_language = ? AND target_language = ? AND lower(trim(source_text)) = lower(trim(?))
         ORDER BY created_at DESC LIMIT 1`
      )
        .bind(ctx.user.uid, sourceLang, targetLang, sourceText)
        .first();

      if (existing && existing.id !== incomingId) {
        await env.DB.prepare(
          `UPDATE translation_history
           SET translated_text = ?, provider = ?, created_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
          .bind(translatedText, provider, createdAt, updatedAt, existing.id, ctx.user.uid)
          .run();

        // Soft-delete any older duplicates for the same word + pair
        await env.DB.prepare(
          `UPDATE translation_history
           SET deleted_at = ?, updated_at = ?
           WHERE user_id = ? AND deleted_at IS NULL AND id != ? AND source_language = ? AND target_language = ? AND lower(trim(source_text)) = lower(trim(?))`
        )
          .bind(t, t, ctx.user.uid, existing.id, sourceLang, targetLang, sourceText)
          .run();

        synced.push({
          id: existing.id,
          source_language: sourceLang,
          target_language: targetLang,
          source_text: sourceText,
          translated_text: translatedText,
          provider,
          created_at: createdAt,
          updated_at: updatedAt,
          deleted_at: null,
        });
        continue;
      }
    }

    await env.DB.prepare(
      `INSERT INTO translation_history (id, user_id, source_language, target_language, source_text, translated_text, provider, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         translated_text = excluded.translated_text,
         provider = excluded.provider,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at
       WHERE translation_history.user_id = excluded.user_id AND excluded.updated_at >= translation_history.updated_at`
    )
      .bind(incomingId, ctx.user.uid, sourceLang, targetLang, sourceText, translatedText, provider, createdAt, updatedAt, deletedAt)
      .run();

    synced.push({
      id: incomingId,
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
  requireRole(ctx.user, 'teacher');
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
    const meaningId = String(r.meaning_id || '').trim().slice(0, 500);
    const example = String(r.example || '').trim().slice(0, 500);
    const exampleTranslation = String(r.example_translation || '').trim().slice(0, 500);
    const hskLevel = String(r.hsk_level || '').trim().slice(0, 30);
    const synonymsJson = JSON.stringify(Array.isArray(r.synonyms) ? r.synonyms.slice(0, 12) : []);
    const antonymsJson = JSON.stringify(Array.isArray(r.antonyms) ? r.antonyms.slice(0, 12) : []);
    const collocationsJson = JSON.stringify(Array.isArray(r.collocations) ? r.collocations.slice(0, 10) : []);
    const grammarNote = String(r.grammar_note || '').trim().slice(0, 600);
    const status = ['draft', 'published', 'archived'].includes(r.status) ? r.status : defaultStatus;

    await env.DB.prepare(
      `INSERT INTO dictionary_entries
        (id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, meaning_id, example, example_translation, hsk_level, synonyms_json, antonyms_json, collocations_json, grammar_note, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        language=excluded.language, word=excluded.word, phonetic=excluded.phonetic, phonetic_plain=excluded.phonetic_plain,
        part_of_speech=excluded.part_of_speech, meaning_en=excluded.meaning_en, meaning_bn=excluded.meaning_bn,
        meaning_zh=excluded.meaning_zh, meaning_id=excluded.meaning_id, example=excluded.example, example_translation=excluded.example_translation,
        hsk_level=excluded.hsk_level, synonyms_json=excluded.synonyms_json, antonyms_json=excluded.antonyms_json,
        collocations_json=excluded.collocations_json, grammar_note=excluded.grammar_note,
        status=excluded.status, updated_at=excluded.updated_at`
    )
      .bind(id, dbLang, word, phonetic, phoneticPlain, partOfSpeech, meaningEn, meaningBn, meaningZh, meaningId, example, exampleTranslation, hskLevel, synonymsJson, antonymsJson, collocationsJson, grammarNote, status, ctx.user.uid, t, t)
      .run();
    imported++;
  }

  await audit(env, ctx, 'dictionary.import', `imported=${imported},skipped=${skipped}`);
  return { imported, skipped, errors };
}

/* ============================== grammar & advanced vocabulary insights ============================== */
function buildFallbackGrammar(text, language) {
  const trimmed = text.trim();
  const points = [];
  const tips = [];
  let correctedText = trimmed;
  let isCorrect = true;

  if (language === 'zh-Hans') {
    // Deterministic Chinese learner-mistake checks (zero AI)
    if (/比[^，。！？]{1,8}很/.test(correctedText)) {
      correctedText = correctedText.replace(/(比[^，。！？]{1,8})很/g, '$1');
      isCorrect = false;
      points.push({
        title: 'Avoid 很 in 比 comparisons',
        explanation: 'In A + 比 + B + Adjective sentences, do not put 很 before the adjective. Use 一点儿 or 得多 after the adjective instead.',
        example: '今天比昨天冷一点儿。',
      });
    }
    if (/不有/.test(correctedText)) {
      correctedText = correctedText.replace(/不有/g, '没有');
      isCorrect = false;
      points.push({
        title: 'Negate 有 with 没 (没有), never 不',
        explanation: 'Always use 没有 (méiyǒu) to negate 有; 不有 is ungrammatical in Mandarin.',
        example: '我没有时间。',
      });
    }
    if (/很越来越/.test(correctedText)) {
      correctedText = correctedText.replace(/很越来越/g, '越来越');
      isCorrect = false;
      points.push({
        title: 'Do not combine 很 with 越来越',
        explanation: '越来越 already expresses increasing degree, so omit 很.',
        example: '天气越来越热了。',
      });
    }
    if (/一个书/.test(correctedText)) {
      correctedText = correctedText.replace(/一个书/g, '一本书');
      isCorrect = false;
      points.push({
        title: 'Measure word for books: 本 (běn)',
        explanation: 'Books take the classifier 本 (一本书), not the general classifier 个.',
        example: '我买了一本书。',
      });
    }
    if (/不有/.test(correctedText)) {
      correctedText = correctedText.replace(/不有/g, '没有');
      isCorrect = false;
      points.push({
        title: 'Negate 有 with 没 (没有)',
        explanation: 'Always negate 有 (to have / exist) with 没, never 不.',
        example: '我没有时间。(Wǒ méiyǒu shíjiān.)',
      });
    }
    if (/二([个本张辆只件杯条把双首封位])/.test(correctedText)) {
      correctedText = correctedText.replace(/二([个本张辆只件杯条把双首封位])/g, '两$1');
      isCorrect = false;
      points.push({
        title: 'Use 两 (liǎng) before measure words',
        explanation: 'Before a measure word (个, 本, 张, 辆, 杯, etc.), use 两 instead of 二.',
        example: '我有两个朋友 / 两本书。',
      });
    }
    if (/是(很|非常|太)(好|高|大|小|忙|累|热|冷|漂亮|高兴|开心)/.test(correctedText)) {
      correctedText = correctedText.replace(/是(很|非常|太)(好|高|大|小|忙|累|热|冷|漂亮|高兴|开心)/g, '$1$2');
      isCorrect = false;
      points.push({
        title: 'Do not use 是 before 很 + Adjective',
        explanation: 'In Mandarin, adjectives link directly to the subject with 很 (e.g., 我很好), not 是.',
        example: '我今天很忙。(Not 我今天是很忙)',
      });
    }
    if (/没有?([^，。！？]{1,6})了/.test(correctedText) && !/没有.*了$/.test(correctedText.replace(/没有钱了|没有时间了/, ''))) {
      correctedText = correctedText.replace(/(没有?[^，。！？]{1,4})了/g, '$1');
      isCorrect = false;
      points.push({
        title: 'Do not combine 没/没有 with 了 for negated actions',
        explanation: 'When negating a past action with 没/没有, omit the completed-action particle 了.',
        example: '我昨天没去学校。(Not 我昨天没去了学校)',
      });
    }
    if (/正在([^，。！？]{1,8})了/.test(correctedText)) {
      correctedText = correctedText.replace(/(正在[^，。！？]{1,8})了/g, '$1');
      isCorrect = false;
      points.push({
        title: 'Do not combine 正在 (ongoing) with 了 (completed)',
        explanation: '正在 marks an action in progress; pair it with 呢 instead of 了.',
        example: '我正在吃饭呢。',
      });
    }
    if (/(跑|说|写|唱|跳|学|做)的(很好|很快|很慢|不错|快|好)/.test(correctedText)) {
      correctedText = correctedText.replace(/(跑|说|写|唱|跳|学|做)的(很好|很快|很慢|不错|快|好)/g, '$1得$2');
      isCorrect = false;
      points.push({
        title: 'Use 得 (de) for verb degree complements',
        explanation: 'After a verb describing how well/fast an action is done, use 得 instead of 的.',
        example: '他说得很好 / 跑得很快。',
      });
    }
    if (/(认真|高兴|慢慢|仔细)的(学习|说|走|看|工作)/.test(correctedText)) {
      correctedText = correctedText.replace(/(认真|高兴|慢慢|仔细)的(学习|说|走|看|工作)/g, '$1地$2');
      isCorrect = false;
      points.push({
        title: 'Use 地 (de) between adverbs and verbs',
        explanation: 'When an adverb modifies a verb, link them with 地 instead of 的.',
        example: '他认真地学习中文。',
      });
    }
    if (/(学习|工作|吃饭|看书)(在[\u4e00-\u9fff]{1,5})/.test(correctedText)) {
      correctedText = correctedText.replace(/(学习|工作|吃饭|看书)(在[\u4e00-\u9fff]{1,5})/g, '$2$1');
      isCorrect = false;
      points.push({
        title: 'Place phrase (在 + Place) goes before the verb',
        explanation: 'Standard Mandarin word order is Subject + 在 + Place + Verb.',
        example: '我在学校学习中文。',
      });
    }
    if (/很(非常|特别|极了)/.test(correctedText)) {
      correctedText = correctedText.replace(/很(非常|特别)/g, '$1');
      isCorrect = false;
      points.push({
        title: 'Avoid stacking degree adverbs',
        explanation: 'Do not combine 很 with 非常 or 特别; pick one degree adverb.',
        example: '这里非常漂亮。',
      });
    }
    const zhMeasureMap = [
      { re: /([一两三四五六七八九十几这那])个(车|汽车|自行车)/g, mw: '辆', label: 'vehicles: 辆 (liàng)' },
      { re: /([一两三四五六七八九十几这那])个(猫|狗|鸟)/g, mw: '只', label: 'small animals: 只 (zhī)' },
      { re: /([一两三四五六七八九十几这那])个(桌子|床|纸|票)/g, mw: '张', label: 'flat objects: 张 (zhāng)' },
      { re: /([一两三四五六七八九十几这那])个(衣服|衬衫|外套)/g, mw: '件', label: 'clothing: 件 (jiàn)' },
      { re: /([一两三四五六七八九十几这那])个(电影|手机)/g, mw: '部', label: 'movies/phones: 部 (bù)' },
      { re: /([一两三四五六七八九十几这那])个(水|茶|咖啡|牛奶)/g, mw: '杯', label: 'drinks: 杯 (bēi)' },
      { re: /([一两三四五六七八九十几这那])个(鱼|裤子|路|河)/g, mw: '条', label: 'long/flexible things: 条 (tiáo)' },
      { re: /([一两三四五六七八九十几这那])个(椅子|伞|刀)/g, mw: '把', label: 'objects with handles: 把 (bǎ)' },
      { re: /([一两三四五六七八九十几这那])个(鞋|鞋子|筷子|袜子)/g, mw: '双', label: 'pairs: 双 (shuāng)' },
      { re: /([一两三四五六七八九十几这那])个(歌|诗)/g, mw: '首', label: 'songs/poems: 首 (shǒu)' },
    ];
    for (const rule of zhMeasureMap) {
      if (rule.re.test(correctedText)) {
        correctedText = correctedText.replace(rule.re, `$1${rule.mw}$2`);
        isCorrect = false;
        points.push({
          title: `Measure word for ${rule.label}`,
          explanation: `Use the specific classifier ${rule.mw} instead of the general classifier 个.`,
        });
      }
    }
    if (trimmed.includes('了')) {
      points.push({
        title: 'Aspect particle 了 (le)',
        explanation: 'Marks a completed action or a new state/change of situation.',
        example: '我吃了饭。(Wǒ chī le fàn.)',
      });
    }
    if (/[的得地]/.test(trimmed)) {
      points.push({
        title: 'Structural particles 的 / 地 / 得',
        explanation: '的 links modifiers to nouns, 地 links adverbs to verbs, and 得 links verbs to degree/result complements.',
        example: '认真地学习 / 说得很好',
      });
    }
    if (/[吗呢吧]/.test(trimmed)) {
      points.push({
        title: 'Sentence-final modal particles (吗 / 呢 / 吧)',
        explanation: '吗 forms yes/no questions, 呢 softens questions or shows ongoing action, and 吧 expresses suggestion or confirmation.',
      });
    }
    if (/[把被]/.test(trimmed)) {
      points.push({
        title: '把 / 被 disposal & passive structures',
        explanation: '把 emphasizes how an object is handled (Subject + 把 + Object + Verb + Result); 被 marks passive voice.',
      });
    }
    if (points.length === 0) {
      points.push({
        title: 'Chinese word order (SVO)',
        explanation: 'Standard Mandarin follows Subject + Time + Place + Verb + Object, with modifiers placed before the noun or verb they describe.',
        example: '我今天在学校学习中文。',
      });
    }
    tips.push('Pay attention to Pinyin tones — changing a tone changes the meaning of a syllable.');
    return {
      isCorrect,
      correctedText,
      summary: isCorrect
        ? 'Analyzed Chinese sentence structure, particles, and usage.'
        : 'Detected a common Chinese grammar issue and suggested a fix.',
      points,
      tips,
    };
  }

  if (language === 'bn') {
    // Deterministic Bangla register & negation mistake checks (zero AI)
    if (/আপনি\b/.test(correctedText) && /(করো|যাও|খাও|বলো|পড়ো|আছো)([।!?]?)$/.test(correctedText)) {
      const formalMap = { করো: 'করেন', যাও: 'যান', খাও: 'খান', বলো: 'বলেন', পড়ো: 'পড়েন', আছো: 'আছেন' };
      correctedText = correctedText.replace(/(করো|যাও|খাও|বলো|পড়ো|আছো)([।!?]?)$/, (_, v, p) => `${formalMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Honorific verb agreement (আপনি)',
        explanation: 'With formal আপনি, use formal verb endings (-এন: করেন, যান, আছেন) instead of familiar তুমি endings (-ও).',
        example: 'আপনি কেমন আছেন?',
      });
    } else if (/তুমি\b/.test(correctedText) && /(করেন|যান|খান|বলেন|পড়েন|আছেন)([।!?]?)$/.test(correctedText)) {
      const famMap = { করেন: 'করো', যান: 'যাও', খান: 'খাও', বলেন: 'বলো', পড়েন: 'পড়ো', আছেন: 'আছো' };
      correctedText = correctedText.replace(/(করেন|যান|খান|বলেন|পড়েন|আছেন)([।!?]?)$/, (_, v, p) => `${famMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Familiar verb agreement (তুমি)',
        explanation: 'With familiar তুমি, use familiar verb endings (-ও: করো, যাও, আছো) instead of formal আপনি endings (-এন).',
        example: 'তুমি কেমন আছো?',
      });
    } else if (/তুই\b/.test(correctedText) && /(করেন|করো|যান|যাও|খান|খাও|আছেন|আছো)([।!?]?)$/.test(correctedText)) {
      const intMap = { করেন: 'করিস', করো: 'করিস', যান: 'যাস', যাও: 'যাস', খান: 'খাস', খাও: 'খাস', আছেন: 'আছিস', আছো: 'আছিস' };
      correctedText = correctedText.replace(/(করেন|করো|যান|যাও|খান|খাও|আছেন|আছো)([।!?]?)$/, (_, v, p) => `${intMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Intimate verb agreement (তুই)',
        explanation: 'With intimate তুই, use -ইস/-স verb endings (করিস, যাস, আছিস).',
        example: 'তুই কেমন আছিস?',
      });
    } else if (/^আমি\s/.test(correctedText) && /(করো|করেন|যাও|যান|খাও|খান|আছো|আছেন)([।!?]?)$/.test(correctedText)) {
      const firstMap = { করো: 'করি', করেন: 'করি', যাও: 'যাই', যান: 'যাই', খাও: 'খাই', খান: 'খাই', আছো: 'আছি', আছেন: 'আছি' };
      correctedText = correctedText.replace(/(করো|করেন|যাও|যান|খাও|খান|আছো|আছেন)([।!?]?)$/, (_, v, p) => `${firstMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'First-person verb agreement (আমি)',
        explanation: 'With আমি, use first-person verb endings (-ই: করি, যাই, আছি).',
        example: 'আমি ভালো আছি।',
      });
    }
    if (/গতকাল/.test(correctedText) && /(যাব|করব|খাব|পড়ব)([।!?]?)$/.test(correctedText)) {
      const pastMap = { যাব: 'গিয়েছিলাম', করব: 'করেছিলাম', খাব: 'খেয়েছিলাম', পড়ব: 'পড়েছিলাম' };
      correctedText = correctedText.replace(/(যাব|করব|খাব|পড়ব)([।!?]?)$/, (_, v, p) => `${pastMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Past tense with গতকাল (yesterday)',
        explanation: 'গতকাল refers to yesterday, so use a past-tense verb instead of future tense (-ব).',
        example: 'আমি গতকাল বাজারে গিয়েছিলাম।',
      });
    }
    if (/আগামীকাল/.test(correctedText) && /(গিয়েছিলাম|করেছিলাম|খেয়েছিলাম|পড়েছিলাম)([।!?]?)$/.test(correctedText)) {
      const futMap = { গিয়েছিলাম: 'যাব', করেছিলাম: 'করব', খেয়েছিলাম: 'খাব', পড়েছিলাম: 'পড়ব' };
      correctedText = correctedText.replace(/(গিয়েছিলাম|করেছিলাম|খেয়েছিলাম|পড়েছিলাম)([।!?]?)$/, (_, v, p) => `${futMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Future tense with আগামীকাল (tomorrow)',
        explanation: 'আগামীকাল refers to tomorrow, so use future tense (-ব) instead of past tense.',
        example: 'আমি আগামীকাল ঢাকা যাব।',
      });
    }
    if (/তিনি\s/.test(correctedText) && /(করে|যায়|খায়|বলে|পড়ে|আছে)([।!?]?)$/.test(correctedText)) {
      const hon3Map = { করে: 'করেন', যায়: 'যান', খায়: 'খান', বলে: 'বলেন', পড়ে: 'পড়েন', আছে: 'আছেন' };
      correctedText = correctedText.replace(/(করে|যায়|খায়|বলে|পড়ে|আছে)([।!?]?)$/, (_, v, p) => `${hon3Map[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Honorific third-person agreement (তিনি)',
        explanation: 'With respectful তিনি, use formal verb endings (-এন: করেন, যান, আছেন) instead of casual সে endings.',
        example: 'তিনি বাংলা পড়ান।',
      });
    }
    if (/এখন/.test(correctedText) && /(গিয়েছিলাম|করেছিলাম|খেয়েছিলাম)([।!?]?)$/.test(correctedText)) {
      const nowMap = { গিয়েছিলাম: 'যাচ্ছি', করেছিলাম: 'করছি', খেয়েছিলাম: 'খাচ্ছি' };
      correctedText = correctedText.replace(/(গিয়েছিলাম|করেছিলাম|খেয়েছিলাম)([।!?]?)$/, (_, v, p) => `${nowMap[v] || v}${p}`);
      isCorrect = false;
      points.push({
        title: 'Present continuous with এখন (now)',
        explanation: 'এখন refers to right now; use present continuous (-ছি) instead of past tense.',
        example: 'আমি এখন বই পড়ছি।',
      });
    }
    if (/\sনা\s+(যাই|খাই|করি|জানি|পড়ি|বলি)([।!?]?)$/.test(correctedText)) {
      correctedText = correctedText.replace(/\sনা\s+(যাই|খাই|করি|জানি|পড়ি|বলি)([।!?]?)$/, ' $1 না$2');
      isCorrect = false;
      points.push({
        title: 'Negation word order (Verb + না)',
        explanation: 'In declarative Bangla sentences, না comes after the verb (e.g., আমি জানি না, not আমি না জানি).',
        example: 'আমি জানি না।',
      });
    }
    if (/(যাব|করব|খাব|পড়ব)\s*নি([।!?]?)$/.test(correctedText)) {
      correctedText = correctedText.replace(/(যাব|করব|খাব|পড়ব)\s*নি([।!?]?)$/, '$1 না$2');
      isCorrect = false;
      points.push({
        title: 'Use না (not নি) with future tense',
        explanation: 'নি only negates completed past actions; use না for future tense (যাব না, করব না).',
        example: 'আমি কাল যাব না।',
      });
    }
    if (/একটা\s+(মানুষ|শিক্ষক|বন্ধু|ছাত্র|ছাত্রী|ডাক্তার|ছেলে|মেয়ে)/.test(correctedText)) {
      correctedText = correctedText.replace(/একটা\s+(মানুষ|শিক্ষক|বন্ধু|ছাত্র|ছাত্রী|ডাক্তার|ছেলে|মেয়ে)/g, 'একজন $1');
      isCorrect = false;
      points.push({
        title: 'Classifier for people: একজন',
        explanation: 'Use একজন (not একটা) when counting people.',
        example: 'তিনি একজন ভালো শিক্ষক।',
      });
    }
    if (/(সব|অনেক)\s+\S+(রা|গুলো)\b/.test(correctedText)) {
      points.push({
        title: 'Avoid double plural in Bangla',
        explanation: 'After quantifiers like সব (all) or অনেক (many), Bangla usually omits plural suffixes (-রা / -গুলো).',
        example: 'অনেক মানুষ (instead of অনেক মানুষগুলো).',
      });
    }
    if (/আপনি|আপনার|আপনাকে/.test(trimmed)) {
      points.push({
        title: 'Formal register (আপনি)',
        explanation: 'Uses respectful/formal pronouns and matching verb endings (e.g., করেন, যান, বলছেন).',
      });
    } else if (/তুমি|তোমার|তোমাকে/.test(trimmed)) {
      points.push({
        title: 'Familiar register (তুমি)',
        explanation: 'Uses friendly/familiar pronouns with matching verb endings (e.g., করো, যাও, বলছো).',
      });
    }
    if (/\s(না|নি)$/.test(trimmed) || /(না|নি)[।!?]?$/.test(trimmed)) {
      points.push({
        title: 'Negation (না / নি)',
        explanation: 'না negates present/future/habitual verbs; নি negates completed past actions (present/past perfect).',
        example: 'আমি যাইনি (I have not gone) / আমি যাই না (I do not go).',
      });
    }
    if (points.length === 0) {
      points.push({
        title: 'Bangla SOV word order',
        explanation: 'Bangla normally places the verb at the end of the clause (Subject + Object + Verb) and uses postpositions after nouns.',
        example: 'আমি প্রতিদিন বাংলা শিখি।',
      });
    }
    tips.push('Match verb endings with the pronoun formality level (আপনি / তুমি / তুই).');
    return {
      isCorrect,
      correctedText,
      summary: isCorrect
        ? 'Analyzed Bangla register, word order, and grammatical particles.'
        : 'Detected a Bangla verb-register mismatch and suggested a correction.',
      points,
      tips,
    };
  }

  if (language === 'id') {
    if (/\bdi(rumah|sini|sana|situ|sekolah|kantor|pasar|kota|jalan)\b/i.test(correctedText)) {
      correctedText = correctedText.replace(/\bdi(rumah|sini|sana|situ|sekolah|kantor|pasar|kota|jalan)\b/gi, 'di $1');
      isCorrect = false;
      points.push({
        title: 'Preposition "di" is written separately',
        explanation: 'Write "di" separately before place nouns (e.g., "di rumah", "di sekolah"), unlike passive verb prefixes (e.g., "dibaca").',
        example: 'Saya belajar di rumah.',
      });
    }
    if (/\btidak\s+(saya|kamu|dia|buku|rumah|guru|siswa|mahasiswa|orang)\b/i.test(correctedText)) {
      correctedText = correctedText.replace(/\btidak\s+(saya|kamu|dia|buku|rumah|guru|siswa|mahasiswa|orang)\b/gi, 'bukan $1');
      isCorrect = false;
      points.push({
        title: 'Negate nouns with "bukan", not "tidak"',
        explanation: 'Use "tidak" to negate verbs and adjectives, and "bukan" to negate nouns or noun phrases.',
        example: 'Ini bukan buku saya.',
      });
    }
    if (points.length === 0) {
      points.push({
        title: 'Indonesian SVO word order & modifiers',
        explanation: 'Standard Indonesian follows Subject + Verb + Object, and adjectives/modifiers follow the noun (e.g., "buku baru" = new book).',
        example: 'Saya belajar bahasa Indonesia setiap hari.',
      });
    }
    tips.push('Use "tidak" for verbs/adjectives, "bukan" for nouns, and separate "di" before locations.');
    return {
      isCorrect,
      correctedText,
      summary: isCorrect
        ? 'Analyzed Indonesian sentence structure, negation, and prepositions.'
        : 'Detected a common Indonesian grammar issue and suggested a fix.',
      points,
      tips,
    };
  }

  // English deterministic checks
  if (/^[a-z]/.test(trimmed) && trimmed.includes(' ')) {
    correctedText = trimmed[0].toUpperCase() + trimmed.slice(1);
    isCorrect = false;
    points.push({
      title: 'Sentence capitalization',
      explanation: 'Start complete English sentences with a capital letter.',
      example: correctedText,
    });
  }
  if (/\b(he|she|it)\s+don't\b/i.test(correctedText)) {
    correctedText = correctedText.replace(/\b(he|she|it)\s+don't\b/gi, '$1 doesn\'t');
    isCorrect = false;
    points.push({
      title: 'Subject–verb agreement (doesn\'t)',
      explanation: 'Use "doesn\'t" with third-person singular subjects (he, she, it).',
      example: 'She doesn\'t know yet.',
    });
  }
  if (/\ba\s+[aeiou]\w*/i.test(correctedText)) {
    points.push({
      title: 'Indefinite article (a vs. an)',
      explanation: 'Use "an" before vowel sounds (an apple, an hour) and "a" before consonant sounds (a book, a university).',
    });
  }
  if (points.length === 0) {
    points.push({
      title: 'English SVO structure & agreement',
      explanation: 'Standard English follows Subject + Verb + Object. Ensure tense consistency and subject–verb agreement.',
    });
  }
  tips.push('Check verb tense consistency and articles (a / an / the) for natural phrasing.');

  return {
    isCorrect,
    correctedText,
    summary: isCorrect
      ? 'No obvious grammar errors detected.'
      : 'Suggested a quick grammar polish for more natural English.',
    points,
    tips,
  };
}

/** Specificity-scored grammar pattern matcher: longer/multi-part patterns rank above short generic tokens. */
function scoreGrammarPattern(text, pattern) {
  if (!pattern || !pattern.trim()) return 0;
  const parts = pattern.split('|').map((p) => p.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  let matchedCount = 0;
  let maxLen = 0;
  for (const p of parts) {
    let hit = false;
    if (/^[a-z0-9']+$/i.test(p)) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
      hit = re.test(text);
    } else {
      hit = lower.includes(p.toLowerCase());
    }
    if (hit) {
      matchedCount++;
      if (p.length > maxLen) maxLen = p.length;
    }
  }
  if (matchedCount === 0) return 0;
  // Bonus when multiple paired parts match (e.g. 虽然|但是 or যদি|তাহলে) + length specificity
  return (matchedCount >= 2 ? 20 : 0) + maxLen * 3 + matchedCount;
}

/** Optional free rule-based English grammar check via LanguageTool public API, cached in D1 so repeated sentences never hit the API. */
async function checkEnglishWithLanguageTool(env, text) {
  const clean = String(text || '').trim();
  if (!clean || clean.length > 300 || !/\s/.test(clean)) return null;

  const cacheKey = `lt::en::${normalizeCacheText(clean)}`;
  try {
    const cached = await env.DB.prepare(
      `SELECT corrected_text, points_json FROM grammar_cache WHERE cache_key = ? LIMIT 1`
    )
      .bind(cacheKey)
      .first();
    if (cached) {
      env.DB.prepare(`UPDATE grammar_cache SET hits = hits + 1, updated_at = ? WHERE cache_key = ?`)
        .bind(now(), cacheKey)
        .run()
        .catch(() => {});
      const points = safeParseArray(cached.points_json);
      return points.length > 0 ? { correctedText: cached.corrected_text || clean, points, cached: true } : null;
    }
  } catch {
    // Table not yet migrated or non-fatal cache miss
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Sanzar/1.0' },
      body: new URLSearchParams({ text: clean, language: 'en-US' }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const matches = Array.isArray(data?.matches) ? data.matches.slice(0, 3) : [];

    // Apply non-overlapping top replacements from right to left to build correctedText
    let corrected = clean;
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);
    let lastStart = Infinity;
    const points = [];
    for (const m of sorted) {
      const rep = m?.replacements?.[0]?.value;
      if (typeof m.offset === 'number' && typeof m.length === 'number' && rep && m.offset + m.length <= lastStart) {
        corrected = corrected.slice(0, m.offset) + rep + corrected.slice(m.offset + m.length);
        lastStart = m.offset;
      }
      if (m.message) {
        points.unshift({
          title: m.shortMessage || m.rule?.category?.name || 'English Grammar Suggestion',
          explanation: m.message,
          ...(rep ? { example: `Suggestion: "${rep}"` } : {}),
        });
      }
    }

    // Persist in D1 grammar_cache (including empty matches) so 1000+ students checking the same sentence never re-call LanguageTool
    try {
      const t = now();
      await env.DB.prepare(
        `INSERT INTO grammar_cache (cache_key, language, source_text, corrected_text, points_json, hits, created_at, updated_at)
         VALUES (?, 'en', ?, ?, ?, 1, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           corrected_text = excluded.corrected_text,
           points_json = excluded.points_json,
           hits = grammar_cache.hits + 1,
           updated_at = excluded.updated_at`
      )
        .bind(cacheKey, clean.slice(0, 500), corrected.slice(0, 500), JSON.stringify(points), t, t)
        .run();
    } catch {
      // Non-fatal cache write error
    }

    return points.length > 0 ? { correctedText: corrected, points } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 100% D1-backed Grammar Assistance & Advanced Vocabulary — zero AI fallback, <10ms lookup. */
export async function handleLanguageInsights(env, input) {
  const text = str(input.text, { min: 1, max: 1200, field: 'Text' });
  const requested = input.language && input.language !== 'auto' ? normalizeApiLang(input.language) : null;
  const detected = detectLanguageFromText(text);
  const language = requested || detected.language;
  const dbLang = toDbLang(language);
  const q = text.trim().toLowerCase();
  const qPlain = stripPinyinTones(text);

  // 1. Lookup exact word, lemma, or key content words from D1 dictionary_entries
  let entries = (
    await env.DB.prepare(
      `SELECT * FROM dictionary_entries
       WHERE status = 'published' AND language = ? AND (lower(word) = ? OR phonetic_plain = ?)
       ORDER BY CASE WHEN synonyms_json != '[]' THEN 0 ELSE 1 END LIMIT 3`
    )
      .bind(dbLang, q, qPlain)
      .all()
  ).results;

  // Lemma fallback for inflected single words (English -ing/-ed/-s/irregulars & Bangla suffixes)
  if (entries.length === 0 && (dbLang === 'en' || dbLang === 'bn')) {
    const lemmas = getLemmaCandidates(q, dbLang);
    if (lemmas.length > 0) {
      const ph = lemmas.map(() => '?').join(', ');
      entries = (
        await env.DB.prepare(
          `SELECT * FROM dictionary_entries
           WHERE status = 'published' AND language = ? AND lower(word) IN (${ph})
           ORDER BY CASE WHEN synonyms_json != '[]' THEN 0 ELSE 1 END, length(word) DESC LIMIT 3`
        )
          .bind(dbLang, ...lemmas)
          .all()
      ).results;
    }
  }

  // If input is a phrase/sentence (or comma/semicolon translation string like "do; make"), match tokens inside it
  if (entries.length === 0) {
    const tokens =
      dbLang === 'zh'
        ? [...new Set(
            [
              ...Array.from(text.trim()).slice(0, 12).map((_, idx, arr) => arr.slice(idx, idx + 2).join('')).filter((s) => s.length === 2 && hasHanzi(s)),
              ...Array.from(text.trim()).filter((ch) => hasHanzi(ch)),
            ]
          )].slice(0, 10)
        : [...new Set(
            text
              .toLowerCase()
              .split(/[\s,;.!?/()।]+/)
              .map((t) => t.trim())
              .filter((t) => t.length >= 2)
          )].slice(0, 10);

    if (tokens.length > 0) {
      const ph = tokens.map(() => '?').join(', ');
      entries = (
        await env.DB.prepare(
          `SELECT * FROM dictionary_entries
           WHERE status = 'published' AND language = ? AND lower(word) IN (${ph})
           ORDER BY length(word) DESC, CASE WHEN synonyms_json != '[]' THEN 0 ELSE 1 END LIMIT 4`
        )
          .bind(dbLang, ...tokens.map((t) => t.toLowerCase()))
          .all()
      ).results;
    }
  }

  const synonyms = [];
  const antonyms = [];
  const collocations = [];
  const relatedWords = [];
  let partOfSpeech = entries[0]?.part_of_speech || undefined;
  const entryGrammarNotes = [];

  const isRelevantCollocation = (phrase, rowWord) => {
    const p = String(phrase || '').trim();
    if (!p || p.length > 100) return false;
    if (dbLang === 'bn') {
      if (!/[\u0980-\u09FF]/.test(p)) return false;
      const w = String(rowWord || '').trim();
      const stem = w.length >= 3 ? w.slice(0, Math.max(3, w.length - 1)) : w;
      const qStem = q.length >= 3 ? q.slice(0, Math.max(3, q.length - 1)) : q;
      if (w && !p.includes(w) && (!stem || !p.includes(stem)) && (!qStem || !p.includes(qStem))) {
        return false;
      }
    }
    return true;
  };

  for (const row of entries) {
    for (const s of safeParseArray(row.synonyms_json)) {
      if (s?.word && synonyms.length < 8 && !synonyms.some((x) => x.word === s.word)) synonyms.push(s);
    }
    for (const a of safeParseArray(row.antonyms_json)) {
      if (a?.word && antonyms.length < 8 && !antonyms.some((x) => x.word === a.word)) antonyms.push(a);
    }
    for (const c of safeParseArray(row.collocations_json)) {
      if (c?.phrase && isRelevantCollocation(c.phrase, row.word) && collocations.length < 6 && !collocations.some((x) => x.phrase === c.phrase)) {
        collocations.push(c);
      }
    }
    if (row.example && isRelevantCollocation(row.example, row.word) && collocations.length < 6 && !collocations.some((x) => x.phrase === row.example)) {
      collocations.push({
        phrase: row.example,
        ...(row.example_translation ? { meaning: row.example_translation } : {}),
      });
    }
    if (row.grammar_note && entryGrammarNotes.length < 2) {
      entryGrammarNotes.push({
        title: `${row.word}${row.part_of_speech ? ` (${row.part_of_speech})` : ''}`,
        explanation: row.grammar_note,
        ...(row.example ? { example: row.example } : {}),
      });
    }
  }

  // Related words from D1 (compound words for Chinese, prefix/shared-meaning words for EN/BN)
  const headword = entries[0]?.word || text.trim().split(/[\s,;।]+/)[0] || '';
  if (headword) {
    const relRows =
      dbLang === 'zh' && hasHanzi(headword)
        ? (
            await env.DB.prepare(
              `SELECT word, phonetic, meaning_en FROM dictionary_entries
               WHERE status = 'published' AND language = 'zh' AND word != ? AND word LIKE ?
               ORDER BY length(word) ASC LIMIT 8`
            )
              .bind(headword, `%${Array.from(headword)[0]}%`)
              .all()
          ).results
        : (
            await env.DB.prepare(
              `SELECT word, phonetic, meaning_en, meaning_bn FROM dictionary_entries
               WHERE status = 'published' AND language = ? AND lower(word) != ? AND (lower(word) LIKE ? OR (part_of_speech = ? AND hsk_level = ?))
               LIMIT 8`
            )
              .bind(
                dbLang,
                headword.toLowerCase(),
                `${headword.slice(0, Math.max(3, headword.length - 1)).toLowerCase()}%`,
                entries[0]?.part_of_speech || '__none__',
                entries[0]?.hsk_level || '__none__'
              )
              .all()
          ).results;

    for (const r of relRows) {
      if (relatedWords.length < 8 && !relatedWords.some((x) => x.word === r.word) && !synonyms.some((x) => x.word === r.word)) {
        relatedWords.push({
          word: r.word,
          ...(dbLang === 'zh' && r.phonetic ? { pinyin: r.phonetic } : {}),
          ...(r.meaning_en ? { note: r.meaning_en.slice(0, 60) } : {}),
        });
      }
    }
  }

  // 2. Match curated D1 grammar_rules (specificity-ranked) + deterministic checks + optional LanguageTool (EN)
  const baseGrammar = buildFallbackGrammar(text, language);
  if (language === 'en' && text.trim().includes(' ')) {
    const lt = await checkEnglishWithLanguageTool(env, text);
    if (lt && lt.points.length > 0) {
      baseGrammar.isCorrect = false;
      if (lt.correctedText && lt.correctedText !== text.trim()) {
        baseGrammar.correctedText = lt.correctedText;
      }
      baseGrammar.summary = 'Suggested grammar corrections for more natural English.';
      baseGrammar.points = [...lt.points, ...baseGrammar.points].slice(0, 4);
    }
  }
  let dbGrammarPoints = [];
  try {
    const ruleRows = (
      await env.DB.prepare(
        `SELECT pattern, title, explanation, example, level_tag FROM grammar_rules
         WHERE language = ? ORDER BY sort ASC LIMIT 500`
      )
        .bind(dbLang)
        .all()
    ).results;
    const matched = ruleRows
      .map((r) => ({ r, score: scoreGrammarPattern(text, r.pattern) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);
    const defaults = ruleRows.filter((r) => !r.pattern);
    const chosen = (matched.length > 0 ? matched : defaults).slice(0, 3);
    dbGrammarPoints = chosen.map((r) => ({
      title: r.level_tag ? `${r.title} (${r.level_tag})` : r.title,
      explanation: r.explanation,
      ...(r.example ? { example: r.example } : {}),
    }));
  } catch {
    // Table empty or not yet seeded
  }

  const combinedPoints = [...entryGrammarNotes, ...dbGrammarPoints];
  if (combinedPoints.length === 0) {
    combinedPoints.push(...baseGrammar.points);
  } else if (!baseGrammar.isCorrect) {
    combinedPoints.unshift(...baseGrammar.points.slice(0, 1));
  }

  const pinyin = language === 'zh-Hans'
    ? (entries[0]?.word === text.trim() && entries[0]?.phonetic ? entries[0].phonetic : await lookupPinyinFromDb(env, text))
    : '';
  const segments = language === 'zh-Hans' && hasHanzi(text)
    ? await lookupChineseSegments(env, text)
    : [];

  return {
    text,
    language,
    ...(pinyin ? { pinyin } : {}),
    ...(segments.length >= 2 ? { segments } : {}),
    grammar: {
      isCorrect: baseGrammar.isCorrect,
      correctedText: baseGrammar.correctedText,
      summary: entries[0]?.grammar_note || baseGrammar.summary,
      points: combinedPoints.slice(0, 4),
      tips: baseGrammar.tips,
    },
    vocabulary: {
      ...(partOfSpeech ? { partOfSpeech } : {}),
      synonyms,
      antonyms,
      collocations,
      relatedWords,
    },
    provider: 'sanzar-db',
  };
}

export async function adminBulkImportGrammarRules(env, ctx, input) {
  requireRole(ctx.user, 'teacher');
  const rules = Array.isArray(input.rules) ? input.rules : [];
  if (rules.length === 0 || rules.length > 300) {
    throw new HttpError(400, 'invalid-argument', 'Provide 1 to 300 grammar rules');
  }
  const t = now();
  let imported = 0;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i] || {};
    const dbLang = toDbLang(r.language);
    if (!dbLang || !r.title || !r.explanation) continue;
    const id = String(r.id || `${dbLang}-gr-${i + 1}`).trim().slice(0, 60);
    await env.DB.prepare(
      `INSERT INTO grammar_rules (id, language, pattern, title, explanation, example, example_translation, level_tag, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         language=excluded.language, pattern=excluded.pattern, title=excluded.title, explanation=excluded.explanation,
         example=excluded.example, example_translation=excluded.example_translation, level_tag=excluded.level_tag,
         sort=excluded.sort, updated_at=excluded.updated_at`
    )
      .bind(
        id,
        dbLang,
        String(r.pattern || '').trim().slice(0, 200),
        String(r.title).trim().slice(0, 160),
        String(r.explanation).trim().slice(0, 800),
        String(r.example || '').trim().slice(0, 400),
        String(r.example_translation || '').trim().slice(0, 400),
        String(r.level_tag || '').trim().slice(0, 30),
        Number(r.sort) || i,
        t,
        t
      )
      .run();
    imported++;
  }
  await audit(env, ctx, 'grammar_rules.import', `imported=${imported}`);
  return { imported };
}

/* ============================== router ============================== */
export async function reportTranslation(env, ctx, input) {
  const sourceLang = normalizeApiLang(input.sourceLanguage || input.source_language);
  const targetLang = normalizeApiLang(input.targetLanguage || input.target_language);
  const sourceText = str(input.sourceText || input.source_text || input.text, { min: 1, max: 500, field: 'Source text' });
  const note = String(input.note || '').trim().slice(0, 300);
  if (!sourceLang || !targetLang) {
    throw new HttpError(400, 'unsupported-language', 'Source and target languages must be en, bn, id, or zh-Hans');
  }
  const cacheKey = buildTranslationCacheKey(sourceLang, targetLang, sourceText);
  const t = now();
  const existing = await env.DB.prepare('SELECT cache_key FROM translation_cache WHERE cache_key = ? LIMIT 1')
    .bind(cacheKey)
    .first();
  if (existing) {
    await env.DB.prepare(
      `UPDATE translation_cache SET reported = reported + 1, report_note = CASE WHEN ? != '' THEN ? ELSE report_note END, updated_at = ? WHERE cache_key = ?`
    )
      .bind(note, note, t, cacheKey)
      .run();
  } else {
    const translatedText = String(input.translatedText || input.translated_text || '').trim().slice(0, 500);
    await env.DB.prepare(
      `INSERT INTO translation_cache (cache_key, source_language, target_language, source_text, translated_text, source_pinyin, target_pinyin, provider, hits, reported, report_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', '', 'reported', 1, 1, ?, ?, ?)`
    )
      .bind(cacheKey, sourceLang, targetLang, sourceText, translatedText, note, t, t)
      .run();
  }
  return { ok: true, cacheKey };
}

export async function adminListTranslationCache(env, ctx, url) {
  requireRole(ctx.user, 'teacher');
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const reportedOnly = url.searchParams.get('reported') === '1';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));
  const where = [];
  const binds = [];
  if (reportedOnly) where.push('reported > 0');
  if (q) {
    where.push('(lower(source_text) LIKE ? OR lower(translated_text) LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  const sql = `SELECT cache_key, source_language, target_language, source_text, translated_text, source_pinyin, target_pinyin, provider, hits, reported, report_note, updated_at
               FROM translation_cache
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY reported DESC, hits DESC, updated_at DESC
               LIMIT ?`;
  binds.push(limit);
  const rows = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
  return {
    items: rows.map((r) => ({
      cacheKey: r.cache_key,
      sourceLanguage: r.source_language,
      targetLanguage: r.target_language,
      sourceText: r.source_text,
      translatedText: r.translated_text,
      sourcePinyin: r.source_pinyin || '',
      targetPinyin: r.target_pinyin || '',
      provider: r.provider || '',
      hits: Number(r.hits || 0),
      reported: Number(r.reported || 0),
      reportNote: r.report_note || '',
      updatedAt: r.updated_at,
    })),
  };
}

export async function adminUpdateTranslationCache(env, ctx, input) {
  requireRole(ctx.user, 'teacher');
  const cacheKey = str(input.cacheKey || input.cache_key, { min: 3, max: 500, field: 'cacheKey' });
  const translatedText = str(input.translatedText || input.translated_text, { min: 1, max: 2000, field: 'translatedText' });
  const sourcePinyin = String(input.sourcePinyin ?? input.source_pinyin ?? '').trim().slice(0, 500);
  const targetPinyin = String(input.targetPinyin ?? input.target_pinyin ?? '').trim().slice(0, 500);
  const t = now();
  await env.DB.prepare(
    `UPDATE translation_cache
     SET translated_text = ?, source_pinyin = ?, target_pinyin = ?, provider = 'admin-override', reported = 0, report_note = '', updated_at = ?
     WHERE cache_key = ?`
  )
    .bind(translatedText, sourcePinyin, targetPinyin, t, cacheKey)
    .run();
  await audit(env, ctx.user.uid, 'translation_cache.update', cacheKey, { translatedText });
  return { ok: true, cacheKey };
}

export async function adminDeleteTranslationCache(env, ctx, url) {
  requireRole(ctx.user, 'teacher');
  const cacheKey = str(url.searchParams.get('cacheKey') || '', { min: 3, max: 500, field: 'cacheKey' });
  await env.DB.prepare('DELETE FROM translation_cache WHERE cache_key = ?').bind(cacheKey).run();
  await audit(env, ctx.user.uid, 'translation_cache.delete', cacheKey, {});
  return { ok: true, cacheKey };
}

export async function routeDictionaryAuth(req, env, ctx, url) {
  const p = url.pathname;
  const m = req.method;
  let mm;

  if (p === '/v1/translation' && m === 'POST') {
    return json(await handleTranslate(env, await body(req, 16_000)));
  }
  if (p === '/v1/translation/report' && m === 'POST') {
    return json(await reportTranslation(env, ctx, await body(req, 8_000)));
  }
  if (p === '/v1/translation/detect' && m === 'POST') {
    return json(handleDetectLanguage(await body(req, 16_000)));
  }
  if (p === '/v1/dictionary/insights' && m === 'POST') {
    return json(await handleLanguageInsights(env, await body(req, 16_000)));
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
  if (p === '/v1/admin/translation-quota' && m === 'GET') {
    return json(await adminTranslationQuota(env, ctx));
  }
  if (p === '/v1/admin/translation-cache' && m === 'GET') {
    return json(await adminListTranslationCache(env, ctx, url));
  }
  if (p === '/v1/admin/translation-cache' && m === 'PATCH') {
    return json(await adminUpdateTranslationCache(env, ctx, await body(req, 16_000)));
  }
  if (p === '/v1/admin/translation-cache' && m === 'DELETE') {
    return json(await adminDeleteTranslationCache(env, ctx, url));
  }
  if (p === '/v1/admin/grammar-rules/import' && m === 'POST') {
    return json(await adminBulkImportGrammarRules(env, ctx, await body(req, 500_000)));
  }
  return null;
}
