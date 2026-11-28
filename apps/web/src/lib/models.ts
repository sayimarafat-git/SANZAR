export const ROLE_RANK = {
  student: 0,
  moderator: 1,
  teacher: 2,
  content_admin: 3,
  admin: 4,
  super_admin: 5,
} as const;

export type Role = keyof typeof ROLE_RANK;
export const ROLES = Object.keys(ROLE_RANK) as Role[];

export const atLeast = (role: string | undefined | null, min: Role): boolean =>
  role !== undefined && role !== null && role in ROLE_RANK && ROLE_RANK[role as Role] >= ROLE_RANK[min];

export const LEVELS = [
  { id: 'zh', name: 'Chinese', name_bn: 'চীনা ভাষা', name_zh: '中文' },
  { id: 'en', name: 'English', name_bn: 'ইংরেজি', name_zh: '英语' },
];

export interface UserProfile {
  uid: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  email_verified: boolean;
  photo_url?: string | null;
  level_id?: string | null;
  grp?: string | null;
  institution?: string | null;
  locale?: string | null;
  profile_visibility?: 'public' | 'followers' | 'private';
  onboarding_completed?: boolean;
  blocked?: number | boolean;
}

export interface Level {
  id: string;
  name_en: string;
  name_bn: string;
  name_zh: string;
}

export interface Subject {
  id: string;
  name_en: string;
  name_bn: string;
  name_zh: string;
  icon: string;
  color: string;
  sort?: number;
}

export interface Resource {
  id: string;
  type: 'pdf' | 'video' | 'audio' | 'ppt' | 'link' | string;
  title: string;
  url: string | null;
  pages?: number;
  version?: number;
}

export interface Chapter {
  id: string;
  parentChapterId?: string | null;
  number: number;
  title: string;
  hasNotes: boolean;
  qaCount?: number;
  questionCount: number;
  resources: Resource[];
}

export interface Book {
  id: string;
  title: string;
  subjectId: string;
  edition: string;
  author: string;
  cover: string[];
  coverImage?: string | null;
  coverRatio?: number | null;
  previewDoc?: { url: string; type: string } | null;
  levels: string[];
  featuredRank: number | null;
  chapters: Chapter[];
}

export type DictLangCode = 'en' | 'bn' | 'zh-Hans';

export interface DictionaryEntry {
  id: string;
  language: 'zh' | 'en' | 'bn';
  language_code?: DictLangCode;
  word: string;
  phonetic: string;
  part_of_speech: string;
  meaning_en: string;
  meaning_bn: string;
  meaning_zh: string;
  example: string;
  example_translation: string;
  hsk_level: string;
  synonyms?: VocabItem[];
  antonyms?: VocabItem[];
  collocations?: CollocationItem[];
  grammar_note?: string;
  status?: string;
  updated_at?: number;
}

export interface SavedVocabularyItem {
  id: string;
  user_id?: string;
  dictionary_entry_id?: string | null;
  source_language: DictLangCode;
  target_language: DictLangCode;
  word: string;
  phonetic?: string;
  meaning: string;
  example?: string;
  hsk_level?: string;
  part_of_speech?: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: 'synced' | 'pending';
}

export interface TranslationHistoryItem {
  id: string;
  user_id?: string;
  source_language: DictLangCode;
  target_language: DictLangCode;
  source_text: string;
  translated_text: string;
  provider?: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: 'synced' | 'pending';
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: DictLangCode;
  targetLanguage: DictLangCode;
  detectedSourceLanguage: DictLangCode;
  confidence: number;
  provider: string;
  sourcePinyin?: string;
  targetPinyin?: string;
  matchedEntries?: DictionaryEntry[];
  fromCache?: boolean;
}

export interface GrammarPoint {
  title: string;
  explanation: string;
  example?: string;
}

export interface VocabItem {
  word: string;
  note?: string;
  pinyin?: string;
}

export interface CollocationItem {
  phrase: string;
  meaning?: string;
  pinyin?: string;
}

export interface ChineseSegment {
  word: string;
  pinyin: string;
  meaningEn: string;
  meaningBn: string;
  hskLevel: string;
}

export interface LanguageInsights {
  text: string;
  language: DictLangCode;
  pinyin?: string;
  segments?: ChineseSegment[];
  grammar: {
    isCorrect: boolean;
    correctedText: string;
    summary: string;
    points: GrammarPoint[];
    tips: string[];
  };
  vocabulary: {
    partOfSpeech?: string;
    synonyms: VocabItem[];
    antonyms: VocabItem[];
    collocations: CollocationItem[];
    relatedWords: VocabItem[];
  };
  provider: string;
}

export interface NoteSection {
  heading: string;
  text: string;
  page: number | null;
  terms?: string[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: number;
}

export interface ExamInfo {
  id: string;
  title: string;
  type: 'chapter_quiz' | 'model' | string;
  book_id: string | null;
  chapter_id: string | null;
  level_id?: string | null;
  time_zone?: string | null;
  duration_sec: number;
  question_count: number;
  pass_pct: number;
  opens_at?: number | null;
  closes_at?: number | null;
}

export interface ChapterQaItem {
  id: string;
  question: string;
  answer: string;
  sort?: number;
}

export interface Catalog {
  levels: Level[];
  subjects: Subject[];
  books: Book[];
  notes: Record<string, NoteSection[]>;
  qa?: Record<string, ChapterQaItem[]>;
  announcements: Announcement[];
  config: Record<string, unknown>;
  exams: ExamInfo[];
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  unlockedAt: number | null;
}

export interface AttemptSummary {
  id: string;
  examId: string;
  title: string;
  type: string;
  status: string;
  score: number | null;
  total: number | null;
  startedAt: number;
}

export interface ProgressData {
  xp: number;
  level: number;
  levelXp: number;
  intoLevel: number;
  weekXp: number;
  todaySec: number;
  goalSec: number;
  totalSec: number;
  streak: number;
  series: { day: string; sec: number }[];
  bySubject: { subjectId: string; sec: number }[];
  completions: { itemId: string; chapterId?: string }[];
  achievements: Achievement[];
  attempts: AttemptSummary[];
}

export interface TutorReference {
  bookId: string;
  bookTitle: string;
  subjectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  section: number;
  page: number | null;
}

export interface TutorAnswer {
  found: boolean;
  heading?: string | null;
  text: string;
  reference?: TutorReference | null;
}

export interface ExamQuestion {
  id: string;
  text: string;
  options: string[];
  answer?: number | null;
  chosen?: number | null;
  explanation?: string;
}

export interface ExamSession {
  attempt: {
    id: string;
    examId: string;
    title: string;
    endsAt: number;
    serverTime: number;
  };
  questions: ExamQuestion[];
}

export interface AttemptResult {
  attempt: AttemptSummary & { passed?: boolean; passPct?: number };
  review: ExamQuestion[];
  xpAwarded: number;
  unlocked?: string[];
}

export interface LeaderEntry {
  rank: number;
  uid: string | null;
  name: string;
  xp: number;
  me: boolean;
}

export interface PollOption {
  text: string;
  votes: number;
}

export interface Poll {
  question: string;
  options: PollOption[];
  myVote: number | null;
}

export interface PostAttachment {
  key?: string;
  url?: string;
  name: string;
  mime: string;
}

export interface Post {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  category: string;
  likeCount: number;
  commentCount: number;
  createdAt: number;
  likedByMe: boolean;
  mine: boolean;
  poll: Poll | null;
  attachments?: PostAttachment[];
}

export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt: number;
  mine: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export interface PublicProfile {
  user: {
    uid: string;
    name: string;
    visibility: string;
    levelId: string | null;
    institution: string | null;
    xp: number | null;
  };
  followers: number;
  following: number;
  isFollowing: boolean;
  limited: boolean;
}

// Admin helpers from apps/admin/src/lib/model.ts
export const isId = (v: string) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v);

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
}

export const isHttps = (v: string) => /^https:\/\/[^\s]{4,1000}$/.test(v);

export const parseTerms = (v: string) =>
  v
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);

export function validateSections(sections: NoteSection[]): string[] {
  const errs: string[] = [];
  if (!sections.length) errs.push('Add at least one section.');
  if (sections.length > 60) errs.push('At most 60 sections.');
  sections.forEach((s, i) => {
    if (!s.heading.trim()) errs.push(`Section ${i + 1}: heading is empty.`);
    if (!s.text.trim()) errs.push(`Section ${i + 1}: text is empty.`);
    if (s.page !== null && (!Number.isInteger(s.page) || s.page < 1 || s.page > 5000)) {
      errs.push(`Section ${i + 1}: page must be 1–5000.`);
    }
  });
  return errs;
}

export function validateQuestion(q: { text: string; options: string[]; answer: number | null }): string[] {
  const errs: string[] = [];
  if (q.text.trim().length < 3) errs.push('Write the question.');
  const opts = q.options.map((o) => o.trim());
  if (opts.length < 2 || opts.length > 6) errs.push('Use 2–6 options.');
  if (opts.some((o) => !o)) errs.push('Options cannot be empty.');
  if (new Set(opts).size !== opts.length) errs.push('Options must be different.');
  if (q.answer === null || q.answer < 0 || q.answer >= opts.length) errs.push('Choose the correct option.');
  return errs;
}

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
