/**
 * Sanzar API — admin content management.
 *
 * content_admin and above: books, chapters, notes (versioned), resources
 * (versioned), questions (versioned), exams.
 * admin and above: announcements, dashboard stats.
 * Every change is written to audit_logs. Nothing is overwritten in place
 * for notes, resources and questions: each save adds a version and
 * rollback just points current_version back.
 */
import { HttpError, now, json, str, body, audit, requireRole, driveThumbFromUrl } from './worker.js';
import { stripPinyinTones, toDbLang } from './dictionary.js';

const STATUS = new Set(['draft', 'published', 'archived']);
const LEVEL_IDS = new Set(['zh', 'en']);
const RES_TYPES = new Set(['video', 'pdf', 'ppt', 'link']);
const DICT_LANGS = new Set(['zh', 'en']);
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;
const slug = (v, field) => {
  if (typeof v !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v)) throw new HttpError(400, 'invalid-argument', `${field} id may use letters, digits, dot, dash and underscore (max 64)`);
  return v;
};
const status = (v, d = 'published') => {
  if (v == null) return d;
  if (!STATUS.has(v)) throw new HttpError(400, 'invalid-argument', 'Status must be draft, published or archived');
  return v;
};
const num = (v, field, min, max, d = null) => {
  if (v == null || v === '') return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'invalid-argument', `${field} must be a whole number from ${min} to ${max}`);
  return n;
};
const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const httpsUrl = (v, field = 'Link') => {
  if (typeof v !== 'string' || !/^https:\/\/[^\s]{4,1000}$/.test(v)) throw new HttpError(400, 'invalid-argument', `${field} must be an https:// link`);
  return v;
};
const validateCoverImage = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, 'invalid-argument', 'Thumbnail image must be text');
  const trimmed = v.trim();
  if (/^https:\/\/[^\s]{4,1000}$/.test(trimmed)) return trimmed;
  if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length <= 250_000) return trimmed;
  throw new HttpError(400, 'invalid-argument', 'Thumbnail must be an https:// link or compact image data URI (<= 250 KB)');
};
const validateCoverRatio = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, 'invalid-argument', 'Cover ratio must be a number');
  return Math.round(Math.max(0.35, Math.min(3.0, n)) * 10000) / 10000;
};

async function content(env) {
  const [levels, subjects, books, bookLevels, chapters, resources, versions, videos, notes, exams, ann, qCount] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM levels ORDER BY sort'),
    env.DB.prepare('SELECT * FROM subjects ORDER BY sort'),
    env.DB.prepare('SELECT * FROM books ORDER BY sort, title'),
    env.DB.prepare('SELECT * FROM book_levels'),
    env.DB.prepare('SELECT * FROM chapters ORDER BY book_id, sort, number'),
    env.DB.prepare('SELECT * FROM resources ORDER BY chapter_id, sort'),
    env.DB.prepare('SELECT resource_id, version, url, change_note, created_by, created_at FROM resource_versions ORDER BY resource_id, version DESC'),
    env.DB.prepare('SELECT * FROM video_assets'),
    env.DB.prepare('SELECT n.chapter_id, n.current_version, n.updated_at, (SELECT MAX(version) FROM note_versions v WHERE v.chapter_id = n.chapter_id) AS latest FROM notes n'),
    env.DB.prepare('SELECT * FROM exams ORDER BY type, title'),
    env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100'),
    env.DB.prepare("SELECT chapter_id, COUNT(*) n FROM questions WHERE status != 'archived' GROUP BY chapter_id"),
  ]);
  const lv = {};
  for (const r of bookLevels.results) (lv[r.book_id] ||= []).push(r.level_id);
  const vers = {};
  for (const v of versions.results) (vers[v.resource_id] ||= []).push(v);
  const vid = Object.fromEntries(videos.results.map((v) => [v.id, v]));
  return {
    levels: levels.results, subjects: subjects.results,
    books: books.results.map((b) => ({ ...b, levels: lv[b.id] || [] })),
    chapters: chapters.results,
    resources: resources.results.map((r) => ({ ...r, url: r.video_asset_id ? vid[r.video_asset_id]?.url : vers[r.id]?.find((v) => v.version === r.current_version)?.url || null, versions: vers[r.id] || [] })),
    notes: notes.results, exams: exams.results, announcements: ann.results,
    questionCounts: Object.fromEntries(qCount.results.map((q) => [q.chapter_id, q.n])),
  };
}

async function putSubject(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Subject');
  const name = str(i.name_en, { min: 2, max: 80, field: 'Name' });
  await env.DB.prepare(`INSERT INTO subjects (id, name_en, name_bn, name_zh, icon, color, sort) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name_en = excluded.name_en, name_bn = excluded.name_bn, name_zh = excluded.name_zh,
      icon = excluded.icon, color = excluded.color, sort = excluded.sort`)
    .bind(id, name, str(i.name_bn ?? '', { max: 80, field: 'Bengali name' }), str(i.name_zh ?? '', { max: 80, field: 'Chinese name' }),
      str(i.icon ?? '', { max: 40, field: 'Icon' }), color(i.color, '#247754'), num(i.sort, 'Order', 0, 100000, 0)).run();
  await audit(env, ctx, 'subject.save', id);
  return { id };
}

async function putBook(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Book');
  const subject = slug(i.subject_id, 'Subject');
  if (!(await env.DB.prepare('SELECT 1 FROM subjects WHERE id = ?').bind(subject).first())) throw new HttpError(400, 'invalid-argument', 'Unknown subject');
  const levels = Array.isArray(i.levels) ? [...new Set(i.levels)] : [];
  if (levels.length !== 1 || !LEVEL_IDS.has(levels[0])) throw new HttpError(400, 'invalid-argument', 'Choose one valid learning language');
  const existing = await env.DB.prepare('SELECT cover_image, cover_ratio FROM books WHERE id = ?').bind(id).first();
  const parsedImage = validateCoverImage(i.cover_image);
  const parsedRatio = validateCoverRatio(i.cover_ratio);
  const coverImage = parsedImage !== undefined ? parsedImage : (existing?.cover_image ?? null);
  const coverRatio = parsedRatio !== undefined ? parsedRatio : (existing?.cover_ratio ?? null);
  const t = now();
  const cover = Array.isArray(i.cover) ? i.cover : [];
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO books (id, title, subject_id, edition, author, cover_c1, cover_c2, cover_image, cover_ratio, featured_rank, sort, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, subject_id = excluded.subject_id, edition = excluded.edition, author = excluded.author, cover_c1 = excluded.cover_c1,
      cover_c2 = excluded.cover_c2, cover_image = excluded.cover_image, cover_ratio = excluded.cover_ratio, featured_rank = excluded.featured_rank, sort = excluded.sort, status = excluded.status, updated_at = excluded.updated_at`)
      .bind(id, str(i.title, { min: 2, max: 120, field: 'Title' }), subject, str(i.edition ?? '', { max: 60, field: 'Edition' }), str(i.author ?? '', { max: 120, field: 'Author' }),
        color(cover[0], '#2b2fd1'), color(cover[1], '#7a3ff0'), coverImage, coverRatio, num(i.featured_rank, 'Featured rank', 1, 1000), num(i.sort, 'Order', 0, 100000, 0), status(i.status), t, t),
    env.DB.prepare('DELETE FROM book_levels WHERE book_id = ?').bind(id),
    ...levels.map((l) => env.DB.prepare('INSERT INTO book_levels (book_id, level_id) VALUES (?, ?)').bind(id, l)),
  ]);
  await audit(env, ctx, 'book.save', id, { status: i.status });
  return { id };
}

async function patchBookCover(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Book');
  const existing = await env.DB.prepare('SELECT id, cover_image, cover_ratio FROM books WHERE id = ?').bind(id).first();
  if (!existing) throw new HttpError(404, 'not-found', 'Book not found');
  const parsedImage = validateCoverImage(i.cover_image);
  const parsedRatio = validateCoverRatio(i.cover_ratio);
  const coverImage = parsedImage !== undefined ? parsedImage : existing.cover_image;
  const coverRatio = parsedRatio !== undefined ? parsedRatio : existing.cover_ratio;
  await env.DB.prepare('UPDATE books SET cover_image = ?, cover_ratio = ?, updated_at = ? WHERE id = ?')
    .bind(coverImage, coverRatio, now(), id).run();
  await audit(env, ctx, 'book.cover', id, { hasImage: !!coverImage, coverRatio });
  return { id, cover_image: coverImage, cover_ratio: coverRatio };
}

async function putChapter(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Chapter');
  const bookId = slug(i.book_id, 'Book');
  if (!(await env.DB.prepare('SELECT 1 FROM books WHERE id = ?').bind(bookId).first())) throw new HttpError(400, 'invalid-argument', 'Unknown book');
  const n = num(i.number, 'Chapter number', 0, 500, 1);
  await env.DB.prepare(`INSERT INTO chapters (id, book_id, number, title, sort, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, number = excluded.number, title = excluded.title, sort = excluded.sort, status = excluded.status, updated_at = excluded.updated_at`)
    .bind(id, bookId, n, str(i.title, { min: 1, max: 200, field: 'Title' }), num(i.sort, 'Order', 0, 100000, n), status(i.status), now()).run();
  await audit(env, ctx, 'chapter.save', id);
  return { id };
}

async function putNotes(env, ctx, chapterId, i) {
  requireRole(ctx.user, 'teacher');
  if (!(await env.DB.prepare('SELECT 1 FROM chapters WHERE id = ?').bind(chapterId).first())) throw new HttpError(404, 'not-found', 'Chapter not found');
  if (!Array.isArray(i.sections) || !i.sections.length || i.sections.length > 60) throw new HttpError(400, 'invalid-argument', 'Notes need 1–60 sections');
  const sections = i.sections.map((s, k) => ({
    heading: str(s.heading, { min: 1, max: 200, field: `Section ${k + 1} heading` }),
    page: num(s.page, `Section ${k + 1} page`, 1, 5000, null),
    text: str(s.text, { min: 1, max: 20000, field: `Section ${k + 1} text` }),
    terms: (Array.isArray(s.terms) ? s.terms : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 30).map((x) => x.slice(0, 60)),
  }));
  const latest = (await env.DB.prepare('SELECT MAX(version) v FROM note_versions WHERE chapter_id = ?').bind(chapterId).first())?.v || 0;
  const v = latest + 1;
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO note_versions (chapter_id, version, sections_json, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(chapterId, v, JSON.stringify(sections), ctx.user.uid, t),
    env.DB.prepare('INSERT INTO notes (chapter_id, current_version, updated_at) VALUES (?, ?, ?) ON CONFLICT(chapter_id) DO UPDATE SET current_version = excluded.current_version, updated_at = excluded.updated_at').bind(chapterId, v, t),
  ]);
  await audit(env, ctx, 'notes.save', chapterId, { version: v });
  return { chapterId, version: v };
}

async function getNotes(env, ctx, chapterId) {
  requireRole(ctx.user, 'teacher');
  const n = await env.DB.prepare('SELECT current_version FROM notes WHERE chapter_id = ?').bind(chapterId).first();
  const versions = (await env.DB.prepare('SELECT version, sections_json, created_by, created_at FROM note_versions WHERE chapter_id = ? ORDER BY version DESC LIMIT 50').bind(chapterId).all()).results;
  return { chapterId, current: n?.current_version ?? null, versions: versions.map((v) => ({ version: v.version, sections: JSON.parse(v.sections_json), createdBy: v.created_by, createdAt: v.created_at })) };
}

async function rollback(env, ctx, table, keyCol, id, version) {
  requireRole(ctx.user, 'teacher');
  const vt = { notes: ['note_versions', 'chapter_id'], resources: ['resource_versions', 'resource_id'], questions: ['question_versions', 'question_id'] }[table];
  const v = num(version, 'Version', 1, 1e6);
  if (!(await env.DB.prepare(`SELECT 1 FROM ${vt[0]} WHERE ${vt[1]} = ? AND version = ?`).bind(id, v).first())) throw new HttpError(404, 'not-found', 'Version not found');
  await env.DB.prepare(`UPDATE ${table} SET current_version = ? WHERE ${keyCol} = ?`).bind(v, id).run();
  await audit(env, ctx, `${table}.rollback`, id, { version: v });
  return { id, current: v };
}

async function putResource(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Resource');
  const chapterId = slug(i.chapter_id, 'Chapter');
  if (!(await env.DB.prepare('SELECT 1 FROM chapters WHERE id = ?').bind(chapterId).first())) throw new HttpError(400, 'invalid-argument', 'Unknown chapter');
  if (!RES_TYPES.has(i.type)) throw new HttpError(400, 'invalid-argument', 'Type must be video, pdf, ppt or link');
  const rawUrl = typeof i.url === 'string' ? i.url.trim() : '';
  if (i.type === 'link' && !rawUrl) throw new HttpError(400, 'invalid-argument', 'Link is required when type is link');
  const url = rawUrl ? httpsUrl(rawUrl) : null;
  const t = now();
  const old = await env.DB.prepare('SELECT * FROM resources WHERE id = ?').bind(id).first();
  const title = str(i.title ?? '', { max: 200, field: 'Title' });
  const pre = [];
  const stmts = [];
  let version = old?.current_version || 1;
  let videoAsset = null;
  if (i.type === 'video' && url) {
    videoAsset = old?.video_asset_id || `va-${id}`;
    const provider = /youtu\.?be/.test(url) ? 'youtube' : /drive\.google\.com/.test(url) ? 'drive' : 'url';
    pre.push(env.DB.prepare(`INSERT INTO video_assets (id, provider, url, duration_sec, title, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, url = excluded.url, duration_sec = excluded.duration_sec, title = excluded.title`).bind(videoAsset, provider, url, num(i.duration_sec, 'Duration', 1, 86400), title, t));
  }
  const curUrl = old ? (await env.DB.prepare('SELECT url FROM resource_versions WHERE resource_id = ? AND version = ?').bind(id, old.current_version).first())?.url : null;
  if (url && (!old || curUrl !== url)) {
    version = ((await env.DB.prepare('SELECT MAX(version) v FROM resource_versions WHERE resource_id = ?').bind(id).first())?.v || 0) + 1;
    stmts.push(env.DB.prepare('INSERT INTO resource_versions (resource_id, version, url, change_note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, version, url, str(i.change_note ?? '', { max: 300, field: 'Change note' }), ctx.user.uid, t));
  }
  const res = (env.DB.prepare(`INSERT INTO resources (id, chapter_id, type, title, sort, video_asset_id, current_version, pages, licence, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET chapter_id = excluded.chapter_id, type = excluded.type, title = excluded.title, sort = excluded.sort, video_asset_id = excluded.video_asset_id,
    current_version = excluded.current_version, pages = excluded.pages, licence = excluded.licence, status = excluded.status, updated_at = excluded.updated_at`)
    .bind(id, chapterId, i.type, title, num(i.sort, 'Order', 0, 100000, 0), videoAsset, version, num(i.pages, 'Pages', 1, 10000), str(i.licence ?? '', { max: 200, field: 'Licence' }), status(i.status), t));
  // Order matters for foreign keys: video asset → resource → resource version.
  await env.DB.batch([...pre, res, ...stmts]);
  if ((i.type === 'pdf' || i.type === 'ppt') && url) {
    const thumb = driveThumbFromUrl(url);
    if (thumb) {
      const book = await env.DB.prepare('SELECT b.id, b.cover_image FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.id = ?').bind(chapterId).first();
      if (book && !book.cover_image) {
        await env.DB.prepare('UPDATE books SET cover_image = ?, cover_ratio = COALESCE(cover_ratio, ?), updated_at = ? WHERE id = ?')
          .bind(thumb, i.type === 'ppt' ? 1.7778 : 0.7071, t, book.id).run();
      }
    }
  }
  await audit(env, ctx, 'resource.save', id, { version });
  return { id, version };
}

async function listQuestions(env, ctx, url) {
  requireRole(ctx.user, 'teacher');
  const chapter = url.searchParams.get('chapter');
  if (!chapter) throw new HttpError(400, 'invalid-argument', 'chapter is required');
  const rows = (await env.DB.prepare(`SELECT q.id, q.chapter_id, q.type, q.difficulty, q.xp_points, q.status, q.current_version, v.text, v.options_json, v.answer, v.explanation
    FROM questions q JOIN question_versions v ON v.question_id = q.id AND v.version = q.current_version WHERE q.chapter_id = ? ORDER BY q.created_at`).bind(chapter).all()).results;
  return { questions: rows.map((q) => ({ ...q, options: JSON.parse(q.options_json), options_json: undefined })) };
}

async function putQuestion(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Question');
  const chapterId = slug(i.chapter_id, 'Chapter');
  if (!(await env.DB.prepare('SELECT 1 FROM chapters WHERE id = ?').bind(chapterId).first())) throw new HttpError(400, 'invalid-argument', 'Unknown chapter');
  const options = Array.isArray(i.options) ? i.options.map((o, k) => str(o, { min: 1, max: 300, field: `Option ${k + 1}` })) : [];
  if (options.length < 2 || options.length > 6) throw new HttpError(400, 'invalid-argument', 'A question needs 2–6 options');
  const answer = num(i.answer, 'Correct option', 0, options.length - 1);
  if (answer == null) throw new HttpError(400, 'invalid-argument', 'Choose the correct option');
  const xpPoints = num(i.xp_points, 'XP points', 0, 1000, null);
  const t = now();
  const latest = (await env.DB.prepare('SELECT MAX(version) v FROM question_versions WHERE question_id = ?').bind(id).first())?.v || 0;
  const v = latest + 1;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO questions (id, chapter_id, type, difficulty, xp_points, current_version, status, created_at) VALUES (?, ?, 'mcq', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET chapter_id = excluded.chapter_id, difficulty = excluded.difficulty, xp_points = excluded.xp_points, current_version = excluded.current_version, status = excluded.status`)
      .bind(id, chapterId, num(i.difficulty, 'Difficulty', 1, 5, 2), xpPoints, v, status(i.status), t),
    env.DB.prepare('INSERT INTO question_versions (question_id, version, text, options_json, answer, explanation, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, v, str(i.text, { min: 3, max: 2000, field: 'Question' }), JSON.stringify(options), answer, str(i.explanation ?? '', { max: 2000, field: 'Explanation' }), ctx.user.uid, t),
  ]);
  await audit(env, ctx, 'question.save', id, { version: v, xpPoints });
  return { id, version: v };
}

async function putExam(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Exam');
  if (!['chapter_quiz', 'model'].includes(i.type)) throw new HttpError(400, 'invalid-argument', 'Type must be chapter_quiz or model');
  const bookId = i.type === 'model' ? slug(i.book_id, 'Book') : null;
  const chapterId = i.type === 'chapter_quiz' ? slug(i.chapter_id, 'Chapter') : null;
  if (bookId && !(await env.DB.prepare('SELECT 1 FROM books WHERE id = ?').bind(bookId).first())) throw new HttpError(400, 'invalid-argument', 'Unknown book');
  if (chapterId && !(await env.DB.prepare('SELECT 1 FROM chapters WHERE id = ?').bind(chapterId).first())) throw new HttpError(400, 'invalid-argument', 'Unknown chapter');
  let examLevelId = null;
  if (i.level_id != null && i.level_id !== '') {
    if (!LEVEL_IDS.has(i.level_id)) throw new HttpError(400, 'invalid-argument', 'Unknown learning language');
    examLevelId = i.level_id;
  }
  const timeZone = typeof i.time_zone === 'string' && i.time_zone.trim()
    ? str(i.time_zone.trim(), { min: 1, max: 64, field: 'Time zone' })
    : null;
  const opens = num(i.opens_at, 'Opens at', 0, 9e15);
  const closes = num(i.closes_at, 'Closes at', 0, 9e15);
  if (opens && closes && closes <= opens) throw new HttpError(400, 'invalid-argument', 'Closing time must be after opening time');
  const xpReward = num(i.xp_reward, 'XP reward', 0, 10000, null);
  await env.DB.prepare(`INSERT INTO exams (id, title, type, book_id, chapter_id, level_id, time_zone, duration_sec, question_count, pass_pct, xp_reward, status, opens_at, closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, type = excluded.type, book_id = excluded.book_id, chapter_id = excluded.chapter_id, level_id = excluded.level_id, time_zone = excluded.time_zone, duration_sec = excluded.duration_sec,
    question_count = excluded.question_count, pass_pct = excluded.pass_pct, xp_reward = excluded.xp_reward, status = excluded.status, opens_at = excluded.opens_at, closes_at = excluded.closes_at`)
    .bind(id, str(i.title, { min: 2, max: 120, field: 'Title' }), i.type, bookId, chapterId, examLevelId, timeZone, num(i.duration_sec, 'Duration', 60, 6 * 3600, 600), num(i.question_count, 'Question count', 1, 200, 10),
      num(i.pass_pct, 'Pass mark', 1, 100, 60), xpReward, status(i.status), opens, closes, now()).run();
  await audit(env, ctx, 'exam.save', id, { xpReward, level_id: examLevelId, time_zone: timeZone });
  return { id };
}

async function postAnnouncement(env, ctx, i) {
  requireRole(ctx.user, 'admin');
  const id = `an_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const expiresAt = num(i.expires_at, 'Expires at', 0, 9e15, null);
  await env.DB.prepare('INSERT INTO announcements (id, title, body, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, str(i.title, { min: 2, max: 120, field: 'Title' }), str(i.body, { min: 1, max: 2000, field: 'Message' }), expiresAt, ctx.user.uid, now()).run();
  await audit(env, ctx, 'announcement.create', id, { expiresAt });
  return { id };
}

async function postBroadcastNotification(env, ctx, i) {
  requireRole(ctx.user, 'admin');
  const title = str(i.title, { min: 2, max: 120, field: 'Title' });
  const message = str(i.body ?? '', { max: 500, field: 'Message' });
  const levelId = i.level_id && LEVEL_IDS.has(i.level_id) ? i.level_id : null;
  if (i.level_id && !levelId) throw new HttpError(400, 'invalid-argument', 'Unknown learning language');
  const users = (
    await env.DB.prepare(`SELECT uid FROM users WHERE uid != 'deleted' AND blocked = 0 ${levelId ? 'AND level_id = ?' : ''}`)
      .bind(...(levelId ? [levelId] : []))
      .all()
  ).results;
  const t = now();
  for (let idx = 0; idx < users.length; idx += 100) {
    const chunk = users.slice(idx, idx + 100);
    await env.DB.batch(
      chunk.map((u) =>
        env.DB.prepare('INSERT INTO notifications (id, uid, title, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(`nt_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`, u.uid, title, message, t)
      )
    );
  }
  await audit(env, ctx, 'notification.broadcast', levelId || 'all', { count: users.length });
  return { sent: users.length };
}

async function deleteAnnouncement(env, ctx, id) {
  requireRole(ctx.user, 'admin');
  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  await audit(env, ctx, 'announcement.delete', id);
  return { deleted: true };
}

async function listDictionary(env, ctx) {
  requireRole(ctx.user, 'teacher');
  const rows = (await env.DB.prepare('SELECT * FROM dictionary_entries ORDER BY updated_at DESC, word ASC LIMIT 300').all()).results;
  return { entries: rows };
}

async function putDictionary(env, ctx, id, i) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Dictionary entry');
  const language = toDbLang(i.language);
  if (!language) throw new HttpError(400, 'invalid-argument', 'Language must be zh, en, or bn');
  const word = str(i.word, { min: 1, max: 120, field: 'Word' });
  const phonetic = str(i.phonetic ?? '', { max: 120, field: 'Phonetic' });
  const phoneticPlain = stripPinyinTones(phonetic);
  const t = now();
  await env.DB.prepare(`INSERT INTO dictionary_entries
    (id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      language = excluded.language, word = excluded.word, phonetic = excluded.phonetic, phonetic_plain = excluded.phonetic_plain,
      part_of_speech = excluded.part_of_speech, meaning_en = excluded.meaning_en, meaning_bn = excluded.meaning_bn, meaning_zh = excluded.meaning_zh,
      example = excluded.example, example_translation = excluded.example_translation, hsk_level = excluded.hsk_level,
      status = excluded.status, updated_at = excluded.updated_at`)
    .bind(
      id, language, word, phonetic, phoneticPlain,
      str(i.part_of_speech ?? '', { max: 40, field: 'Part of speech' }),
      str(i.meaning_en ?? '', { max: 400, field: 'English meaning' }),
      str(i.meaning_bn ?? '', { max: 400, field: 'Bengali meaning' }),
      str(i.meaning_zh ?? '', { max: 400, field: 'Chinese meaning' }),
      str(i.example ?? '', { max: 500, field: 'Example' }),
      str(i.example_translation ?? '', { max: 500, field: 'Example translation' }),
      str(i.hsk_level ?? '', { max: 20, field: 'HSK level' }),
      status(i.status), ctx.user.uid, t, t
    ).run();
  await audit(env, ctx, 'dictionary.save', id, { language, word });
  return { id };
}

async function deleteDictionary(env, ctx, id) {
  requireRole(ctx.user, 'teacher');
  slug(id, 'Dictionary entry');
  await env.DB.prepare('DELETE FROM dictionary_entries WHERE id = ?').bind(id).run();
  await audit(env, ctx, 'dictionary.delete', id);
  return { deleted: true };
}

function isPublicHttpsUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.arpa')) return null;
  if (host.startsWith('[') || host.includes(':')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (!host.includes('.')) return null;
  return u;
}

async function fetchPreview(env, ctx, url) {
  requireRole(ctx.user, 'teacher');
  const raw = (url.searchParams.get('url') || '').trim();
  const target = isPublicHttpsUrl(raw);
  if (!target) throw new HttpError(400, 'invalid-argument', 'Valid public https:// URL required');
  let upstream;
  try {
    upstream = await fetch(target.href, { redirect: 'follow' });
  } catch {
    throw new HttpError(502, 'bad-gateway', 'Could not reach file URL');
  }
  if (!upstream.ok) throw new HttpError(502, 'bad-gateway', `File host returned HTTP ${upstream.status}`);
  const cl = Number(upstream.headers.get('content-length') || 0);
  if (cl > MAX_PREVIEW_BYTES) throw new HttpError(413, 'payload-too-large', 'File is larger than 15 MB preview limit');
  const reader = upstream.body?.getReader();
  if (!reader) throw new HttpError(502, 'bad-gateway', 'Empty upstream response');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PREVIEW_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'payload-too-large', 'File is larger than 15 MB preview limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}

async function stats(env, ctx) {
  requireRole(ctx.user, 'moderator');
  const t = now();
  const [users, active1, active7, newUsers, study, attempts, posts, reports, books] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) n FROM users WHERE uid != 'deleted'"),
    env.DB.prepare('SELECT COUNT(*) n FROM users WHERE last_seen_at >= ?').bind(t - 86400_000),
    env.DB.prepare('SELECT COUNT(*) n FROM users WHERE last_seen_at >= ?').bind(t - 7 * 86400_000),
    env.DB.prepare('SELECT COUNT(*) n FROM users WHERE created_at >= ?').bind(t - 7 * 86400_000),
    env.DB.prepare('SELECT COALESCE(SUM(accepted_sec), 0) n FROM study_events WHERE received_at >= ?').bind(t - 7 * 86400_000),
    env.DB.prepare("SELECT COUNT(*) n FROM attempts WHERE status = 'graded' AND submitted_at >= ?").bind(t - 7 * 86400_000),
    env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE created_at >= ?').bind(t - 7 * 86400_000),
    env.DB.prepare("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
    env.DB.prepare("SELECT COUNT(*) n FROM books WHERE status = 'published'"),
  ]);
  const n = (r) => r.results[0].n;
  return { users: n(users), active1d: n(active1), active7d: n(active7), new7d: n(newUsers), studyHours7d: Math.round(n(study) / 360) / 10, exams7d: n(attempts), posts7d: n(posts), openReports: n(reports), publishedBooks: n(books) };
}

export async function routeAdmin(req, env, ctx, url) {
  const path = url.pathname;
  const m = req.method;
  let mm;
  if (path === '/v1/admin/content' && m === 'GET') { requireRole(ctx.user, 'teacher'); return json(await content(env)); }
  if (path === '/v1/admin/stats' && m === 'GET') return json(await stats(env, ctx));
  if ((mm = path.match(/^\/v1\/admin\/subjects\/([^/]+)$/)) && m === 'PUT') return json(await putSubject(env, ctx, mm[1], await body(req, 5000)));
  if ((mm = path.match(/^\/v1\/admin\/books\/([^/]+)\/cover$/)) && m === 'PATCH') return json(await patchBookCover(env, ctx, mm[1], await body(req, 300_000)));
  if ((mm = path.match(/^\/v1\/admin\/books\/([^/]+)$/)) && m === 'PUT') return json(await putBook(env, ctx, mm[1], await body(req, 300_000)));
  if ((mm = path.match(/^\/v1\/admin\/chapters\/([^/]+)$/)) && m === 'PUT') return json(await putChapter(env, ctx, mm[1], await body(req, 10_000)));
  if ((mm = path.match(/^\/v1\/admin\/notes\/([\w.-]{1,64})$/)) && m === 'GET') return json(await getNotes(env, ctx, mm[1]));
  if ((mm = path.match(/^\/v1\/admin\/notes\/([\w.-]{1,64})$/)) && m === 'PUT') return json(await putNotes(env, ctx, mm[1], await body(req, 600_000)));
  if ((mm = path.match(/^\/v1\/admin\/(notes|resources|questions)\/([\w.-]{1,64})\/rollback$/)) && m === 'POST') {
    const key = { notes: 'chapter_id', resources: 'id', questions: 'id' }[mm[1]];
    return json(await rollback(env, ctx, mm[1], key, mm[2], (await body(req, 1000)).version));
  }
  if ((mm = path.match(/^\/v1\/admin\/resources\/([^/]+)$/)) && m === 'PUT') return json(await putResource(env, ctx, mm[1], await body(req, 10_000)));
  if (path === '/v1/admin/questions' && m === 'GET') return json(await listQuestions(env, ctx, url));
  if ((mm = path.match(/^\/v1\/admin\/questions\/([^/]+)$/)) && m === 'PUT') return json(await putQuestion(env, ctx, mm[1], await body(req, 20_000)));
  if ((mm = path.match(/^\/v1\/admin\/exams\/([^/]+)$/)) && m === 'PUT') return json(await putExam(env, ctx, mm[1], await body(req, 5000)));
  if (path === '/v1/admin/dictionary' && m === 'GET') return json(await listDictionary(env, ctx));
  if ((mm = path.match(/^\/v1\/admin\/dictionary\/([^/]+)$/)) && m === 'PUT') return json(await putDictionary(env, ctx, mm[1], await body(req, 10_000)));
  if ((mm = path.match(/^\/v1\/admin\/dictionary\/([^/]+)$/)) && m === 'DELETE') return json(await deleteDictionary(env, ctx, mm[1]));
  if (path === '/v1/admin/fetch-preview' && m === 'GET') return fetchPreview(env, ctx, url);
  if (path === '/v1/admin/announcements' && m === 'POST') return json(await postAnnouncement(env, ctx, await body(req, 5000)));
  if ((mm = path.match(/^\/v1\/admin\/announcements\/([\w-]{1,64})$/)) && m === 'DELETE') return json(await deleteAnnouncement(env, ctx, mm[1]));
  if (path === '/v1/admin/notifications' && m === 'POST') return json(await postBroadcastNotification(env, ctx, await body(req, 5000)));
  if ((mm = path.match(/^\/v1\/admin\/manifest\/([^/]+)$/)) && m === 'PUT') {
    requireRole(ctx.user, 'admin');
    const id = slug(mm[1], 'Manifest');
    const i = await body(req, 10_000);
    const ver = str(i.version, { min: 1, max: 40, field: 'Version' });
    const link = httpsUrl(i.url, 'Download URL');
    const sha = str(i.sha256, { min: 64, max: 64, field: 'SHA-256' }).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) throw new HttpError(400, 'invalid-argument', 'SHA-256 must be 64 hex characters');
    const size = num(i.sizeBytes ?? 0, 'Size bytes', 0, 5_000_000_000, 0);
    await env.DB.prepare(`INSERT INTO resource_manifest (id, version, url, size_bytes, sha256, required, platform_min_version, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, url = excluded.url, size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256, required = excluded.required, platform_min_version = excluded.platform_min_version,
      metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`)
      .bind(id, ver, link, size, sha, i.required ? 1 : 0, str(i.platformMinVersion ?? '1.0.0', { max: 20, field: 'Min version' }), JSON.stringify(i.metadata ?? {}), now()).run();
    await audit(env, ctx, 'manifest.save', id, { version: ver });
    return json({ id, version: ver });
  }
  return null;
}
