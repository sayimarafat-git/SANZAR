import type { ExamQuestion } from './models';

export const STUDY_FLASHCARDS_STORAGE_KEY = 'sanzar.studyFlashcards.v1';
export const FLASHCARDS_UPDATED_EVENT = 'sanzar:flashcards-updated';
const MAX_STUDY_FLASHCARDS = 50;

export type StudyFlashcardSource = 'lesson' | 'qa' | 'quiz';

export interface StudyFlashcard {
  id: string;
  source: StudyFlashcardSource;
  front: string;
  back: string;
  hint?: string;
  lang?: string;
  missed?: boolean;
  updatedAt: number;
}

type StoredByUser = Record<string, StudyFlashcard[]>;

function resolveUserKey(uid?: string | null): string {
  return uid && uid.trim() ? uid.trim() : 'guest';
}

function isValidStudyFlashcard(val: unknown): val is StudyFlashcard {
  if (!val || typeof val !== 'object') return false;
  const c = val as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    c.id.trim().length > 0 &&
    (c.source === 'lesson' || c.source === 'qa' || c.source === 'quiz') &&
    typeof c.front === 'string' &&
    c.front.trim().length > 0 &&
    typeof c.back === 'string' &&
    c.back.trim().length > 0 &&
    typeof c.updatedAt === 'number' &&
    Number.isFinite(c.updatedAt)
  );
}

function readAllStored(): StoredByUser {
  try {
    const raw = localStorage.getItem(STUDY_FLASHCARDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StoredByUser;
  } catch {
    return {};
  }
}

function writeAllStored(data: StoredByUser): void {
  try {
    localStorage.setItem(STUDY_FLASHCARDS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function detectCardLang(text: string): string {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh-Hans' : 'en';
}

export function getStudyFlashcards(uid: string): StudyFlashcard[] {
  const all = readAllStored();
  const bucket = all[resolveUserKey(uid)];
  if (!Array.isArray(bucket)) return [];
  return bucket
    .filter(isValidStudyFlashcard)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STUDY_FLASHCARDS);
}

export function upsertStudyFlashcards(uid: string, cards: StudyFlashcard[]): StudyFlashcard[] {
  const validIncoming = cards
    .filter((c) => c && c.id?.trim() && c.front?.trim() && c.back?.trim())
    .map((c) => ({
      ...c,
      id: c.id.trim(),
      front: c.front.trim(),
      back: c.back.trim(),
      hint: c.hint?.trim() || undefined,
      lang: c.lang?.trim() || undefined,
      missed: Boolean(c.missed),
      updatedAt: Number.isFinite(c.updatedAt) ? c.updatedAt : Date.now(),
    }));

  if (validIncoming.length === 0) {
    return getStudyFlashcards(uid);
  }

  const userKey = resolveUserKey(uid);
  const all = readAllStored();
  const existing = Array.isArray(all[userKey]) ? all[userKey].filter(isValidStudyFlashcard) : [];

  const byId = new Map<string, StudyFlashcard>();
  for (const card of existing) {
    byId.set(card.id, card);
  }
  for (const card of validIncoming) {
    byId.set(card.id, card);
  }

  const next = Array.from(byId.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STUDY_FLASHCARDS);

  all[userKey] = next;
  writeAllStored(all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FLASHCARDS_UPDATED_EVENT, { detail: { uid: userKey } }));
  }

  return next;
}

export function buildQuizFlashcardsFromReview(
  examId: string | undefined | null,
  title: string | undefined | null,
  review: ExamQuestion[] | undefined | null,
  now = Date.now()
): StudyFlashcard[] {
  if (!review || review.length === 0) return [];
  const cards: StudyFlashcard[] = [];
  for (const item of review) {
    const front = item.text?.trim();
    if (!front) continue;
    const correctOpt =
      item.answer != null && Array.isArray(item.options) ? item.options[item.answer]?.trim() : undefined;
    const explanation = item.explanation?.trim();
    const back = correctOpt
      ? explanation
        ? `${correctOpt}\n\n${explanation}`
        : correctOpt
      : explanation;
    if (!back) continue;
    const missed = item.answer != null ? item.chosen !== item.answer : false;
    cards.push({
      id: examId ? `quiz:${examId}:${item.id}` : `quiz:${item.id}`,
      source: 'quiz',
      front,
      back,
      hint: title?.trim() || undefined,
      lang: detectCardLang(`${front} ${back}`),
      missed,
      updatedAt: now,
    });
  }
  return cards;
}
