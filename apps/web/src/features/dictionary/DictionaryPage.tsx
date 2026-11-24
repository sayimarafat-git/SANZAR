import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  BookA,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Filter,
  Globe,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Turtle,
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
import { Modal, useToast } from '../../components/SanzarUI';
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

const QUICK_SAMPLES: { text: string; hint: string; target: DictLangCode }[] = [
  { text: '你好', hint: '中文', target: 'bn' },
  { text: 'ধন্যবাদ', hint: 'বাংলা', target: 'en' },
  { text: 'Knowledge', hint: 'EN', target: 'zh-Hans' },
  { text: '学习', hint: 'HSK 1', target: 'en' },
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

function langBadgeClass(code: string): string {
  if (code === 'zh' || code === 'zh-Hans') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
  }
  if (code === 'bn') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25';
  }
  return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25';
}

const PINYIN_SYLLABLES = new Set([
  'a','ai','an','ang','ao','ba','bai','ban','bang','bao','bei','ben','beng','bi','bian','biao','bie','bin','bing','bo','bu',
  'ca','cai','can','cang','cao','ce','cen','ceng','cha','chai','chan','chang','chao','che','chen','cheng','chi','chong','chou','chu','chua','chuai','chuan','chuang','chui','chun','chuo','ci','cong','cou','cu','cuan','cui','cun','cuo',
  'da','dai','dan','dang','dao','de','dei','den','deng','di','dia','dian','diao','die','ding','diu','dong','dou','du','duan','dui','dun','duo',
  'e','ei','en','eng','er','fa','fan','fang','fei','fen','feng','fo','fou','fu',
  'ga','gai','gan','gang','gao','ge','gei','gen','geng','gong','gou','gu','gua','guai','guan','guang','gui','gun','guo',
  'ha','hai','han','hang','hao','he','hei','hen','heng','hong','hou','hu','hua','huai','huan','huang','hui','hun','huo',
  'ji','jia','jian','jiang','jiao','jie','jin','jing','jiong','jiu','ju','juan','jue','jun',
  'ka','kai','kan','kang','kao','ke','kei','ken','keng','kong','kou','ku','kua','kuai','kuan','kuang','kui','kun','kuo',
  'la','lai','lan','lang','lao','le','lei','leng','li','lia','lian','liang','liao','lie','lin','ling','liu','lo','long','lou','lu','luan','lue','lun','luo','lv','lve',
  'ma','mai','man','mang','mao','me','mei','men','meng','mi','mian','miao','mie','min','ming','miu','mo','mou','mu',
  'na','nai','nan','nang','nao','ne','nei','nen','neng','ni','nian','niang','niao','nie','nin','ning','niu','nong','nou','nu','nuan','nue','nuo','nv','nve',
  'o','ou','pa','pai','pan','pang','pao','pei','pen','peng','pi','pian','piao','pie','pin','ping','po','pou','pu',
  'qi','qia','qian','qiang','qiao','qie','qin','qing','qiong','qiu','qu','quan','que','qun',
  'ran','rang','rao','re','ren','reng','ri','rong','rou','ru','rua','ruan','rui','run','ruo',
  'sa','sai','san','sang','sao','se','sen','seng','sha','shai','shan','shang','shao','she','shei','shen','sheng','shi','shou','shu','shua','shuai','shuan','shuang','shui','shun','shuo','si','song','sou','su','suan','sui','sun','suo',
  'ta','tai','tan','tang','tao','te','tei','teng','ti','tian','tiao','tie','ting','tong','tou','tu','tuan','tui','tun','tuo',
  'wa','wai','wan','wang','wei','wen','weng','wo','wu',
  'xi','xia','xian','xiang','xiao','xie','xin','xing','xiong','xiu','xu','xuan','xue','xun',
  'ya','yan','yang','yao','ye','yi','yin','ying','yo','yong','you','yu','yuan','yue','yun',
  'za','zai','zan','zang','zao','ze','zei','zen','zeng','zha','zhai','zhan','zhang','zhao','zhe','zhei','zhen','zheng','zhi','zhong','zhou','zhu','zhua','zhuai','zhuan','zhuang','zhui','zhun','zhuo','zi','zong','zou','zu','zuan','zui','zun','zuo',
]);

const COMMON_ENGLISH_WORDS = new Set([
  'a','an','am','as','at','be','by','do','go','he','hi','in','is','it','me','my','no','of','on','or','so','to','up','us','we',
  'ban','can','dan','fan','man','pan','ran','tan','van','bin','din','fin','pin','sin','tin','win','bun','fun','gun','nun','run','sun',
  'die','lie','pie','tie','due','hue','sue','are','bad','bag','bar','bat','bed','big','bit','box','boy','bus','but','buy','car','cat',
  'cup','cut','day','did','dog','ear','eat','end','eye','far','fat','few','fit','fly','for','get','god','got','had','has','hat','her',
  'him','his','hot','how','ice','its','job','joy','key','kid','law','lay','leg','let','lot','low','mad','map','may','men','met','mix',
  'mom','mud','new','not','now','nut','odd','off','oil','old','one','our','out','own','pay','pen','pet','pig','pot','put','raw','red',
  'rid','row','rub','sad','sat','saw','say','sea','see','set','she','shy','sit','six','sky','son','tea','ten','the','too','top','toy',
  'try','two','use','war','was','way','wet','who','why','yes','yet','you','zoo','hello','world','good','morning','night','thank',
  'thanks','please','sorry','water','food','book','time','love','home','work','name','make','take','come','give','find','know','look',
  'want','need','help','like','live','life','here','there','where','when','what','which','this','that','with','from','have','been',
  'china','chinese','english','bangla','study','learn','school','teacher','student','friend','family','happy','banana','mango','camera',
  'piano','radio','video','music','paper','table','chair','house','phone','money','today','tomorrow',
]);

function segmentPinyinCount(token: string): number {
  const clean = token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[1-5]/g, '');
  if (!clean || !/^[a-z]+$/.test(clean)) return 0;
  const n = clean.length;
  const dp = new Array<number>(n + 1).fill(0);
  dp[0] = 1;
  for (let i = 0; i < n; i++) {
    if (!dp[i]) continue;
    for (let len = 1; len <= 6 && i + len <= n; len++) {
      if (PINYIN_SYLLABLES.has(clean.slice(i, i + len))) {
        const next = dp[i] + 1;
        if (!dp[i + len] || next < dp[i + len]) dp[i + len] = next;
      }
    }
  }
  return dp[n] > 0 ? dp[n] - 1 : 0;
}

function isLikelyPinyinClient(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(s)) return true;
  if (!/^[a-zA-Z0-9'\s-]+$/.test(s)) return false;
  const tokens = s.toLowerCase().split(/[\s'-]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 12) return false;
  if (tokens.some((tok) => /^[a-z]+[1-4]$/.test(tok) && segmentPinyinCount(tok) > 0)) return true;
  let total = 0;
  let distinctive = false;
  for (const tok of tokens) {
    if (COMMON_ENGLISH_WORDS.has(tok)) return false;
    const c = segmentPinyinCount(tok);
    if (c === 0) return false;
    total += c;
    if (/^(zh|ch|sh|q|x)/.test(tok) || /(zh|ch|sh|ao|uo|iu|ui|iang|iong|uang|uan|ue|ng)$/.test(tok) || c >= 2) {
      distinctive = true;
    }
  }
  return total >= 2 || (total === 1 && distinctive);
}

/** Fast client-side Unicode script + Pinyin detector for instant visual feedback while typing. */
function detectClientLang(text: string): { lang: DictLangCode; isPinyin: boolean } | null {
  const s = text.trim();
  if (!s) return null;
  let bn = 0;
  let zh = 0;
  let latin = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x0980 && cp <= 0x09ff) bn++;
    else if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) zh++;
    else if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) latin++;
  }
  if (bn === 0 && zh === 0 && latin === 0) return null;
  if (bn >= zh && bn >= latin && bn > 0) return { lang: 'bn', isPinyin: false };
  if (zh >= bn && zh >= latin && zh > 0) return { lang: 'zh-Hans', isPinyin: false };
  if (isLikelyPinyinClient(s)) return { lang: 'zh-Hans', isPinyin: true };
  return { lang: 'en', isPinyin: false };
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-sanzar-primary/20 text-sanzar-primary rounded px-0.5 font-bold"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

let activeTtsAudio: HTMLAudioElement | null = null;
let speakTimer: number | null = null;

function fallbackBrowserSpeak(text: string, langCode: DictLangCode | 'zh', rate: number) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  const synth = window.speechSynthesis;
  const targetLang = langCode === 'zh-Hans' || langCode === 'zh' ? 'zh-CN' : langCode === 'bn' ? 'bn-BD' : 'en-US';
  const langPrefix = targetLang.split('-')[0].toLowerCase();
  if (speakTimer !== null) {
    window.clearTimeout(speakTimer);
    speakTimer = null;
  }
  synth.cancel();
  speakTimer = window.setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = targetLang;
    u.rate = rate;
    const voices = synth.getVoices();
    const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
    const preferred =
      (rate < 0.95 ? matching.find((v) => v.localService) : null) ||
      matching.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
      matching[0];
    if (preferred) u.voice = preferred;
    synth.speak(u);
  }, 35);
}

function speakText(text: string, langCode: DictLangCode | 'zh', rate = 1.0) {
  const clean = text.trim().slice(0, 200);
  if (typeof window === 'undefined' || !clean) return;
  const clampedRate = Math.max(0.4, Math.min(1.5, rate));
  const apiLang = langCode === 'zh' ? 'zh-Hans' : langCode;

  if (activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // Primary: server-proxied MP3 audio (supports Bangla, Chinese, English + exact 0.5x playbackRate on all browsers)
  const audioUrl = `/v1/dictionary/tts?text=${encodeURIComponent(clean)}&lang=${encodeURIComponent(apiLang)}`;
  const audio = new Audio(audioUrl);
  audio.playbackRate = clampedRate;
  activeTtsAudio = audio;
  audio.onerror = () => {
    if (activeTtsAudio === audio) activeTtsAudio = null;
    fallbackBrowserSpeak(clean, langCode, clampedRate);
  };
  void audio.play().catch(() => {
    if (activeTtsAudio === audio) activeTtsAudio = null;
    fallbackBrowserSpeak(clean, langCode, clampedRate);
  });
}

function groupHistoryByDay(items: TranslationHistoryItem[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const groups: { label: string; items: TranslationHistoryItem[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const item of items) {
    if (item.created_at >= startOfToday) groups[0].items.push(item);
    else if (item.created_at >= startOfYesterday) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

const DictionarySkeletonGrid: React.FC = () => (
  <div className="grid sm:grid-cols-2 gap-4">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="sanzar-card p-5 space-y-3 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-2 w-2/3">
            <div className="h-5 w-1/2 rounded-lg bg-sanzar-surface2" />
            <div className="flex gap-1.5">
              <div className="h-4 w-10 rounded-full bg-sanzar-surface2" />
              <div className="h-4 w-14 rounded-full bg-sanzar-surface2" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="h-8 w-8 rounded-xl bg-sanzar-surface2" />
            <div className="h-8 w-8 rounded-xl bg-sanzar-surface2" />
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <div className="h-3.5 w-full rounded bg-sanzar-surface2" />
          <div className="h-3.5 w-4/5 rounded bg-sanzar-surface2" />
        </div>
      </div>
    ))}
  </div>
);

export const DictionaryPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useSettings();
  const toast = useToast();
  const uid = user?.uid || '';
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'dictionary' | 'saved' | 'history'>('dictionary');

  // Unified search + inline translation state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [targetLang, setTargetLang] = useState<DictLangCode>('bn');
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedTranslationKey, setSavedTranslationKey] = useState<string | null>(null);

  // Dictionary filters & pagination
  const [langFilter, setLangFilter] = useState<'all' | DictLangCode>('all');
  const [hskFilter, setHskFilter] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [dictLoading, setDictLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<DictionaryEntry | null>(null);

  // Saved vocabulary, Saved search & Flashcard review mode
  const [savedItems, setSavedItems] = useState<SavedVocabularyItem[]>([]);
  const [savedSearch, setSavedSearch] = useState('');
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  // History
  const [historyItems, setHistoryItems] = useState<TranslationHistoryItem[]>([]);

  const detectedClient = useMemo(() => detectClientLang(query), [query]);
  const detectedClientLang = detectedClient?.lang ?? null;
  const detectedIsPinyin = detectedClient?.isPinyin ?? false;

  // Automatically pick a sensible non-identical target language when the user switches script
  useEffect(() => {
    if (!detectedClientLang) return;
    if (detectedClientLang === targetLang) {
      setTargetLang(detectedClientLang === 'en' ? 'bn' : 'en');
    }
  }, [detectedClientLang]);

  // Keyboard shortcut: press "/" to jump into search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setActiveTab('dictionary');
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!query.trim()) {
      setTranslation(null);
      setTranslateError(null);
    }
  }, [query]);

  // Load & sync personal data with strict Firebase UID isolation
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

  const filteredSaved = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedItems;
    return savedItems.filter((item) =>
      [item.word, item.phonetic, item.meaning, item.hsk_level].some((v) =>
        (v || '').toLowerCase().includes(q)
      )
    );
  }, [savedItems, savedSearch]);

  const groupedHistory = useMemo(() => groupHistoryByDay(historyItems), [historyItems]);

  const activeFilterCount = (langFilter !== 'all' ? 1 : 0) + (hskFilter ? 1 : 0) + (posFilter ? 1 : 0);

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    toast('Copied to clipboard');
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const handleToggleSaveEntry = async (entry: DictionaryEntry) => {
    if (!uid) {
      toast('Sign in to save vocabulary');
      return;
    }
    const existing = savedItems.find((s) => s.dictionary_entry_id === entry.id || s.id === entry.id);
    if (existing) {
      await deleteLocalVocabularyItem(uid, existing.id);
      setSavedItems((prev) => prev.filter((x) => x.id !== existing.id));
      toast('Removed from saved vocabulary');
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
    toast(`Saved "${entry.word}"`);
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleSaveTranslationResult = async (srcWord?: string, tgtMeaning?: string, srcLang?: DictLangCode, tgtLang?: DictLangCode) => {
    const word = (srcWord ?? query).trim();
    const meaning = (tgtMeaning ?? translation?.translatedText ?? '').trim();
    const sLang = srcLang ?? translation?.sourceLanguage ?? 'en';
    const tLang = tgtLang ?? translation?.targetLanguage ?? targetLang;
    if (!uid || !word || !meaning) {
      if (!uid) toast('Sign in to save vocabulary');
      return;
    }
    const key = `${sLang}:${tLang}:${word}`;
    const nowMs = Date.now();
    const newItem: SavedVocabularyItem = {
      id: `sv_tr_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
      dictionary_entry_id: null,
      source_language: sLang,
      target_language: tLang,
      word: word.slice(0, 200),
      meaning: meaning.slice(0, 1000),
      created_at: nowMs,
      updated_at: nowMs,
    };
    await saveLocalVocabularyItem(uid, newItem);
    setSavedItems((prev) => [newItem, ...prev]);
    setSavedTranslationKey(key);
    toast('Saved translation to vocabulary');
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleDeleteSaved = async (id: string) => {
    if (!uid) return;
    await deleteLocalVocabularyItem(uid, id);
    setSavedItems((prev) => prev.filter((x) => x.id !== id));
    toast('Removed from saved');
    void syncSavedVocabulary(uid).then(setSavedItems);
  };

  const handleDeleteHistory = async (id: string) => {
    if (!uid) return;
    await deleteLocalTranslationHistory(uid, id);
    setHistoryItems((prev) => prev.filter((x) => x.id !== id));
    void syncTranslationHistory(uid).then(setHistoryItems);
  };

  const handleTranslate = async (overrideText?: string, overrideTarget?: DictLangCode) => {
    const clean = (overrideText ?? query).trim();
    if (!clean) return;
    const tgt = overrideTarget || targetLang;
    if (!uid) {
      setTranslateError('Sign in to use instant translation and sync your history.');
      return;
    }

    setTranslating(true);
    setTranslateError(null);
    setSavedTranslationKey(null);

    try {
      const sourceParam = langFilter !== 'all' ? langFilter : 'auto';
      const cacheSource = sourceParam !== 'auto' ? sourceParam : detectClientLang(clean)?.lang ?? null;
      if (cacheSource) {
        const cached = await getCachedTranslation(cacheSource, tgt, clean);
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
          // Bump existing history entry to the top (deduplicated in-place, never creates a duplicate)
          const nowMs = Date.now();
          const bumped = await addLocalTranslationHistory(uid, {
            id: `th_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
            source_language: cached.sourceLanguage,
            target_language: cached.targetLanguage,
            source_text: clean,
            translated_text: cached.translatedText,
            provider: cached.provider,
            created_at: nowMs,
            updated_at: nowMs,
          });
          const dedupKey = `${bumped.source_language}::${bumped.target_language}::${bumped.source_text.trim().toLowerCase()}`;
          setHistoryItems((prev) => [
            bumped,
            ...prev.filter(
              (x) =>
                x.id !== bumped.id &&
                `${x.source_language}::${x.target_language}::${x.source_text.trim().toLowerCase()}` !== dedupKey
            ),
          ]);
          void syncTranslationHistory(uid).then(setHistoryItems);
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
      const dedupKey = `${histItem.source_language}::${histItem.target_language}::${histItem.source_text.trim().toLowerCase()}`;
      setHistoryItems((prev) => [
        histItem,
        ...prev.filter(
          (x) =>
            x.id !== histItem.id &&
            `${x.source_language}::${x.target_language}::${x.source_text.trim().toLowerCase()}` !== dedupKey
        ),
      ]);
      void syncTranslationHistory(uid).then(setHistoryItems);
    } catch (e) {
      setTranslateError(errorText(e));
    } finally {
      setTranslating(false);
    }
  };

  const handleSwapAndTranslate = () => {
    if (!translation) return;
    const nextQuery = translation.translatedText;
    const nextTarget = translation.sourceLanguage;
    setQuery(nextQuery);
    setTargetLang(nextTarget);
    void handleTranslate(nextQuery, nextTarget);
  };

  const handleQuickSample = (sample: { text: string; target: DictLangCode }) => {
    setQuery(sample.text);
    setTargetLang(sample.target);
    setActiveTab('dictionary');
    if (uid) {
      void handleTranslate(sample.text, sample.target);
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

  const otherTargetLangs = useMemo(() => {
    if (!translation) return [];
    return LANG_OPTIONS.filter(
      (l) => l.code !== translation.targetLanguage && l.code !== translation.sourceLanguage
    );
  }, [translation]);

  const currentTranslationKey = translation
    ? `${translation.sourceLanguage}:${translation.targetLanguage}:${query.trim()}`
    : null;
  const isCurrentTranslationSaved = Boolean(currentTranslationKey && savedTranslationKey === currentTranslationKey);

  const safeCardIndex = filteredSaved.length > 0 ? Math.min(cardIndex, filteredSaved.length - 1) : 0;
  const activeCard = filteredSaved[safeCardIndex];

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-8">
      {/* ==================== COMPACT EMERALD HERO HEADER ==================== */}
      <header className="bg-hero-grad text-white rounded-3xl px-5 py-4 sm:px-6 sm:py-5 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-emerald-200 backdrop-blur-md shrink-0">
              <BookA className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none text-white">
              {t('dictionary')}
            </h1>
          </div>

          {/* Clean Segmented Tab Switcher */}
          <div className="inline-flex p-1 rounded-2xl bg-black/25 border border-white/15 backdrop-blur-md self-start sm:self-auto">
            {(
              [
                { k: 'dictionary', label: 'Search', icon: Search, count: null },
                { k: 'saved', label: 'Saved', icon: BookmarkCheck, count: savedItems.length },
                { k: 'history', label: 'History', icon: Clock, count: historyItems.length },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.k;
              return (
                <button
                  key={tab.k}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.k);
                    setFlashcardMode(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    active
                      ? 'bg-white text-[#102017] shadow-sm'
                      : 'text-emerald-100/85 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== null && tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                        active ? 'bg-emerald-600/15 text-emerald-900' : 'bg-white/15 text-emerald-100'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ==================== TAB 1: UNIFIED DICTIONARY + INLINE TRANSLATION ==================== */}
      {activeTab === 'dictionary' && (
        <div className="space-y-5">
          {/* Standalone Spotlight Search Card */}
          <section className="sanzar-card p-3.5 sm:p-4 space-y-3 border-emerald-900/25 dark:border-emerald-300/25">
            {/* Row 1: Search Input (full-width on mobile; beside Translate button on sm+) */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1 flex items-center rounded-2xl bg-white/95 dark:bg-black/30 border border-emerald-900/35 dark:border-white/25 shadow-inner focus-within:border-sanzar-primary focus-within:ring-2 focus-within:ring-sanzar-primary/30 transition">
                <Search className="w-4 h-4 text-sanzar-text2 ml-3.5 shrink-0 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && query.trim()) {
                      e.preventDefault();
                      void handleTranslate();
                    }
                  }}
                  placeholder="Type a word, Pinyin (e.g. nihao), or sentence…"
                  aria-label={t('searchDictionary')}
                  className="w-full bg-transparent text-sanzar-text placeholder:text-sanzar-muted text-sm sm:text-base font-medium px-3 py-2.5 outline-none"
                />
                {query && (
                  <button
                    type="button"
                    aria-label={t('clearSearch')}
                    onClick={() => setQuery('')}
                    className="p-1.5 mr-1.5 rounded-lg text-sanzar-muted hover:text-sanzar-text hover:bg-sanzar-surface transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Desktop Translate CTA (beside search input on sm+) */}
              <button
                type="button"
                disabled={translating || !query.trim()}
                onClick={() => void handleTranslate()}
                className="hidden sm:flex px-4 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-extrabold disabled:opacity-45 transition items-center gap-1.5 shadow-sm shrink-0"
              >
                {translating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Translate
              </button>
            </div>

            {/* Row 2: Stretched Target Language Switcher (beside Translate button on mobile, full-width on sm+) */}
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-emerald-950/[0.06] dark:bg-black/25 border border-emerald-900/30 dark:border-white/25 flex-1">
                {LANG_OPTIONS.map((l) => {
                  const selected = targetLang === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setTargetLang(l.code);
                        if (query.trim()) void handleTranslate(query, l.code);
                      }}
                      title={`Translate to ${l.label}`}
                      className={`w-full py-1.5 rounded-lg text-xs text-center transition ${
                        selected
                          ? 'bg-white dark:bg-sanzar-primarySoft text-sanzar-primary border border-sanzar-primary/35 shadow-sm font-bold'
                          : 'text-sanzar-text2 hover:text-sanzar-text border border-transparent font-semibold'
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>

              {/* Mobile Translate CTA (same row, right beside language switcher) */}
              <button
                type="button"
                disabled={translating || !query.trim()}
                onClick={() => void handleTranslate()}
                className="sm:hidden px-3.5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-extrabold disabled:opacity-45 transition inline-flex items-center gap-1.5 shadow-sm shrink-0"
              >
                {translating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Translate
              </button>
            </div>

            {/* Bottom Strip: Live detection / guest sign-in */}
            {(detectedClientLang || !user) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {detectedClientLang ? (
                  <div className="flex items-center gap-2 text-sanzar-text2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sanzar-primarySoft text-sanzar-primary text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-sanzar-primary animate-pulse" />
                      Detected: {langLabel(detectedClientLang)}{detectedIsPinyin ? ' (Pinyin)' : ''}
                    </span>
                    <ArrowRight className="w-3 h-3 text-sanzar-muted" />
                    <span className="text-[11px] font-bold text-sanzar-text">{langLabel(targetLang)}</span>
                  </div>
                ) : (
                  <span />
                )}
                {!user && (
                  <Link
                    to="/login"
                    className="text-[11px] font-semibold text-sanzar-primary hover:underline underline-offset-2"
                  >
                    {t('signIn')} for instant translation &amp; sync
                  </Link>
                )}
              </div>
            )}
          </section>
          {/* Translation Error Banner */}
          {translateError && (
            <div className="sanzar-card p-3.5 border-sanzar-danger/40 bg-sanzar-danger/10 text-xs text-sanzar-danger flex items-center justify-between gap-3">
              <span className="font-medium">{translateError}</span>
              {uid ? (
                <button
                  type="button"
                  onClick={() => void handleTranslate()}
                  className="px-3 py-1 rounded-lg bg-sanzar-danger/15 hover:bg-sanzar-danger/25 font-bold shrink-0"
                >
                  Retry
                </button>
              ) : (
                <Link to="/login" className="px-3 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary font-bold shrink-0">
                  {t('signIn')}
                </Link>
              )}
            </div>
          )}

          {/* Featured Inline Translation Spotlight Card */}
          {(translation || translating) && (
            <div className="sanzar-card overflow-hidden border-sanzar-primary/35 relative">
              <div className="h-1 w-full bg-brand-grad" />
              <div className="p-5 sm:p-6">
                {translating && !translation ? (
                  <div className="flex items-center gap-3 text-sm text-sanzar-muted py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-sanzar-primary" />
                    <span>Translating to {langLabel(targetLang)}…</span>
                  </div>
                ) : translation ? (
                  <div className="space-y-4">
                    {/* Meta + Action Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${langBadgeClass(translation.sourceLanguage)}`}>
                          {langLabel(translation.sourceLanguage)}
                        </span>
                        <button
                          type="button"
                          onClick={handleSwapAndTranslate}
                          title="Reverse translate"
                          className="p-1 rounded-lg hover:bg-sanzar-surface2 text-sanzar-muted hover:text-sanzar-primary transition"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${langBadgeClass(translation.targetLanguage)}`}>
                          {langLabel(translation.targetLanguage)}
                        </span>
                        <span className="sanzar-pill gap-1 text-[11px] text-sanzar-primary">
                          <Globe className="w-3 h-3" />
                          {translation.fromCache ? 'Instant cache' : translation.provider}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => speakText(translation.translatedText, translation.targetLanguage, 1.0)}
                          title="Listen"
                          className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-primary transition"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(translation.translatedText, translation.targetLanguage, 0.5)}
                          title="Listen slowly (0.5×)"
                          className="px-2 py-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-text2 hover:text-sanzar-primary transition inline-flex items-center gap-1 text-[11px] font-bold"
                        >
                          <Turtle className="w-3.5 h-3.5" /> 0.5×
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(translation.translatedText, 'tr')}
                          title="Copy translation"
                          className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-text2 transition"
                        >
                          {copiedId === 'tr' ? (
                            <Check className="w-4 h-4 text-sanzar-primary" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {uid && (
                          <button
                            type="button"
                            onClick={() => void handleSaveTranslationResult()}
                            title="Save to vocabulary"
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                              isCurrentTranslationSaved
                                ? 'bg-sanzar-primarySoft border-sanzar-primary/40 text-sanzar-primary'
                                : 'border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-text'
                            }`}
                          >
                            {isCurrentTranslationSaved ? (
                              <>
                                <BookmarkCheck className="w-3.5 h-3.5" /> Saved
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3.5 h-3.5" /> Save
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Translated Text Display */}
                    <div className="space-y-1.5">
                      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-sanzar-text leading-snug whitespace-pre-wrap">
                        {translation.translatedText}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-sanzar-muted">
                        <span className="truncate">{query.trim()}</span>
                        <button
                          type="button"
                          onClick={() => speakText(query.trim(), translation.sourceLanguage, 1.0)}
                          title="Listen to original"
                          className="p-1 rounded-md hover:bg-sanzar-surface2 hover:text-sanzar-primary transition shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* One-tap "Also translate to..." chip */}
                    {otherTargetLangs.length > 0 && (
                      <div className="pt-3 border-t border-sanzar-border/60 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-sanzar-muted">Also translate to:</span>
                        {otherTargetLangs.map((l) => (
                          <button
                            key={l.code}
                            type="button"
                            disabled={translating}
                            onClick={() => {
                              setTargetLang(l.code);
                              void handleTranslate(query, l.code);
                            }}
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sanzar-surface2 hover:bg-sanzar-primarySoft hover:text-sanzar-primary border border-sanzar-border transition inline-flex items-center gap-1"
                          >
                            {l.label} <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Compact Filter & Results Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                    langFilter === tab.k
                      ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary shadow-sm'
                      : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-sanzar-muted">
                {entries.length} {entries.length === 1 ? 'word' : 'words'}
              </span>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                  showFilters || hskFilter || posFilter
                    ? 'bg-sanzar-primarySoft border-sanzar-primary/40 text-sanzar-primary'
                    : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2 hover:bg-sanzar-surface2'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hskFilter || posFilter ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-sanzar-primary text-sanzar-onPrimary text-[10px]">
                    {(hskFilter ? 1 : 0) + (posFilter ? 1 : 0)}
                  </span>
                ) : null}
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLangFilter('all');
                    setHskFilter('');
                    setPosFilter('');
                  }}
                  className="text-xs font-semibold text-sanzar-muted hover:text-sanzar-text inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Expandable HSK + Part-of-Speech Filter Drawer */}
          {showFilters && (
            <div className="sanzar-card p-4 flex flex-wrap items-center gap-4">
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">HSK Level</p>
                <div className="flex flex-wrap gap-1.5">
                  {HSK_OPTIONS.map((h) => (
                    <button
                      key={h || 'all'}
                      type="button"
                      onClick={() => setHskFilter(h)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                        hskFilter === h
                          ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                          : 'bg-sanzar-surface2 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                      }`}
                    >
                      {h || 'All'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Part of Speech</p>
                <div className="flex flex-wrap gap-1.5">
                  {POS_OPTIONS.map((p) => (
                    <button
                      key={p || 'all'}
                      type="button"
                      onClick={() => setPosFilter(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition capitalize ${
                        posFilter === p
                          ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                          : 'bg-sanzar-surface2 border-sanzar-border text-sanzar-text2 hover:text-sanzar-text'
                      }`}
                    >
                      {p || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Curated Dictionary Error */}
          {dictError && (
            <div className="sanzar-card p-4 text-xs text-sanzar-danger flex items-center justify-between">
              <span>{dictError}</span>
              <button type="button" onClick={() => void fetchDictionary(null)} className="underline font-semibold">
                Retry
              </button>
            </div>
          )}

          {/* Curated Dictionary Grid */}
          {dictLoading ? (
            <DictionarySkeletonGrid />
          ) : entries.length === 0 && !translation ? (
            <div className="sanzar-card p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sanzar-primarySoft text-sanzar-primary mx-auto flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-sanzar-text">{t('noWordsFound')}</p>
                <p className="text-xs text-sanzar-muted">
                  {query.trim()
                    ? 'Not in the curated dictionary yet — translate it instantly instead.'
                    : 'Try adjusting your filters or searching a word.'}
                </p>
              </div>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => void handleTranslate()}
                  className="px-4 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Translate "{query.trim()}" to {langLabel(targetLang)}
                </button>
              )}
            </div>
          ) : entries.length > 0 ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                {entries.map((entry) => {
                  const isSaved = savedEntryIdSet.has(entry.id);
                  return (
                    <article
                      key={entry.id}
                      onClick={() => setDetailEntry(entry)}
                      className="group sanzar-card p-5 flex flex-col justify-between gap-3.5 cursor-pointer hover:-translate-y-0.5 hover:border-sanzar-primary/45 transition-all"
                    >
                      <div className="space-y-3">
                        {/* Headword + Quick Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-baseline gap-2.5 flex-wrap">
                              <h2 className="text-xl font-black tracking-tight text-sanzar-text group-hover:text-sanzar-primary transition-colors">
                                {highlightMatch(entry.word, debouncedQuery)}
                              </h2>
                              {entry.phonetic && (
                                <span className="text-xs font-semibold text-sanzar-primary">
                                  {highlightMatch(entry.phonetic, debouncedQuery)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${langBadgeClass(entry.language)}`}
                              >
                                {langShort(entry.language)}
                              </span>
                              {entry.part_of_speech && (
                                <span className="sanzar-pill text-[11px]">{entry.part_of_speech}</span>
                              )}
                              {entry.hsk_level && (
                                <span className="sanzar-pill published text-[11px]">{entry.hsk_level}</span>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => speakText(entry.word, toCanonicalLang(entry.language))}
                              title={t('pronounce')}
                              aria-label={t('pronounce')}
                              className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-primarySoft hover:border-sanzar-primary/30 text-sanzar-primary transition"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(entry.word, entry.id)}
                              title="Copy word"
                              aria-label="Copy word"
                              className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-surface2 text-sanzar-muted hover:text-sanzar-text transition"
                            >
                              {copiedId === entry.id ? (
                                <Check className="w-4 h-4 text-sanzar-primary" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            {uid && (
                              <button
                                type="button"
                                onClick={() => void handleToggleSaveEntry(entry)}
                                title={isSaved ? 'Remove from saved' : 'Save word'}
                                aria-label={t('savedWords')}
                                className={`p-2 rounded-xl border transition ${
                                  isSaved
                                    ? 'border-sanzar-primary/40 text-sanzar-primary bg-sanzar-primarySoft'
                                    : 'border-sanzar-border text-sanzar-muted hover:text-sanzar-primary hover:bg-sanzar-surface2'
                                }`}
                              >
                                {isSaved ? (
                                  <BookmarkCheck className="w-4 h-4" />
                                ) : (
                                  <Bookmark className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Aligned Trilingual Meanings */}
                        <div className="space-y-1.5 text-sm">
                          {entry.meaning_en && (
                            <div className="flex items-baseline gap-2.5">
                              <span className="w-8 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                EN
                              </span>
                              <p className="text-sanzar-text font-medium leading-snug">
                                {highlightMatch(entry.meaning_en, debouncedQuery)}
                              </p>
                            </div>
                          )}
                          {entry.meaning_bn && (
                            <div className="flex items-baseline gap-2.5">
                              <span className="w-8 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                BN
                              </span>
                              <p className="text-sanzar-text2 leading-snug">
                                {highlightMatch(entry.meaning_bn, debouncedQuery)}
                              </p>
                            </div>
                          )}
                          {entry.meaning_zh && (
                            <div className="flex items-baseline gap-2.5">
                              <span className="w-8 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                中文
                              </span>
                              <p className="text-sanzar-text2 leading-snug">
                                {highlightMatch(entry.meaning_zh, debouncedQuery)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Example Callout */}
                      {entry.example && (
                        <div className="pl-3 border-l-2 border-sanzar-primary/45 text-xs space-y-0.5 bg-sanzar-surface2/50 rounded-r-xl py-2 pr-2.5">
                          <p className="font-semibold text-sanzar-text leading-relaxed">{entry.example}</p>
                          {entry.example_translation && (
                            <p className="text-sanzar-muted leading-relaxed">{entry.example_translation}</p>
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
                    className="px-6 py-2.5 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-bold inline-flex items-center gap-2 transition shadow-sm"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Load more vocabulary
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ==================== TAB 2: SAVED VOCABULARY + FLASHCARD PRACTICE ==================== */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          {!uid ? (
            <div className="sanzar-card p-10 text-center space-y-3">
              <BookmarkCheck className="w-10 h-10 text-sanzar-primary mx-auto opacity-80" />
              <p className="text-sm font-semibold text-sanzar-text">
                Sign in to save vocabulary and sync across Web and Android.
              </p>
              <Link
                to="/login"
                className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : savedItems.length === 0 ? (
            <div className="sanzar-card p-12 text-center space-y-2">
              <Bookmark className="w-10 h-10 text-sanzar-muted mx-auto opacity-60" />
              <p className="text-sm font-bold text-sanzar-text">Your vocabulary collection is empty</p>
              <p className="text-xs text-sanzar-muted">
                Bookmark curated entries or translations from Search — they work offline and sync automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Saved Toolbar: Filter + Flashcard Practice Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={savedSearch}
                    onChange={(e) => {
                      setSavedSearch(e.target.value);
                      setCardIndex(0);
                      setCardFlipped(false);
                    }}
                    placeholder="Filter saved words…"
                    className="sanzar-input pl-10 text-xs py-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFlashcardMode((v) => !v);
                    setCardIndex(0);
                    setCardFlipped(false);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition inline-flex items-center gap-2 self-start sm:self-auto ${
                    flashcardMode
                      ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                      : 'bg-sanzar-surface border-sanzar-border text-sanzar-text hover:bg-sanzar-surface2'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {flashcardMode ? 'Back to List' : `Practice Flashcards (${filteredSaved.length})`}
                </button>
              </div>

              {/* Flashcard Review Mode */}
              {flashcardMode && activeCard ? (
                <div className="max-w-xl mx-auto space-y-4">
                  <div
                    onClick={() => setCardFlipped((f) => !f)}
                    className="sanzar-card p-8 sm:p-10 min-h-[260px] flex flex-col items-center justify-center text-center cursor-pointer border-sanzar-primary/35 hover:border-sanzar-primary/60 transition select-none space-y-4"
                  >
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${langBadgeClass(activeCard.source_language)}`}>
                      {cardFlipped ? 'Meaning' : langLabel(activeCard.source_language)}
                    </span>

                    {!cardFlipped ? (
                      <div className="space-y-2">
                        <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-sanzar-text">
                          {activeCard.word}
                        </h3>
                        {activeCard.phonetic && (
                          <p className="text-sm font-semibold text-sanzar-primary">{activeCard.phonetic}</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-xl sm:text-2xl font-bold text-sanzar-text leading-snug">
                          {activeCard.meaning}
                        </p>
                        {activeCard.example && (
                          <p className="text-xs text-sanzar-muted italic pt-1">{activeCard.example}</p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => speakText(activeCard.word, activeCard.source_language)}
                        className="px-3 py-1.5 rounded-xl bg-sanzar-primarySoft text-sanzar-primary text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> Listen
                      </button>
                      <span className="text-[11px] text-sanzar-muted">Click card to flip</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={safeCardIndex === 0}
                      onClick={() => {
                        setCardIndex((i) => Math.max(0, i - 1));
                        setCardFlipped(false);
                      }}
                      className="px-4 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <span className="text-xs font-bold text-sanzar-muted">
                      {safeCardIndex + 1} / {filteredSaved.length}
                    </span>
                    <button
                      type="button"
                      disabled={safeCardIndex >= filteredSaved.length - 1}
                      onClick={() => {
                        setCardIndex((i) => Math.min(filteredSaved.length - 1, i + 1));
                        setCardFlipped(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {filteredSaved.map((item) => (
                    <article key={item.id} className="sanzar-card p-5 space-y-2.5 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h3 className="text-lg font-extrabold text-sanzar-text">{item.word}</h3>
                              {item.phonetic && (
                                <span className="text-xs text-sanzar-primary font-semibold">{item.phonetic}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${langBadgeClass(item.source_language)}`}
                              >
                                {langShort(item.source_language)}
                              </span>
                              {item.hsk_level && <span className="sanzar-pill published text-[11px]">{item.hsk_level}</span>}
                              {item.sync_status === 'pending' && <span className="sanzar-pill draft text-[10px]">Syncing…</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => speakText(item.word, item.source_language)}
                              aria-label="Listen"
                              className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-primarySoft text-sanzar-primary transition"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSaved(item.id)}
                              aria-label="Remove saved word"
                              className="p-2 rounded-xl border border-sanzar-danger/30 text-sanzar-danger hover:bg-sanzar-danger/10 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {item.meaning && <p className="text-sm text-sanzar-text2 leading-relaxed">{item.meaning}</p>}
                      </div>
                      {item.example && (
                        <p className="text-xs text-sanzar-muted italic pl-3 border-l-2 border-sanzar-primary/40">
                          {item.example}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 3: TRANSLATION HISTORY (GROUPED BY DAY) ==================== */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {!uid ? (
            <div className="sanzar-card p-10 text-center space-y-3">
              <Clock className="w-10 h-10 text-sanzar-primary mx-auto opacity-80" />
              <p className="text-sm font-semibold text-sanzar-text">
                Sign in to view and synchronize your translation history.
              </p>
              <Link
                to="/login"
                className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="sanzar-card p-12 text-center space-y-2">
              <Clock className="w-10 h-10 text-sanzar-muted mx-auto opacity-60" />
              <p className="text-sm font-bold text-sanzar-text">No translation history yet</p>
              <p className="text-xs text-sanzar-muted">
                Every word or sentence you translate appears here and syncs across your devices.
              </p>
            </div>
          ) : (
            groupedHistory.map((group) => (
              <div key={group.label} className="space-y-2.5">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-sanzar-muted px-1">
                  {group.label}
                </h2>
                <div className="space-y-2.5">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleReopenHistory(item)}
                      className="sanzar-card p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-sanzar-primary/45 transition group"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${langBadgeClass(item.source_language)}`}>
                            {langShort(item.source_language)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-sanzar-muted" />
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${langBadgeClass(item.target_language)}`}>
                            {langShort(item.target_language)}
                          </span>
                          <span className="text-[11px] text-sanzar-muted">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-sanzar-text truncate group-hover:text-sanzar-primary transition-colors">
                          {item.source_text}
                        </p>
                        <p className="text-sm text-sanzar-text2 truncate">{item.translated_text}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Save to vocabulary"
                          onClick={() =>
                            void handleSaveTranslationResult(
                              item.source_text,
                              item.translated_text,
                              item.source_language,
                              item.target_language
                            )
                          }
                          className="p-2 rounded-xl border border-sanzar-border hover:bg-sanzar-primarySoft text-sanzar-primary transition"
                        >
                          <Bookmark className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete history item"
                          onClick={() => void handleDeleteHistory(item.id)}
                          className="p-2 rounded-xl border border-sanzar-danger/30 text-sanzar-danger hover:bg-sanzar-danger/10 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================== ENHANCED VOCABULARY DETAIL MODAL ==================== */}
      {detailEntry && (
        <Modal title="Vocabulary Details" onClose={() => setDetailEntry(null)}>
          <div className="space-y-5">
            {/* Headword Hero Banner */}
            <div className="rounded-2xl bg-sanzar-surface2 p-5 border border-sanzar-border space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-3xl font-black tracking-tight text-sanzar-text">{detailEntry.word}</h3>
                  {detailEntry.phonetic && (
                    <p className="text-base font-semibold text-sanzar-primary">{detailEntry.phonetic}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${langBadgeClass(detailEntry.language)}`}>
                    {langLabel(detailEntry.language)}
                  </span>
                  {detailEntry.hsk_level && <span className="sanzar-pill published">{detailEntry.hsk_level}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => speakText(detailEntry.word, toCanonicalLang(detailEntry.language), 1.0)}
                  className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Volume2 className="w-4 h-4" /> Listen
                </button>
                <button
                  type="button"
                  onClick={() => speakText(detailEntry.word, toCanonicalLang(detailEntry.language), 0.5)}
                  className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Turtle className="w-4 h-4" /> Slow (0.5×)
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(detailEntry.word, `modal_${detailEntry.id}`)}
                  className="px-3 py-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                {uid && (
                  <button
                    type="button"
                    onClick={() => void handleToggleSaveEntry(detailEntry)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                      savedEntryIdSet.has(detailEntry.id)
                        ? 'bg-sanzar-primarySoft border-sanzar-primary/40 text-sanzar-primary'
                        : 'border-sanzar-border bg-sanzar-surface hover:bg-sanzar-surface2'
                    }`}
                  >
                    {savedEntryIdSet.has(detailEntry.id) ? (
                      <>
                        <BookmarkCheck className="w-4 h-4" /> Saved
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4" /> Save
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Trilingual Meaning Cards */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">
                Meanings {detailEntry.part_of_speech ? `· ${detailEntry.part_of_speech}` : ''}
              </p>
              <div className="grid gap-2">
                {detailEntry.meaning_en && (
                  <div className="p-3.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex items-baseline gap-3">
                    <span className="text-xs font-extrabold text-sky-600 dark:text-sky-400 w-10 shrink-0">EN</span>
                    <span className="text-sm font-medium text-sanzar-text">{detailEntry.meaning_en}</span>
                  </div>
                )}
                {detailEntry.meaning_bn && (
                  <div className="p-3.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex items-baseline gap-3">
                    <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 w-10 shrink-0">BN</span>
                    <span className="text-sm font-medium text-sanzar-text">{detailEntry.meaning_bn}</span>
                  </div>
                )}
                {detailEntry.meaning_zh && (
                  <div className="p-3.5 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border flex items-baseline gap-3">
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 w-10 shrink-0">中文</span>
                    <span className="text-sm font-medium text-sanzar-text">{detailEntry.meaning_zh}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Example Sentence with Audio */}
            {detailEntry.example && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sanzar-muted">Example in Context</p>
                <div className="p-4 rounded-xl bg-sanzar-surface2/70 border-l-4 border-sanzar-primary flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-sanzar-text leading-relaxed">{detailEntry.example}</p>
                    {detailEntry.example_translation && (
                      <p className="text-xs text-sanzar-muted leading-relaxed">{detailEntry.example_translation}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => speakText(detailEntry.example, toCanonicalLang(detailEntry.language), 0.9)}
                    title="Listen to example"
                    className="p-2 rounded-xl border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft text-sanzar-primary shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
