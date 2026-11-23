/**
 * Sanzar API — learning features.
 *
 *  Study time      POST /v1/study/events          (server-validated, capped)
 *  Completions     POST /v1/completions
 *  Progress        GET  /v1/progress
 *  AI Tutor        POST /v1/tutor/ask              (answers only from published notes, with citations)
 *  Exams           GET  /v1/exams/:id · POST /v1/exams/:id/start · POST /v1/attempts/:id/submit
 *                  GET  /v1/attempts · GET /v1/attempts/:id
 *  Leaderboard     GET  /v1/leaderboard?period=weekly|monthly|all
 *  Community       GET  /v1/feed · POST /v1/posts · DELETE /v1/posts/:id · POST /v1/posts/:id/like
 *                  POST /v1/posts/:id/vote · GET|POST /v1/posts/:id/comments · DELETE /v1/comments/:id
 *                  POST /v1/reports · POST|DELETE /v1/users/:uid/follow · POST|DELETE /v1/users/:uid/block
 *                  GET /v1/users/:uid
 *  Notifications   GET /v1/notifications · POST /v1/notifications/read
 *  Moderation      GET /v1/admin/reports · PUT /v1/admin/reports/:id
 *
 * Every score, XP amount and ranking is computed here; the app only sends
 * what the student did. XP sources are unique per (uid, source_id), so the
 * same action can never earn points twice.
 */
import { HttpError, newId, now, json, str, body, audit, getConfig, requireRole } from './worker.js';

export const XP_DEFAULTS = { resourceComplete: 10, quizCorrect: 5, dailyGoal: 20, post: 5, focusSession: 15 };
export const LEVEL_XP = 2000;
export const DAILY_GOAL_MIN = 60;
const MAX_EVENT_SEC = 900;           // one flush covers at most 15 minutes
const MAX_DAY_SEC = 16 * 3600;       // nobody studies more than 16 h a day
const BD_OFFSET = 6 * 3600_000;      // days are counted in Bangladesh time (UTC+6)
const STUDY_TYPES = new Set(['video', 'pdf', 'ppt', 'notes', 'exam', 'focus']);

export const dayKey = (t) => new Date(t + BD_OFFSET).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(`${day}T00:00:00Z`) - BD_OFFSET;
const int = (v, field, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'invalid-argument', `${field} must be a whole number from ${min} to ${max}`);
  return n;
};
const idOf = (v, field) => {
  if (typeof v !== 'string' || !/^[\w.:-]{1,128}$/.test(v)) throw new HttpError(400, 'invalid-argument', `${field} is not valid`);
  return v;
};

async function xpConfig(env) {
  const cfg = await getConfig(env);
  return { ...XP_DEFAULTS, ...(cfg.xp && typeof cfg.xp === 'object' ? cfg.xp : {}) };
}

/** Awards XP once per source. Returns the amount actually awarded (0 if already earned). */
async function award(env, uid, amount, reason, sourceId) {
  if (!(amount > 0)) return 0;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO xp_ledger (id, uid, amount, reason, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId('xp'), uid, amount, reason, sourceId, now()).run();
  return r.meta?.changes ? amount : 0;
}

async function notify(env, uid, title, text = '') {
  await env.DB.prepare('INSERT INTO notifications (id, uid, title, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(newId('nt'), uid, title.slice(0, 120), text.slice(0, 500), now()).run();
}

/* ============================== study time ============================== */
async function studyEvents(env, ctx, input) {
  const list = Array.isArray(input.events) ? input.events : null;
  if (!list || !list.length || list.length > 50) throw new HttpError(400, 'invalid-argument', 'Send 1–50 events');
  const uid = ctx.user.uid;
  const t = now();
  const chapterIds = [...new Set(list.map((e) => e.chapterId).filter((x) => typeof x === 'string'))];
  const subjOf = {};
  if (chapterIds.length) {
    const rows = await env.DB.prepare(`SELECT c.id, b.subject_id FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.id IN (${chapterIds.map(() => '?').join(',')})`).bind(...chapterIds).all();
    for (const r of rows.results) subjOf[r.id] = r.subject_id;
  }
  const usedToday = {};
  const accepted = [];
  for (const e of list) {
    const id = idOf(e.id, 'Event id');
    const type = STUDY_TYPES.has(e.type) ? e.type : null;
    if (!type) throw new HttpError(400, 'invalid-argument', 'Unknown study type');
    const sec = int(e.sec, 'Seconds', 1, MAX_EVENT_SEC);
    const startedAt = int(e.startedAt, 'Start time', 0, 9e15);
    // Must have happened within the last 7 days and cannot end in the future.
    if (startedAt < t - 7 * 86400_000 || startedAt + sec * 1000 > t + 60_000) { accepted.push({ id, acceptedSec: 0, reason: 'time' }); continue; }
    const chapterId = e.chapterId == null ? null : idOf(e.chapterId, 'Chapter');
    if (chapterId && !subjOf[chapterId]) { accepted.push({ id, acceptedSec: 0, reason: 'chapter' }); continue; }
    const day = dayKey(startedAt);
    if (usedToday[day] == null) usedToday[day] = (await env.DB.prepare('SELECT active_sec FROM daily_stats WHERE uid = ? AND day = ?').bind(uid, day).first())?.active_sec || 0;
    const acc = Math.max(0, Math.min(sec, MAX_DAY_SEC - usedToday[day]));
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO study_events (id, uid, type, resource_id, chapter_id, subject_id, claimed_sec, accepted_sec, started_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(`${uid}:${id}`, uid, type, e.resourceId == null ? null : idOf(e.resourceId, 'Resource'), chapterId, subjOf[chapterId] || null, sec, acc, startedAt, t).run();
    if (!ins.meta?.changes) { accepted.push({ id, acceptedSec: 0, reason: 'duplicate' }); continue; }
    if (acc > 0) {
      usedToday[day] += acc;
      const stmts = [env.DB.prepare('INSERT INTO daily_stats (uid, day, active_sec) VALUES (?, ?, ?) ON CONFLICT(uid, day) DO UPDATE SET active_sec = active_sec + excluded.active_sec').bind(uid, day, acc)];
      if (subjOf[chapterId]) stmts.push(env.DB.prepare('INSERT INTO daily_subject_stats (uid, day, subject_id, active_sec) VALUES (?, ?, ?, ?) ON CONFLICT(uid, day, subject_id) DO UPDATE SET active_sec = active_sec + excluded.active_sec').bind(uid, day, subjOf[chapterId], acc));
      await env.DB.batch(stmts);
    }
    accepted.push({ id, acceptedSec: acc });
  }
  // Daily goal XP (once per day).
  const xp = await xpConfig(env);
  let xpAwarded = 0;
  for (const [day, total] of Object.entries(usedToday)) {
    if (total >= DAILY_GOAL_MIN * 60) {
      const got = await award(env, uid, xp.dailyGoal, 'Daily goal completed', `goal:${day}`);
      if (got) { xpAwarded += got; await notify(env, uid, 'Daily goal completed!', `+${got} XP`); }
    }
  }
  const unlocked = await checkAchievements(env, uid);
  return { results: accepted, xpAwarded, unlocked };
}

/* ============================== completions ============================== */
async function complete(env, ctx, input) {
  const uid = ctx.user.uid;
  const itemId = idOf(input.itemId, 'Item');
  let chapterId, kind;
  if (itemId.startsWith('notes:')) {
    chapterId = itemId.slice(6);
    kind = 'notes';
    if (!(await env.DB.prepare("SELECT 1 FROM notes n JOIN chapters c ON c.id = n.chapter_id WHERE n.chapter_id = ? AND c.status = 'published'").bind(chapterId).first())) throw new HttpError(404, 'not-found', 'Notes not found');
  } else {
    const r = await env.DB.prepare("SELECT chapter_id, type FROM resources WHERE id = ? AND status = 'published'").bind(itemId).first();
    if (!r) throw new HttpError(404, 'not-found', 'Resource not found');
    chapterId = r.chapter_id;
    kind = r.type;
  }
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO completions (uid, item_id, chapter_id, kind, completed_at) VALUES (?, ?, ?, ?, ?)').bind(uid, itemId, chapterId, kind, now()).run();
  const xp = await xpConfig(env);
  const xpAwarded = ins.meta?.changes ? await award(env, uid, xp.resourceComplete, `Completed ${kind}`, `complete:${itemId}`) : 0;
  return { itemId, chapterId, completed: true, xpAwarded, unlocked: await checkAchievements(env, uid) };
}

/* ============================== achievements ============================== */
export const ACHIEVEMENTS = [
  { id: 'first-step', title: 'First Step', desc: 'Complete your first chapter item' },
  { id: 'streak-3', title: '3 Days Streak', desc: 'Study 3 days in a row' },
  { id: 'streak-7', title: '7 Days Streak', desc: 'Study 7 days in a row' },
  { id: 'goal', title: 'Goal Crusher', desc: 'Complete your daily study goal' },
  { id: 'quiz-master', title: 'Quiz Master', desc: 'Score 90% or more in a model test' },
  { id: 'bookworm', title: 'Bookworm', desc: 'Finish the notes of every chapter in a book' },
  { id: 'voice', title: 'Community Voice', desc: 'Publish your first post' },
];

/** Current streak in days, counting today if studied, otherwise from yesterday. */
export function streakFrom(days, today) {
  const set = new Set(days);
  let d = Date.parse(`${today}T00:00:00Z`);
  if (!set.has(today)) d -= 86400_000;
  let n = 0;
  while (set.has(new Date(d).toISOString().slice(0, 10))) { n++; d -= 86400_000; }
  return n;
}

async function checkAchievements(env, uid) {
  const have = new Set((await env.DB.prepare('SELECT achievement_id FROM achievements WHERE uid = ?').bind(uid).all()).results.map((r) => r.achievement_id));
  const todo = ACHIEVEMENTS.filter((a) => !have.has(a.id));
  if (!todo.length) return [];
  const [comp, days, goal, quiz, posts, books] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) n FROM completions WHERE uid = ?').bind(uid),
    env.DB.prepare('SELECT day FROM daily_stats WHERE uid = ? AND active_sec > 0 ORDER BY day DESC LIMIT 60').bind(uid),
    env.DB.prepare("SELECT COUNT(*) n FROM xp_ledger WHERE uid = ? AND source_id LIKE 'goal:%'").bind(uid),
    env.DB.prepare("SELECT COUNT(*) n FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.uid = ? AND a.status = 'graded' AND e.type = 'model' AND a.total > 0 AND a.score * 10 >= a.total * 9").bind(uid),
    env.DB.prepare("SELECT COUNT(*) n FROM posts WHERE author_uid = ? AND status != 'removed'").bind(uid),
    env.DB.prepare(`SELECT b.id FROM books b JOIN chapters c ON c.book_id = b.id JOIN notes n ON n.chapter_id = c.id
      WHERE b.status = 'published' AND c.status = 'published' GROUP BY b.id
      HAVING COUNT(*) = SUM(CASE WHEN EXISTS (SELECT 1 FROM completions x WHERE x.uid = ? AND x.item_id = 'notes:' || c.id) THEN 1 ELSE 0 END)`).bind(uid),
  ]);
  const streak = streakFrom(days.results.map((r) => r.day), dayKey(now()));
  const ok = {
    'first-step': comp.results[0].n > 0, 'streak-3': streak >= 3, 'streak-7': streak >= 7, goal: goal.results[0].n > 0,
    'quiz-master': quiz.results[0].n > 0, bookworm: books.results.length > 0, voice: posts.results[0].n > 0,
  };
  const unlocked = todo.filter((a) => ok[a.id]);
  for (const a of unlocked) {
    await env.DB.prepare('INSERT OR IGNORE INTO achievements (uid, achievement_id, unlocked_at) VALUES (?, ?, ?)').bind(uid, a.id, now()).run();
    await notify(env, uid, `Achievement unlocked: ${a.title}`, a.desc);
  }
  return unlocked.map((a) => a.id);
}

/* ============================== progress ============================== */
async function progress(env, ctx) {
  const uid = ctx.user.uid;
  const t = now();
  const today = dayKey(t);
  const weekAgo = dayKey(t - 6 * 86400_000);
  const [xpAll, xpWeek, days, subj, comp, ach, att] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(amount), 0) n FROM xp_ledger WHERE uid = ?').bind(uid),
    env.DB.prepare('SELECT COALESCE(SUM(amount), 0) n FROM xp_ledger WHERE uid = ? AND created_at >= ?').bind(uid, periodStart('weekly', t)),
    env.DB.prepare('SELECT day, active_sec FROM daily_stats WHERE uid = ? ORDER BY day DESC LIMIT 120').bind(uid),
    env.DB.prepare('SELECT subject_id, SUM(active_sec) sec FROM daily_subject_stats WHERE uid = ? AND day >= ? GROUP BY subject_id ORDER BY sec DESC').bind(uid, weekAgo),
    env.DB.prepare('SELECT item_id, chapter_id, kind, completed_at FROM completions WHERE uid = ?').bind(uid),
    env.DB.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE uid = ?').bind(uid),
    env.DB.prepare(`SELECT a.id, a.exam_id, e.title, e.type, a.status, a.score, a.total, a.started_at, a.submitted_at FROM attempts a LEFT JOIN exams e ON e.id = a.exam_id
      WHERE a.uid = ? AND a.status IN ('graded','expired','legacy') ORDER BY a.started_at DESC LIMIT 20`).bind(uid),
  ]);
  const xp = xpAll.results[0].n;
  const byDay = Object.fromEntries(days.results.map((r) => [r.day, r.active_sec]));
  const series = [];
  for (let i = 6; i >= 0; i--) { const d = dayKey(t - i * 86400_000); series.push({ day: d, sec: byDay[d] || 0 }); }
  const unlockedAt = Object.fromEntries(ach.results.map((r) => [r.achievement_id, r.unlocked_at]));
  return {
    xp, level: Math.floor(xp / LEVEL_XP) + 1, levelXp: LEVEL_XP, intoLevel: xp % LEVEL_XP, weekXp: xpWeek.results[0].n,
    todaySec: byDay[today] || 0, goalSec: DAILY_GOAL_MIN * 60, totalSec: days.results.reduce((a, r) => a + r.active_sec, 0),
    streak: streakFrom(Object.keys(byDay).filter((d) => byDay[d] > 0), today), series,
    bySubject: subj.results.map((r) => ({ subjectId: r.subject_id, sec: r.sec })),
    completions: comp.results.map((r) => ({ itemId: r.item_id, chapterId: r.chapter_id, kind: r.kind, at: r.completed_at })),
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: unlockedAt[a.id] || null })),
    attempts: att.results.map(attemptSummary),
  };
}

/* ============================== AI tutor (notes only) ============================== */
const STOP = new Set('what which when where who why how does do is are was were the a an of in on to for and or with from by about explain tell me please define meaning কী কি কেন কাকে বলে বলো একটু আরও সহজভাবে বুঝিয়ে কিভাবে কীভাবে হলো হয় এর ও এবং করে'.split(' '));
const MORE_RE = /(আরও|আরো|সহজ|বুঝিয়ে|more|simpl|again|elaborate|detail)/i;
const HAS_BN = /[ঀ-৿]/;
export function tutorTokens(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s'’]/gu, ' ').split(/\s+/).filter((w) => (w.length > 2 || HAS_BN.test(w)) && !STOP.has(w));
}
function bnMatch(term, q, toks) {
  if (term.includes(' ')) return q.includes(term);
  return toks.some((t) => t.startsWith(term) && t.length - term.length <= 3);
}
export function tutorScore(sec, q, toks) {
  let s = 0;
  const qLower = q.toLowerCase();
  const acronyms = new Set((q.match(/\b[A-Z]{2,}\b/g) || []).map((a) => a.toLowerCase()));
  for (const term of sec.terms || sec.bn || []) if (bnMatch(String(term).toLowerCase(), qLower, toks)) s += 6;
  const head = String(sec.heading || '').toLowerCase();
  const text = String(sec.text || '').toLowerCase();
  for (const t of toks) {
    const stem = t.replace(/(ies|es|s)$/, '');
    if (stem.length < 3) continue;
    if (head.includes(stem)) s += 3;
    if (text.includes(stem)) s += acronyms.has(stem) ? 3 : 1;
  }
  return s;
}

async function tutorAsk(env, ctx, input) {
  const q = str(input.q, { min: 1, max: 500, field: 'Question' });
  const levelId = ctx.user.level_id;
  const rows = (await env.DB.prepare(`SELECT n.chapter_id, nv.sections_json, c.number, c.title AS chapter_title, b.id AS book_id, b.title AS book_title, b.subject_id,
      EXISTS (SELECT 1 FROM book_levels bl WHERE bl.book_id = b.id AND bl.level_id = ?) AS mine
    FROM notes n JOIN note_versions nv ON nv.chapter_id = n.chapter_id AND nv.version = n.current_version
    JOIN chapters c ON c.id = n.chapter_id JOIN books b ON b.id = c.book_id
    WHERE c.status = 'published' AND b.status = 'published'`).bind(levelId || '').all()).results;
  const ref = (r, i, sec) => ({ bookId: r.book_id, bookTitle: r.book_title, subjectId: r.subject_id, chapterId: r.chapter_id, chapterNumber: r.number, chapterTitle: r.chapter_title, page: sec.page ?? null, section: i });
  const bn = HAS_BN.test(q);
  const prev = input.prev && typeof input.prev === 'object' ? input.prev : null;
  if (prev && MORE_RE.test(q) && tutorTokens(q).length <= 2) {
    const r = rows.find((x) => x.chapter_id === prev.chapterId);
    const secs = r ? JSON.parse(r.sections_json) : [];
    if (secs.length) {
      const i = (Number(prev.section) + 1) % secs.length;
      return { found: true, followUp: true, heading: secs[i].heading, text: secs[i].text, reference: ref(r, i, secs[i]) };
    }
  }
  const toks = tutorTokens(q);
  let best = null;
  for (const r of rows) {
    JSON.parse(r.sections_json).forEach((sec, i) => {
      // Notes from the student's own class win ties.
      const s = tutorScore(sec, q, toks) + (r.mine ? 0.5 : 0);
      if (s >= 3 && (!best || s > best.s)) best = { s, r, i, sec };
    });
  }
  if (!best) {
    return {
      found: false,
      text: bn ? 'দুঃখিত, এই প্রশ্নের উত্তর এখনো Sanzar-এর নোটে নেই। প্রশ্নটি অন্যভাবে লিখে দেখো, অথবা তোমার অধ্যায়ের কোনো বিষয় নিয়ে জিজ্ঞাসা করো।'
        : "I couldn't find this in Sanzar's notes yet. Try wording it differently, or ask about a topic from your chapters.",
    };
  }
  return { found: true, heading: best.sec.heading, text: best.sec.text, reference: ref(best.r, best.i, best.sec) };
}

/* ============================== exams ============================== */
function attemptSummary(a) {
  return { id: a.id, examId: a.exam_id, title: a.title || '', type: a.type || '', status: a.status, score: a.score, total: a.total, startedAt: a.started_at, submittedAt: a.submitted_at };
}

async function examInfo(env, ctx, examId) {
  const e = await env.DB.prepare("SELECT id, title, type, book_id, chapter_id, duration_sec, question_count, pass_pct, opens_at, closes_at FROM exams WHERE id = ? AND status = 'published'").bind(examId).first();
  if (!e) throw new HttpError(404, 'not-found', 'Exam not found');
  const mine = (await env.DB.prepare('SELECT a.*, NULL AS title, NULL AS type FROM attempts a WHERE uid = ? AND exam_id = ? ORDER BY started_at DESC LIMIT 20').bind(ctx.user.uid, examId).all()).results;
  return { exam: e, attempts: mine.map(attemptSummary) };
}

/** Fisher–Yates with crypto randomness. */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadQuestions(env, refs) {
  if (!refs.length) return {};
  const rows = (await env.DB.prepare(`SELECT question_id, version, text, options_json, answer, explanation FROM question_versions WHERE ${refs.map(() => '(question_id = ? AND version = ?)').join(' OR ')}`)
    .bind(...refs.flatMap((r) => [r.qid, r.v])).all()).results;
  return Object.fromEntries(rows.map((r) => [`${r.question_id}@${r.version}`, r]));
}

async function startExam(env, ctx, examId) {
  const uid = ctx.user.uid;
  const t = now();
  const e = await env.DB.prepare("SELECT * FROM exams WHERE id = ? AND status = 'published'").bind(examId).first();
  if (!e) throw new HttpError(404, 'not-found', 'Exam not found');
  if ((e.opens_at && t < e.opens_at) || (e.closes_at && t > e.closes_at)) throw new HttpError(409, 'failed-precondition', 'This exam is not open now');
  if (e.type === 'written') throw new HttpError(409, 'failed-precondition', 'Written exams are not available in the app yet');
  // Resume an unfinished attempt instead of starting a new one.
  let a = await env.DB.prepare("SELECT * FROM attempts WHERE uid = ? AND exam_id = ? AND status = 'in_progress' AND ends_at > ? ORDER BY started_at DESC LIMIT 1").bind(uid, examId, t).first();
  if (!a) {
    const pool = e.chapter_id
      ? (await env.DB.prepare("SELECT id, current_version v FROM questions WHERE chapter_id = ? AND status = 'published' AND type = 'mcq'").bind(e.chapter_id).all()).results
      : (await env.DB.prepare("SELECT q.id, q.current_version v FROM questions q JOIN chapters c ON c.id = q.chapter_id WHERE c.book_id = ? AND q.status = 'published' AND q.type = 'mcq'").bind(e.book_id).all()).results;
    if (!pool.length) throw new HttpError(409, 'failed-precondition', 'This exam has no questions yet');
    const picked = shuffle(pool).slice(0, e.question_count).map((q) => ({ qid: q.id, v: q.v }));
    await env.DB.prepare("UPDATE attempts SET status = 'expired' WHERE uid = ? AND exam_id = ? AND status = 'in_progress'").bind(uid, examId).run();
    a = { id: newId('at'), uid, exam_id: examId, status: 'in_progress', questions_json: JSON.stringify(picked), started_at: t, ends_at: t + e.duration_sec * 1000 };
    await env.DB.prepare('INSERT INTO attempts (id, uid, exam_id, status, questions_json, started_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(a.id, uid, examId, a.status, a.questions_json, a.started_at, a.ends_at).run();
  }
  const refs = JSON.parse(a.questions_json);
  const qs = await loadQuestions(env, refs);
  return {
    attempt: { id: a.id, examId, title: e.title, startedAt: a.started_at, endsAt: a.ends_at, serverTime: t },
    // No answers or explanations before submission.
    questions: refs.map((r) => qs[`${r.qid}@${r.v}`]).filter(Boolean).map((q) => ({ id: q.question_id, text: q.text, options: JSON.parse(q.options_json) })),
  };
}

const GRACE_MS = 30_000;
async function submitAttempt(env, ctx, attemptId, input) {
  const uid = ctx.user.uid;
  const a = await env.DB.prepare('SELECT * FROM attempts WHERE id = ? AND uid = ?').bind(attemptId, uid).first();
  if (!a) throw new HttpError(404, 'not-found', 'Attempt not found');
  if (a.status !== 'in_progress') return attemptResult(env, ctx, attemptId); // already submitted → same result (idempotent)
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {};
  const refs = JSON.parse(a.questions_json);
  const qs = await loadQuestions(env, refs);
  const t = now();
  const late = t > a.ends_at + GRACE_MS;
  let score = 0;
  const clean = {};
  for (const r of refs) {
    const q = qs[`${r.qid}@${r.v}`];
    const v = answers[r.qid];
    if (q && Number.isInteger(v) && v >= 0 && v < JSON.parse(q.options_json).length) {
      clean[r.qid] = v;
      if (v === q.answer) score++;
    }
  }
  const status = late ? 'expired' : 'graded';
  const upd = await env.DB.prepare("UPDATE attempts SET status = ?, answers_json = ?, score = ?, total = ?, submitted_at = ? WHERE id = ? AND status = 'in_progress'")
    .bind(status, JSON.stringify(clean), score, refs.length, t, attemptId).run();
  let xpAwarded = 0;
  if (upd.meta?.changes && !late) {
    const xp = await xpConfig(env);
    // XP only for the first graded attempt of each exam, so retakes cannot farm points.
    xpAwarded = await award(env, uid, score * xp.quizCorrect, 'Exam correct answers', `exam:${a.exam_id}`);
  }
  const res = await attemptResult(env, ctx, attemptId);
  return { ...res, xpAwarded, unlocked: await checkAchievements(env, uid) };
}

async function attemptResult(env, ctx, attemptId) {
  const a = await env.DB.prepare('SELECT a.*, e.title, e.type, e.pass_pct FROM attempts a LEFT JOIN exams e ON e.id = a.exam_id WHERE a.id = ? AND a.uid = ?').bind(attemptId, ctx.user.uid).first();
  if (!a) throw new HttpError(404, 'not-found', 'Attempt not found');
  if (a.status === 'in_progress') throw new HttpError(409, 'failed-precondition', 'Submit the exam first');
  const refs = a.status === 'legacy' ? [] : JSON.parse(a.questions_json || '[]');
  const qs = await loadQuestions(env, refs.filter((r) => r.qid && r.v));
  const answers = JSON.parse(a.answers_json || '{}');
  return {
    attempt: { ...attemptSummary(a), passPct: a.pass_pct ?? 60, passed: a.total ? a.score * 100 >= a.total * (a.pass_pct ?? 60) : false },
    review: refs.map((r) => qs[`${r.qid}@${r.v}`]).filter(Boolean).map((q) => ({
      id: q.question_id, text: q.text, options: JSON.parse(q.options_json), answer: q.answer, explanation: q.explanation, chosen: answers[q.question_id] ?? null,
    })),
  };
}

async function listAttempts(env, ctx) {
  const rows = (await env.DB.prepare(`SELECT a.*, e.title, e.type FROM attempts a LEFT JOIN exams e ON e.id = a.exam_id WHERE a.uid = ? AND a.status != 'in_progress' ORDER BY a.started_at DESC LIMIT 100`).bind(ctx.user.uid).all()).results;
  return { attempts: rows.map(attemptSummary) };
}

/* ============================== leaderboard ============================== */
export function periodStart(period, t) {
  if (period === 'all') return 0;
  const d = new Date(t + BD_OFFSET);
  if (period === 'monthly') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - BD_OFFSET;
  // Weeks start on Saturday in Bangladesh.
  const back = (d.getUTCDay() + 1) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - BD_OFFSET;
}

async function leaderboard(env, ctx, url) {
  const period = ['weekly', 'monthly', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'weekly';
  const level = url.searchParams.get('level');
  const from = periodStart(period, now());
  const lv = level && /^[\w-]{1,10}$/.test(level) ? level : null;
  const rows = (await env.DB.prepare(`SELECT x.uid, SUM(x.amount) xp, u.display_name, u.level_id, u.profile_visibility, u.photo_url
    FROM xp_ledger x JOIN users u ON u.uid = x.uid WHERE x.created_at >= ? AND u.blocked = 0 ${lv ? 'AND u.level_id = ?' : ''}
    GROUP BY x.uid ORDER BY xp DESC, MIN(x.created_at) ASC LIMIT 100`).bind(...(lv ? [from, lv] : [from])).all()).results;
  const show = (r) => r.uid === ctx.user.uid || r.profile_visibility !== 'private';
  const entries = rows.map((r, i) => ({ rank: i + 1, uid: show(r) ? r.uid : null, name: show(r) ? r.display_name : 'Student', levelId: r.level_id, xp: r.xp, me: r.uid === ctx.user.uid }));
  let me = entries.find((e) => e.me) || null;
  if (!me) {
    const mine = (await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) n FROM xp_ledger WHERE uid = ? AND created_at >= ?').bind(ctx.user.uid, from).first()).n;
    if (mine > 0) {
      const ahead = (await env.DB.prepare(`SELECT COUNT(*) n FROM (SELECT x.uid FROM xp_ledger x JOIN users u ON u.uid = x.uid WHERE x.created_at >= ? AND u.blocked = 0 ${lv ? 'AND u.level_id = ?' : ''} GROUP BY x.uid HAVING SUM(x.amount) > ?)`)
        .bind(...(lv ? [from, lv, mine] : [from, mine])).first()).n;
      me = { rank: ahead + 1, uid: ctx.user.uid, name: ctx.user.display_name, levelId: ctx.user.level_id, xp: mine, me: true };
    }
  }
  return { period, from, entries: entries.slice(0, 50), me };
}

/* ============================== community ============================== */
const POST_MAX = 2000;
const POSTS_PER_DAY = 20;

async function blockedSet(env, uid) {
  const r = (await env.DB.prepare('SELECT blocked_uid AS u FROM blocks WHERE uid = ? UNION SELECT uid AS u FROM blocks WHERE blocked_uid = ?').bind(uid, uid).all()).results;
  return new Set(r.map((x) => x.u));
}

function shapePost(p, uid, liked, votes, myVote) {
  const poll = p.poll_json ? JSON.parse(p.poll_json) : null;
  return {
    id: p.id, authorUid: p.author_uid, authorName: p.author_name, text: p.text, category: p.category,
    likeCount: p.like_count, commentCount: p.comment_count, likedByMe: liked, createdAt: p.created_at, mine: p.author_uid === uid,
    attachments: JSON.parse(p.media_json || '[]'),
    poll: poll ? { question: poll.question, options: poll.options.map((o, i) => ({ text: o, votes: votes[i] || 0 })), myVote } : null,
  };
}

async function feed(env, ctx, url) {
  const uid = ctx.user.uid;
  const before = Number(url.searchParams.get('before')) || 9e15;
  const category = url.searchParams.get('category');
  const author = url.searchParams.get('author');
  const where = ["p.status = 'visible'", 'p.created_at < ?'];
  const args = [before];
  if (category === 'research' || category === 'general') { where.push('p.category = ?'); args.push(category); }
  if (author) { where.push('p.author_uid = ?'); args.push(idOf(author, 'Author')); }
  const rows = (await env.DB.prepare(`SELECT p.* FROM posts p WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 40`).bind(...args).all()).results;
  const blocked = await blockedSet(env, uid);
  const posts = rows.filter((p) => !blocked.has(p.author_uid)).slice(0, 20);
  if (!posts.length) return { posts: [], next: null };
  const ids = posts.map((p) => p.id);
  const ph = ids.map(() => '?').join(',');
  const [likes, votes, mine] = await env.DB.batch([
    env.DB.prepare(`SELECT post_id FROM post_likes WHERE uid = ? AND post_id IN (${ph})`).bind(uid, ...ids),
    env.DB.prepare(`SELECT post_id, option_index, COUNT(*) n FROM poll_votes WHERE post_id IN (${ph}) GROUP BY post_id, option_index`).bind(...ids),
    env.DB.prepare(`SELECT post_id, option_index FROM poll_votes WHERE uid = ? AND post_id IN (${ph})`).bind(uid, ...ids),
  ]);
  const liked = new Set(likes.results.map((r) => r.post_id));
  const vc = {};
  for (const v of votes.results) (vc[v.post_id] ||= {})[v.option_index] = v.n;
  const myVote = Object.fromEntries(mine.results.map((r) => [r.post_id, r.option_index]));
  return { posts: posts.map((p) => shapePost(p, uid, liked.has(p.id), vc[p.id] || {}, myVote[p.id] ?? null)), next: rows.length >= 40 || posts.length === 20 ? posts[posts.length - 1].created_at : null };
}

async function postAttachments(env, ctx, input, origin) {
  const items = input.attachments ?? [];
  if (!Array.isArray(items) || items.length > 5) throw new HttpError(400, 'invalid-argument', 'A post can include up to five attachments');
  const attachments = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'invalid-argument', 'Attachment is not valid');
    const name = str(item.name, { min: 1, max: 120, field: 'Attachment name' }).replace(/[\u0000-\u001f/\\]/g, '_');
    const mime = str(item.mime, { min: 1, max: 100, field: 'Attachment type' });
    if (item.key != null) {
      if (typeof item.key !== 'string' || !/^community\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|pdf|ppt|pptx)$/i.test(item.key)) {
        throw new HttpError(400, 'invalid-argument', 'Attachment key is not valid');
      }
      if (!env.MEDIA) throw new HttpError(503, 'uploads-unavailable', 'File uploads are not enabled on this platform');
      const object = await env.MEDIA.head(item.key);
      if (!object || object.customMetadata?.ownerUid !== ctx.user.uid) {
        throw new HttpError(403, 'permission-denied', 'This upload is not available to your account');
      }
      attachments.push({
        url: `${origin}/v1/media/${encodeURIComponent(item.key)}`,
        name,
        mime: object.httpMetadata?.contentType || mime,
      });
      continue;
    }

    let url;
    try {
      url = new URL(str(item.url, { min: 1, max: 2048, field: 'Attachment link' }));
    } catch {
      throw new HttpError(400, 'invalid-argument', 'Attachment link must be a valid HTTPS URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new HttpError(400, 'invalid-argument', 'Attachment link must be a valid HTTPS URL');
    }
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) {
      throw new HttpError(400, 'invalid-argument', 'Attachment type is not valid');
    }
    attachments.push({ url: url.href, name, mime });
  }
  return attachments;
}

const UPLOAD_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function readUpload(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'invalid-argument', 'A file is required');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'payload-too-large', 'Each file must be 20 MB or smaller');
    }
    chunks.push(value);
  }
  if (!size) throw new HttpError(400, 'invalid-argument', 'A file is required');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function uploadMedia(req, env, ctx, url) {
  if (!env.MEDIA) throw new HttpError(503, 'uploads-unavailable', 'File uploads are not enabled on this platform');
  const name = str(url.searchParams.get('name') || '', { min: 1, max: 120, field: 'File name' })
    .replace(/[\u0000-\u001f/\\]/g, '_');
  const extension = name.split('.').pop()?.toLowerCase();
  const mime = UPLOAD_TYPES[extension];
  if (!mime) throw new HttpError(415, 'unsupported-media-type', 'This file type is not supported');
  const bytes = await readUpload(req);
  const key = `community/${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { ownerUid: ctx.user.uid, name },
  });
  return json({ key, name, mime, size: bytes.byteLength }, 201);
}

export async function serveCommunityMedia(env, key) {
  if (!/^community\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|pdf|ppt|pptx)$/i.test(key) || !env.MEDIA) {
    throw new HttpError(404, 'not-found', 'Media not found');
  }
  const object = await env.MEDIA.get(key);
  if (!object) throw new HttpError(404, 'not-found', 'Media not found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  const name = object.customMetadata?.name || 'attachment';
  headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(object.body, { headers });
}

async function createPost(env, ctx, input, origin) {
  const uid = ctx.user.uid;
  const text = str(input.text ?? '', { max: POST_MAX, field: 'Post' });
  const attachments = await postAttachments(env, ctx, input, origin);
  let poll = null;
  if (input.poll) {
    const opts = Array.isArray(input.poll.options) ? input.poll.options.map((o) => str(o, { min: 1, max: 80, field: 'Poll option' })) : [];
    if (opts.length < 2 || opts.length > 6) throw new HttpError(400, 'invalid-argument', 'A poll needs 2–6 options');
    poll = { question: str(input.poll.question, { min: 1, max: 200, field: 'Poll question' }), options: opts };
  }
  if (!text && !poll && !attachments.length) throw new HttpError(400, 'invalid-argument', 'Write something first');
  const category = input.category === 'research' ? 'research' : 'general';
  const t = now();
  const today = (await env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE author_uid = ? AND created_at >= ?').bind(uid, dayStart(dayKey(t))).first()).n;
  if (today >= POSTS_PER_DAY) throw new HttpError(429, 'resource-exhausted', `You can publish up to ${POSTS_PER_DAY} posts a day`);
  const id = newId('po');
  await env.DB.prepare(`INSERT INTO posts (id, author_uid, author_name, text, media_json, poll_json, group_id, category, status, like_count, comment_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'visible', 0, 0, ?)`).bind(id, uid, ctx.user.display_name || 'Student', text, JSON.stringify(attachments), poll ? JSON.stringify(poll) : null, category, t).run();
  const xp = await xpConfig(env);
  const xpAwarded = await award(env, uid, xp.post, 'Community post', `post-day:${dayKey(t)}`);
  const unlocked = await checkAchievements(env, uid);
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return { post: shapePost(p, uid, false, {}, null), xpAwarded, unlocked };
}

async function visiblePost(env, ctx, id) {
  const p = await env.DB.prepare("SELECT * FROM posts WHERE id = ? AND status = 'visible'").bind(idOf(id, 'Post')).first();
  if (!p || (await blockedSet(env, ctx.user.uid)).has(p.author_uid)) throw new HttpError(404, 'not-found', 'Post not found');
  return p;
}

async function deletePost(env, ctx, id) {
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(idOf(id, 'Post')).first();
  if (!p || p.status === 'removed') throw new HttpError(404, 'not-found', 'Post not found');
  if (p.author_uid !== ctx.user.uid) {
    requireRole(ctx.user, 'moderator');
    await audit(env, ctx, 'post.remove', id);
  }
  await env.DB.prepare("UPDATE posts SET status = 'removed' WHERE id = ?").bind(id).run();
  return { removed: true };
}

async function toggleLike(env, ctx, id) {
  const p = await visiblePost(env, ctx, id);
  const uid = ctx.user.uid;
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO post_likes (post_id, uid) VALUES (?, ?)').bind(p.id, uid).run();
  if (!ins.meta?.changes) await env.DB.prepare('DELETE FROM post_likes WHERE post_id = ? AND uid = ?').bind(p.id, uid).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) n FROM post_likes WHERE post_id = ?').bind(p.id).first()).n;
  await env.DB.prepare('UPDATE posts SET like_count = ? WHERE id = ?').bind(n, p.id).run();
  return { liked: !!ins.meta?.changes, likeCount: n };
}

async function vote(env, ctx, id, input) {
  const p = await visiblePost(env, ctx, id);
  if (!p.poll_json) throw new HttpError(400, 'invalid-argument', 'This post has no poll');
  const poll = JSON.parse(p.poll_json);
  const option = int(input.option, 'Option', 0, poll.options.length - 1);
  await env.DB.prepare('INSERT INTO poll_votes (post_id, uid, option_index) VALUES (?, ?, ?) ON CONFLICT(post_id, uid) DO UPDATE SET option_index = excluded.option_index').bind(p.id, ctx.user.uid, option).run();
  const counts = (await env.DB.prepare('SELECT option_index, COUNT(*) n FROM poll_votes WHERE post_id = ? GROUP BY option_index').bind(p.id).all()).results;
  const vc = Object.fromEntries(counts.map((c) => [c.option_index, c.n]));
  return { poll: { question: poll.question, options: poll.options.map((o, i) => ({ text: o, votes: vc[i] || 0 })), myVote: option } };
}

async function listComments(env, ctx, id) {
  const p = await visiblePost(env, ctx, id);
  const blocked = await blockedSet(env, ctx.user.uid);
  const rows = (await env.DB.prepare("SELECT * FROM comments WHERE post_id = ? AND status = 'visible' ORDER BY created_at ASC LIMIT 200").bind(p.id).all()).results;
  return { comments: rows.filter((c) => !blocked.has(c.author_uid)).map((c) => ({ id: c.id, authorUid: c.author_uid, authorName: c.author_name, text: c.text, createdAt: c.created_at, mine: c.author_uid === ctx.user.uid })) };
}

async function addComment(env, ctx, id, input) {
  const p = await visiblePost(env, ctx, id);
  const text = str(input.text, { min: 1, max: 1000, field: 'Comment' });
  const c = { id: newId('cm'), t: now() };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO comments (id, post_id, author_uid, author_name, text, status, created_at) VALUES (?, ?, ?, ?, ?, 'visible', ?)").bind(c.id, p.id, ctx.user.uid, ctx.user.display_name || 'Student', text, c.t),
    env.DB.prepare("UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND status = 'visible') WHERE id = ?").bind(p.id, p.id),
  ]);
  if (p.author_uid !== ctx.user.uid) await notify(env, p.author_uid, `${ctx.user.display_name || 'Someone'} commented on your post`, text.slice(0, 120));
  return { comment: { id: c.id, authorUid: ctx.user.uid, authorName: ctx.user.display_name, text, createdAt: c.t, mine: true } };
}

async function deleteComment(env, ctx, id) {
  const c = await env.DB.prepare("SELECT * FROM comments WHERE id = ? AND status = 'visible'").bind(idOf(id, 'Comment')).first();
  if (!c) throw new HttpError(404, 'not-found', 'Comment not found');
  if (c.author_uid !== ctx.user.uid) { requireRole(ctx.user, 'moderator'); await audit(env, ctx, 'comment.remove', id); }
  await env.DB.batch([
    env.DB.prepare("UPDATE comments SET status = 'removed' WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND status = 'visible') WHERE id = ?").bind(c.post_id, c.post_id),
  ]);
  return { removed: true };
}

const AUTO_HOLD_REPORTS = 3;
async function report(env, ctx, input) {
  const type = ['post', 'comment', 'user'].includes(input.targetType) ? input.targetType : null;
  if (!type) throw new HttpError(400, 'invalid-argument', 'Unknown report target');
  const targetId = idOf(input.targetId, 'Target');
  const reason = str(input.reason, { min: 3, max: 500, field: 'Reason' });
  const exists = await env.DB.prepare("SELECT 1 FROM reports WHERE reporter_uid = ? AND target_type = ? AND target_id = ? AND status = 'open'").bind(ctx.user.uid, type, targetId).first();
  if (!exists) await env.DB.prepare("INSERT INTO reports (id, reporter_uid, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)").bind(newId('rp'), ctx.user.uid, type, targetId, reason, now()).run();
  // Several independent reports hide a post until a moderator reviews it.
  if (type === 'post') {
    const n = (await env.DB.prepare("SELECT COUNT(DISTINCT reporter_uid) n FROM reports WHERE target_type = 'post' AND target_id = ? AND status = 'open'").bind(targetId).first()).n;
    if (n >= AUTO_HOLD_REPORTS) await env.DB.prepare("UPDATE posts SET status = 'held' WHERE id = ? AND status = 'visible'").bind(targetId).run();
  }
  return { reported: true };
}

async function userTarget(env, uid) {
  const u = await env.DB.prepare('SELECT uid, display_name, photo_url, level_id, institution, profile_visibility, created_at FROM users WHERE uid = ?').bind(idOf(uid, 'User')).first();
  if (!u || uid === 'deleted') throw new HttpError(404, 'not-found', 'User not found');
  return u;
}

async function follow(env, ctx, uid, on) {
  if (uid === ctx.user.uid) throw new HttpError(400, 'invalid-argument', 'You cannot follow yourself');
  await userTarget(env, uid);
  if (on) {
    if ((await blockedSet(env, ctx.user.uid)).has(uid)) throw new HttpError(403, 'permission-denied', 'You cannot follow this user');
    const r = await env.DB.prepare('INSERT OR IGNORE INTO follows (follower_uid, followee_uid, created_at) VALUES (?, ?, ?)').bind(ctx.user.uid, uid, now()).run();
    if (r.meta?.changes) await notify(env, uid, `${ctx.user.display_name || 'Someone'} started following you`);
  } else await env.DB.prepare('DELETE FROM follows WHERE follower_uid = ? AND followee_uid = ?').bind(ctx.user.uid, uid).run();
  return { following: on };
}

async function block(env, ctx, uid, on) {
  if (uid === ctx.user.uid) throw new HttpError(400, 'invalid-argument', 'You cannot block yourself');
  await userTarget(env, uid);
  if (on) {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO blocks (uid, blocked_uid, created_at) VALUES (?, ?, ?)').bind(ctx.user.uid, uid, now()),
      env.DB.prepare('DELETE FROM follows WHERE (follower_uid = ? AND followee_uid = ?) OR (follower_uid = ? AND followee_uid = ?)').bind(ctx.user.uid, uid, uid, ctx.user.uid),
    ]);
  } else await env.DB.prepare('DELETE FROM blocks WHERE uid = ? AND blocked_uid = ?').bind(ctx.user.uid, uid).run();
  return { blocked: on };
}

async function publicProfile(env, ctx, uid) {
  const u = await userTarget(env, uid);
  const me = ctx.user.uid;
  if ((await blockedSet(env, me)).has(uid)) throw new HttpError(404, 'not-found', 'User not found');
  const [fol, fing, isF, xp] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE followee_uid = ?').bind(uid),
    env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE follower_uid = ?').bind(uid),
    env.DB.prepare('SELECT 1 x FROM follows WHERE follower_uid = ? AND followee_uid = ?').bind(me, uid),
    env.DB.prepare('SELECT COALESCE(SUM(amount), 0) n FROM xp_ledger WHERE uid = ?').bind(uid),
  ]);
  const following = isF.results.length > 0;
  const full = uid === me || u.profile_visibility === 'public' || (u.profile_visibility === 'followers' && following);
  return {
    user: { uid, name: u.display_name, levelId: full ? u.level_id : null, institution: full ? u.institution : null, xp: full ? xp.results[0].n : null, visibility: u.profile_visibility },
    followers: fol.results[0].n, following: fing.results[0].n, isFollowing: following, limited: !full,
  };
}

/* ============================== notifications ============================== */
async function notifications(env, ctx) {
  const rows = (await env.DB.prepare('SELECT id, title, body, read, created_at FROM notifications WHERE uid = ? ORDER BY created_at DESC LIMIT 50').bind(ctx.user.uid).all()).results;
  return { notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, read: !!n.read, createdAt: n.created_at })), unread: rows.filter((n) => !n.read).length };
}

/* ============================== moderation ============================== */
async function adminReports(env, ctx, url) {
  requireRole(ctx.user, 'moderator');
  const status = ['open', 'actioned', 'dismissed'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'open';
  const rows = (await env.DB.prepare(`SELECT r.*, p.text AS post_text, p.author_uid AS post_author, p.status AS post_status, c.text AS comment_text
    FROM reports r LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
    WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`).bind(status).all()).results;
  return { reports: rows };
}

async function resolveReport(env, ctx, id, input) {
  requireRole(ctx.user, 'moderator');
  const r = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(idOf(id, 'Report')).first();
  if (!r) throw new HttpError(404, 'not-found', 'Report not found');
  const action = input.action;
  if (!['remove', 'dismiss', 'restore'].includes(action)) throw new HttpError(400, 'invalid-argument', 'Action must be remove, dismiss or restore');
  const stmts = [];
  if (r.target_type === 'post') stmts.push(env.DB.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(action === 'remove' ? 'removed' : 'visible', r.target_id));
  if (r.target_type === 'comment') stmts.push(env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(action === 'remove' ? 'removed' : 'visible', r.target_id));
  stmts.push(env.DB.prepare("UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE target_type = ? AND target_id = ? AND status = 'open'")
    .bind(action === 'remove' ? 'actioned' : 'dismissed', ctx.user.uid, now(), r.target_type, r.target_id));
  await env.DB.batch(stmts);
  await audit(env, ctx, `report.${action}`, `${r.target_type}:${r.target_id}`);
  return { ok: true };
}

/* ============================== offline sync ============================== */
async function syncOperations(env, ctx, input) {
  const uid = ctx.user.uid;
  const ops = Array.isArray(input.operations) ? input.operations : [];
  const legacyItems = Array.isArray(input.items) ? input.items : [];
  if (ops.length + legacyItems.length > 100) throw new HttpError(400, 'invalid-argument', 'Send at most 100 sync operations');

  const accepted = [];
  const rejected = [];
  const t = now();

  for (const op of ops) {
    try {
      const opId = idOf(op?.operationId, 'Operation id');
      const opType = str(op?.type ?? '', { min: 1, max: 40, field: 'Operation type' });
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO sync_operations (uid, operation_id, op_type, status, processed_at) VALUES (?, ?, ?, ?, ?)')
        .bind(uid, opId, opType, 'accepted', t).run();
      if (!ins.meta?.changes) {
        accepted.push({ operationId: opId, status: 'duplicate' });
        continue;
      }
      const p = op.payload && typeof op.payload === 'object' ? op.payload : {};
      if (opType === 'study_event') {
        await studyEvents(env, ctx, { events: [{ id: opId, type: p.type || 'notes', resourceId: p.resourceId ?? null, chapterId: p.chapterId ?? null, sec: p.sec ?? 60, startedAt: p.startedAt ?? t }] });
      } else if (opType === 'completion') {
        await complete(env, ctx, { itemId: p.itemId });
      } else if (opType === 'profile') {
        const sets = [];
        const vals = [];
        if (typeof p.level_id === 'string' && ['c6', 'c7', 'c8', 'c9', 'c10', 'hsc', 'uni'].includes(p.level_id)) { sets.push('level_id = ?'); vals.push(p.level_id); }
        if (typeof p.locale === 'string' && ['bn', 'en', 'zh'].includes(p.locale)) { sets.push('locale = ?'); vals.push(p.locale); }
        if (sets.length) {
          sets.push('updated_at = ?'); vals.push(t);
          await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE uid = ?`).bind(...vals, uid).run();
        }
      } else {
        throw new HttpError(400, 'invalid-argument', `Unsupported sync operation: ${opType}`);
      }
      accepted.push({ operationId: opId, status: 'accepted' });
    } catch (err) {
      rejected.push({ operationId: op?.operationId ?? null, code: err?.code || 'sync-failed', message: err?.message || 'Invalid operation' });
    }
  }

  for (const item of legacyItems) {
    try {
      const opId = idOf(item?.id, 'Sync item id');
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO sync_operations (uid, operation_id, op_type, status, processed_at) VALUES (?, ?, ?, ?, ?)')
        .bind(uid, opId, 'legacy_progress', 'accepted', t).run();
      accepted.push({ operationId: opId, status: ins.meta?.changes ? 'accepted' : 'duplicate' });
    } catch (err) {
      rejected.push({ operationId: item?.id ?? null, code: err?.code || 'sync-failed', message: err?.message || 'Invalid item' });
    }
  }

  return { accepted, rejected, serverTime: t };
}

/* ============================== router ============================== */
/** Returns a Response for feature routes, or null when the path is not handled here. */
export async function routeFeatures(req, env, ctx, url) {
  const path = url.pathname;
  const m = req.method;
  let mm;
  if (path === '/v1/sync' && m === 'POST') return json(await syncOperations(env, ctx, await body(req, 100_000)));
  if (path === '/v1/uploads' && m === 'POST') return uploadMedia(req, env, ctx, url);
  if (path === '/v1/study/events' && m === 'POST') return json(await studyEvents(env, ctx, await body(req, 50_000)));
  if (path === '/v1/completions' && m === 'POST') return json(await complete(env, ctx, await body(req, 2000)));
  if (path === '/v1/progress' && m === 'GET') return json(await progress(env, ctx));
  if (path === '/v1/tutor/ask' && m === 'POST') return json(await tutorAsk(env, ctx, await body(req, 4000)));
  if ((mm = path.match(/^\/v1\/exams\/([\w.:-]{1,128})$/)) && m === 'GET') return json(await examInfo(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/exams\/([\w.:-]{1,128})\/start$/)) && m === 'POST') return json(await startExam(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/attempts\/([\w-]{1,64})\/submit$/)) && m === 'POST') return json(await submitAttempt(env, ctx, mm[1], await body(req, 20_000)));
  if ((mm = path.match(/^\/v1\/attempts\/([\w-]{1,64})$/)) && m === 'GET') return json(await attemptResult(env, ctx, mm[1]));
  if (path === '/v1/attempts' && m === 'GET') return json(await listAttempts(env, ctx));
  if ((path === '/v1/leaderboard' || path === '/v1/rankings') && m === 'GET') return json(await leaderboard(env, ctx, url));
  if (path === '/v1/feed' && m === 'GET') return json(await feed(env, ctx, url));
  if (path === '/v1/posts' && m === 'POST') return json(await createPost(env, ctx, await body(req, 20_000), url.origin));
  if ((mm = path.match(/^\/v1\/posts\/([\w-]{1,64})$/)) && m === 'DELETE') return json(await deletePost(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/posts\/([\w-]{1,64})\/like$/)) && m === 'POST') return json(await toggleLike(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/posts\/([\w-]{1,64})\/vote$/)) && m === 'POST') return json(await vote(env, ctx, mm[1], await body(req, 1000)));
  if ((mm = path.match(/^\/v1\/posts\/([\w-]{1,64})\/comments$/)) && m === 'GET') return json(await listComments(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/posts\/([\w-]{1,64})\/comments$/)) && m === 'POST') return json(await addComment(env, ctx, mm[1], await body(req, 4000)));
  if ((mm = path.match(/^\/v1\/comments\/([\w-]{1,64})$/)) && m === 'DELETE') return json(await deleteComment(env, ctx, mm[1]));
  if (path === '/v1/reports' && m === 'POST') return json(await report(env, ctx, await body(req, 2000)));
  if ((mm = path.match(/^\/v1\/users\/([\w-]{1,128})$/)) && m === 'GET') return json(await publicProfile(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/users\/([\w-]{1,128})\/follow$/)) && (m === 'POST' || m === 'DELETE')) return json(await follow(env, ctx, mm[1], m === 'POST'));
  if ((mm = path.match(/^\/v1\/users\/([\w-]{1,128})\/block$/)) && (m === 'POST' || m === 'DELETE')) return json(await block(env, ctx, mm[1], m === 'POST'));
  if (path === '/v1/notifications' && m === 'GET') return json(await notifications(env, ctx));
  if (path === '/v1/notifications/read' && m === 'POST') { await env.DB.prepare('UPDATE notifications SET read = 1 WHERE uid = ?').bind(ctx.user.uid).run(); return json({ ok: true }); }
  if (path === '/v1/admin/reports' && m === 'GET') return json(await adminReports(env, ctx, url));
  if ((mm = path.match(/^\/v1\/admin\/reports\/([\w-]{1,64})$/)) && m === 'PUT') return json(await resolveReport(env, ctx, mm[1], await body(req, 1000)));
  return null;
}
