export const ACTIVITY_COMPLETION_STORAGE_KEY = 'sanzar.completedActivities.v1';

export type ActivityStatus = 'passed' | 'failed';
export type ActivityKey = `quiz:${string}` | `qa:${string}`;

export interface ActivityCompletion {
  status: ActivityStatus;
  score?: number;
  total?: number;
  completedAt: number;
}

type StoredByUser = Record<string, Record<string, ActivityCompletion>>;

function resolveUserKey(userId?: string | null): string {
  return userId && userId.trim() ? userId.trim() : 'guest';
}

function isValidRecord(val: unknown): val is ActivityCompletion {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    (r.status === 'passed' || r.status === 'failed') &&
    typeof r.completedAt === 'number' &&
    Number.isFinite(r.completedAt)
  );
}

function readAllStored(): StoredByUser {
  try {
    const raw = localStorage.getItem(ACTIVITY_COMPLETION_STORAGE_KEY);
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
    localStorage.setItem(ACTIVITY_COMPLETION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function getCompletedActivities(userId?: string | null): Record<string, ActivityCompletion> {
  const all = readAllStored();
  const bucket = all[resolveUserKey(userId)];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return {};
  const clean: Record<string, ActivityCompletion> = {};
  for (const [k, v] of Object.entries(bucket)) {
    if (isValidRecord(v)) clean[k] = v;
  }
  return clean;
}

export function getActivityCompletion(
  userId: string | null | undefined,
  key: ActivityKey
): ActivityCompletion | null {
  const map = getCompletedActivities(userId);
  return map[key] ?? null;
}

export function saveActivityCompletion(
  userId: string | null | undefined,
  key: ActivityKey,
  entry: Omit<ActivityCompletion, 'completedAt'> & { completedAt?: number }
): Record<string, ActivityCompletion> {
  const userKey = resolveUserKey(userId);
  const all = readAllStored();
  const current = getCompletedActivities(userKey);
  const record: ActivityCompletion = {
    status: entry.status,
    ...(typeof entry.score === 'number' && Number.isFinite(entry.score) ? { score: entry.score } : {}),
    ...(typeof entry.total === 'number' && Number.isFinite(entry.total) ? { total: entry.total } : {}),
    completedAt: entry.completedAt ?? Date.now(),
  };
  const nextUserMap = { ...current, [key]: record };
  all[userKey] = nextUserMap;
  writeAllStored(all);
  return nextUserMap;
}

export function recordQuizCompletion(
  userId: string | null | undefined,
  quizId: string,
  opts: { score: number; total: number; passPct?: number; completedAt?: number }
): Record<string, ActivityCompletion> {
  const pct = opts.total > 0 ? Math.round((opts.score / opts.total) * 100) : 0;
  const passed = pct >= (opts.passPct ?? 60);
  return saveActivityCompletion(userId, `quiz:${quizId}`, {
    status: passed ? 'passed' : 'failed',
    score: opts.score,
    total: opts.total,
    completedAt: opts.completedAt,
  });
}

export function recordQaCompletion(
  userId: string | null | undefined,
  qaId: string,
  opts: { passed: boolean; score?: number; total?: number; completedAt?: number }
): Record<string, ActivityCompletion> {
  return saveActivityCompletion(userId, `qa:${qaId}`, {
    status: opts.passed ? 'passed' : 'failed',
    score: opts.score,
    total: opts.total,
    completedAt: opts.completedAt,
  });
}

export function formatCompletedTimestamp(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
