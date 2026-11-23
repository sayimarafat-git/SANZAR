/**
 * Sanzar API — Cloudflare Worker.
 *
 * Bindings (wrangler.toml / dashboard):
 *   DB                   D1 database
 *   FIREBASE_PROJECT_ID  Firebase project whose ID tokens are accepted
 *   SUPER_ADMIN_EMAILS   comma-separated verified emails promoted to super_admin
 *   ALLOWED_ORIGINS      comma-separated CORS origins
 *   APP_ENV              dev | staging | production
 *
 * Security model: every request except /v1/health and /v1/public/* needs a
 * valid Firebase ID token. Roles are stored server-side in users.role and
 * checked here — the client can never grant itself permissions.
 */
import { MIGRATIONS } from './schema.js';
import { routeFeatures, serveCommunityMedia } from './features.js';
import { routeAdmin } from './admin.js';

const ROLE_RANK = { student: 0, moderator: 1, content_admin: 2, admin: 3, super_admin: 4 };
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const RATE = { default: [120, 60], write: [30, 60], admin: [300, 60] }; // [requests, seconds]

/* ============================== utilities ============================== */
export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const now = () => Date.now();
export const newId = (p) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export function str(v, { max = 200, min = 0, field = 'value' } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, 'invalid-argument', `${field} must be text`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw new HttpError(400, 'invalid-argument', `${field} must be ${min}–${max} characters`);
  return t;
}
export async function body(req, maxBytes = 1_000_000) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'payload-too-large', 'Request body is too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload-too-large', 'Request body is too large');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'invalid-argument', 'Body must be JSON'); }
}

/** Splits migration SQL into single statements (D1 batch runs one statement per prepare). */
export function splitSql(sql) {
  return sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

/* ============================== auth ============================== */
let jwkCache = { keys: null, exp: 0 };
async function getJwks(fetcher) {
  if (jwkCache.keys && jwkCache.exp > now()) return jwkCache.keys;
  const res = await fetcher(JWK_URL);
  if (!res.ok) throw new HttpError(503, 'unavailable', 'Could not load sign-in keys');
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  const { keys } = await res.json();
  jwkCache = { keys, exp: now() + Math.min(maxAge, 21600) * 1000 };
  return keys;
}
export function _resetJwkCache() { jwkCache = { keys: null, exp: 0 }; }

/** Verifies a Firebase Authentication ID token (RS256) per Firebase's documented rules. */
export async function verifyFirebaseToken(token, projectId, { fetcher = fetch, nowSec = Math.floor(now() / 1000) } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'unauthenticated', 'Missing or malformed token');
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { throw new HttpError(401, 'unauthenticated', 'Malformed token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'unauthenticated', 'Unsupported token');
  const keys = await getJwks(fetcher);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { _resetJwkCache(); throw new HttpError(401, 'unauthenticated', 'Unknown signing key'); }
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, 'unauthenticated', 'Invalid token signature');
  const skew = 300;
  if (payload.aud !== projectId) throw new HttpError(401, 'unauthenticated', 'Token is for another project');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new HttpError(401, 'unauthenticated', 'Wrong token issuer');
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) throw new HttpError(401, 'unauthenticated', 'Invalid subject');
  if (typeof payload.exp !== 'number' || payload.exp + skew < nowSec) throw new HttpError(401, 'unauthenticated', 'Token expired');
  if (typeof payload.iat !== 'number' || payload.iat - skew > nowSec) throw new HttpError(401, 'unauthenticated', 'Token issued in the future');
  if (typeof payload.auth_time === 'number' && payload.auth_time - skew > nowSec) throw new HttpError(401, 'unauthenticated', 'Invalid auth time');
  return { uid: payload.sub, email: payload.email || null, emailVerified: payload.email_verified === true, name: payload.name || null, picture: payload.picture || null };
}

/** Loads or creates the user row; promotes configured owner emails to super_admin. */
async function loadUser(env, claims) {
  const t = now();
  let u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(claims.uid).first();
  if (claims.email && (!u || claims.email.toLowerCase() !== String(u.email || '').toLowerCase())) {
    const duplicate = await env.DB.prepare(
      'SELECT uid FROM users WHERE lower(email) = lower(?) AND uid != ? LIMIT 1',
    ).bind(claims.email, claims.uid).first();
    if (duplicate) throw new HttpError(409, 'email-already-in-use', 'An account already exists for this email');
  }
  const owners = String(env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const isOwner = claims.emailVerified && claims.email && owners.includes(claims.email.toLowerCase());
  if (!u) {
    await env.DB.prepare(`INSERT INTO users (uid, email, email_verified, display_name, photo_url, role, profile_visibility, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, 'private', ?, ?, ?)`).bind(claims.uid, claims.email, claims.emailVerified ? 1 : 0,
      (claims.name || (claims.email || 'Student').split('@')[0]).slice(0, 60), claims.picture, isOwner ? 'super_admin' : 'student', t, t, t).run();
    u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(claims.uid).first();
  } else {
    const patch = [];
    if (isOwner && u.role !== 'super_admin') patch.push(['role', 'super_admin']);
    if ((u.email_verified ? 1 : 0) !== (claims.emailVerified ? 1 : 0)) patch.push(['email_verified', claims.emailVerified ? 1 : 0]);
    if (claims.email && claims.email !== u.email) patch.push(['email', claims.email]);
    if (!u.last_seen_at || t - u.last_seen_at > 5 * 60_000) patch.push(['last_seen_at', t]);
    if (patch.length) {
      await env.DB.prepare(`UPDATE users SET ${patch.map(([k]) => `${k} = ?`).join(', ')} WHERE uid = ?`).bind(...patch.map(([, v]) => v), u.uid).run();
      for (const [k, v] of patch) u[k] = v;
    }
  }
  return u;
}

export function requireRole(user, role) {
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  if ((ROLE_RANK[user.role] ?? -1) < ROLE_RANK[role]) throw new HttpError(403, 'permission-denied', 'You do not have permission for this action');
}

/* ============================== rate limiting ============================== */
export async function rateLimit(env, key, [limit, windowSec]) {
  const t = now();
  const windowStart = Math.floor(t / (windowSec * 1000)) * windowSec * 1000;
  const row = await env.DB.prepare(`INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING count`).bind(key, windowStart).first();
  if (row && row.count > limit) {
    const retry = Math.ceil((windowStart + windowSec * 1000 - t) / 1000);
    const e = new HttpError(429, 'resource-exhausted', 'Too many requests. Please slow down.');
    e.retryAfter = retry;
    throw e;
  }
}

/* ============================== audit ============================== */
export async function audit(env, ctx, action, target, detail = {}) {
  await env.DB.prepare(`INSERT INTO audit_logs (id, actor_uid, actor_email, actor_role, action, target, detail_json, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId('al'), ctx.user?.uid || null, ctx.user?.email || null, ctx.user?.role || null,
    action, String(target || '').slice(0, 300), JSON.stringify(detail).slice(0, 4000), ctx.ip, now()).run();
}

/* ============================== migrations ============================== */
export async function migrate(env) {
  const applied = new Set();
  try {
    const r = await env.DB.prepare('SELECT id FROM schema_migrations').all();
    r.results.forEach((x) => applied.add(x.id));
  } catch { /* table does not exist yet */ }
  const done = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const stmts = splitSql(m.sql).map((s) => env.DB.prepare(s));
    stmts.push(env.DB.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').bind(m.id, now()));
    await env.DB.batch(stmts);
    done.push(m.id);
  }
  return { applied: done, total: MIGRATIONS.length };
}

/* ============================== handlers ============================== */
const PROFILE_FIELDS = ['uid', 'email', 'email_verified', 'display_name', 'photo_url', 'level_id', 'grp', 'institution', 'locale', 'role', 'blocked', 'profile_visibility', 'created_at'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const LEVELS = new Set(['zh', 'en']);
const LOCALES = new Set(['bn', 'en', 'zh']);

export async function getConfig(env) {
  const rows = (await env.DB.prepare('SELECT key, value_json FROM config').all()).results;
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json)]));
}

/** Full catalog in one response, with an ETag so unchanged catalogs cost one tiny request. */
async function catalog(env, req) {
  const [levels, subjects, books, bookLevels, chapters, resources, versions, videos, notes, questions, exams, ann, cfg] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM levels ORDER BY sort'),
    env.DB.prepare('SELECT * FROM subjects ORDER BY sort'),
    env.DB.prepare("SELECT * FROM books WHERE status = 'published' ORDER BY sort"),
    env.DB.prepare('SELECT * FROM book_levels'),
    env.DB.prepare("SELECT c.* FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.status = 'published' AND b.status = 'published' ORDER BY c.book_id, c.sort, c.number"),
    env.DB.prepare("SELECT * FROM resources WHERE status = 'published' ORDER BY chapter_id, sort"),
    env.DB.prepare('SELECT rv.resource_id, rv.url FROM resource_versions rv JOIN resources r ON r.id = rv.resource_id AND r.current_version = rv.version'),
    env.DB.prepare('SELECT * FROM video_assets'),
    env.DB.prepare('SELECT n.chapter_id, nv.sections_json FROM notes n JOIN note_versions nv ON nv.chapter_id = n.chapter_id AND nv.version = n.current_version'),
    env.DB.prepare("SELECT chapter_id, COUNT(*) AS n FROM questions WHERE status = 'published' GROUP BY chapter_id"),
    env.DB.prepare("SELECT id, title, type, book_id, chapter_id, duration_sec, question_count, pass_pct FROM exams WHERE status = 'published'"),
    env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 30'),
    env.DB.prepare('SELECT key, value_json FROM config'),
  ]);
  const url = Object.fromEntries(versions.results.map((v) => [v.resource_id, v.url]));
  const vids = Object.fromEntries(videos.results.map((v) => [v.id, v]));
  const qCount = Object.fromEntries(questions.results.map((q) => [q.chapter_id, q.n]));
  const notesBy = Object.fromEntries(notes.results.map((n) => [n.chapter_id, JSON.parse(n.sections_json)]));
  const resBy = {};
  for (const r of resources.results) (resBy[r.chapter_id] ||= []).push({ id: r.id, type: r.type, title: r.title, pages: r.pages, url: r.video_asset_id ? vids[r.video_asset_id]?.url : url[r.id] || null, version: r.current_version });
  const chBy = {};
  for (const c of chapters.results) (chBy[c.book_id] ||= []).push({ id: c.id, number: c.number, title: c.title, resources: resBy[c.id] || [], hasNotes: !!notesBy[c.id], questionCount: qCount[c.id] || 0 });
  const lvBy = {};
  for (const bl of bookLevels.results) (lvBy[bl.book_id] ||= []).push(bl.level_id);
  const data = {
    levels: levels.results, subjects: subjects.results,
    books: books.results.map((b) => ({ id: b.id, title: b.title, subjectId: b.subject_id, edition: b.edition, author: b.author, cover: [b.cover_c1, b.cover_c2], featuredRank: b.featured_rank, levels: lvBy[b.id] || [], chapters: chBy[b.id] || [] })),
    notes: notesBy, exams: exams.results, announcements: ann.results,
    config: Object.fromEntries(cfg.results.map((r) => [r.key, JSON.parse(r.value_json)])),
  };
  const text = JSON.stringify(data);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const etag = `"${[...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
  return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'private, no-cache' } });
}

async function updateMe(env, ctx, input) {
  const sets = [];
  const vals = [];
  if ('display_name' in input) { sets.push('display_name = ?'); vals.push(str(input.display_name, { min: 2, max: 60, field: 'Name' })); }
  if ('institution' in input) { sets.push('institution = ?'); vals.push(str(input.institution, { max: 100, field: 'Institution' })); }
  if ('grp' in input) { sets.push('grp = ?'); vals.push(str(input.grp, { min: 2, max: 40, field: 'Group' })); }
  if ('level_id' in input) { if (!LEVELS.has(input.level_id)) throw new HttpError(400, 'invalid-argument', 'Unknown learning language'); sets.push('level_id = ?'); vals.push(input.level_id); }
  if ('locale' in input) { if (!LOCALES.has(input.locale)) throw new HttpError(400, 'invalid-argument', 'Unknown language'); sets.push('locale = ?'); vals.push(input.locale); }
  if ('profile_visibility' in input) { if (!['public', 'followers', 'private'].includes(input.profile_visibility)) throw new HttpError(400, 'invalid-argument', 'Unknown visibility'); sets.push('profile_visibility = ?'); vals.push(input.profile_visibility); }
  if ('photo_url' in input) {
    const p = input.photo_url;
    if (p !== null && !(typeof p === 'string' && /^https:\/\//.test(p) && p.length < 500)) throw new HttpError(400, 'invalid-argument', 'Photo must be an https link');
    sets.push('photo_url = ?'); vals.push(p);
  }
  if (!sets.length) throw new HttpError(400, 'invalid-argument', 'Nothing to update');
  sets.push('updated_at = ?'); vals.push(now());
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE uid = ?`).bind(...vals, ctx.user.uid).run();
  return pick(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(ctx.user.uid).first(), PROFILE_FIELDS);
}

/** Deletes personal data and removes attempts; authored posts remain anonymous. */
async function deleteMe(env, ctx) {
  const uid = ctx.user.uid;
  await env.DB.batch([
    env.DB.prepare("UPDATE posts SET author_name = 'Former member', author_uid = 'deleted' WHERE author_uid = ?").bind(uid),
    env.DB.prepare("UPDATE comments SET author_name = 'Former member', author_uid = 'deleted' WHERE author_uid = ?").bind(uid),
    ...['study_events', 'daily_stats', 'daily_subject_stats', 'completions', 'xp_ledger', 'achievements', 'notifications', 'post_likes', 'poll_votes', 'group_members', 'attempts']
      .map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE uid = ?`).bind(uid)),
    env.DB.prepare('DELETE FROM follows WHERE follower_uid = ? OR followee_uid = ?').bind(uid, uid),
    env.DB.prepare('DELETE FROM blocks WHERE uid = ? OR blocked_uid = ?').bind(uid, uid),
    env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(uid),
  ]);
  await audit(env, ctx, 'account.delete', uid);
  return { deleted: true };
}

async function setRole(env, ctx, uid, role) {
  requireRole(ctx.user, 'super_admin');
  if (!(role in ROLE_RANK)) throw new HttpError(400, 'invalid-argument', 'Unknown role');
  if (uid === ctx.user.uid && role !== 'super_admin') throw new HttpError(400, 'failed-precondition', 'You cannot remove your own super admin role');
  const r = await env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE uid = ?').bind(role, now(), uid).run();
  if (!r.meta?.changes) throw new HttpError(404, 'not-found', 'User not found');
  await audit(env, ctx, 'user.setRole', uid, { role });
  return { uid, role };
}

async function putConfig(env, ctx, key, value) {
  requireRole(ctx.user, 'admin');
  if (!/^[a-z][a-zA-Z0-9_.-]{1,40}$/.test(key)) throw new HttpError(400, 'invalid-argument', 'Invalid config key');
  const text = JSON.stringify(value);
  if (text.length > 50_000) throw new HttpError(413, 'payload-too-large', 'Config value too large');
  await env.DB.prepare(`INSERT INTO config (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(key, text, ctx.user.uid, now()).run();
  await audit(env, ctx, 'config.put', key);
  return { key, value };
}

async function listUsers(env, ctx, url) {
  requireRole(ctx.user, 'admin');
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
  const before = Number(url.searchParams.get('before')) || 9e15;
  const rows = q
    ? await env.DB.prepare("SELECT * FROM users WHERE uid != 'deleted' AND (lower(display_name) LIKE ? OR lower(email) LIKE ?) AND created_at < ? ORDER BY created_at DESC LIMIT ?").bind(`%${q}%`, `%${q}%`, before, limit).all()
    : await env.DB.prepare("SELECT * FROM users WHERE uid != 'deleted' AND created_at < ? ORDER BY created_at DESC LIMIT ?").bind(before, limit).all();
  return { users: rows.results.map((u) => pick(u, [...PROFILE_FIELDS, 'last_seen_at', 'email_verified'])) };
}

async function setBlocked(env, ctx, uid, blocked) {
  requireRole(ctx.user, 'admin');
  const target = await env.DB.prepare('SELECT role FROM users WHERE uid = ?').bind(uid).first();
  if (!target) throw new HttpError(404, 'not-found', 'User not found');
  if (ROLE_RANK[target.role] >= ROLE_RANK[ctx.user.role]) throw new HttpError(403, 'permission-denied', 'You cannot block an admin of equal or higher rank');
  await env.DB.prepare('UPDATE users SET blocked = ?, updated_at = ? WHERE uid = ?').bind(blocked ? 1 : 0, now(), uid).run();
  await audit(env, ctx, blocked ? 'user.block' : 'user.unblock', uid);
  return { uid, blocked: !!blocked };
}

async function auditList(env, ctx, url) {
  requireRole(ctx.user, 'admin');
  const before = Number(url.searchParams.get('before')) || 9e15;
  const r = await env.DB.prepare('SELECT * FROM audit_logs WHERE created_at < ? ORDER BY created_at DESC LIMIT 100').bind(before).all();
  return { entries: r.results };
}


/* ============================== router ============================== */
function cors(env, req) {
  const origin = req.headers.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type,if-none-match', 'access-control-expose-headers': 'etag', 'access-control-max-age': '600', vary: 'origin' };
}

export async function handle(req, env, opts = {}) {
  const url = new URL(req.url);
  const rawPath = url.pathname.replace(/\/+$/, '') || '/';
  const path = rawPath === '/api/v1' ? '/v1' : rawPath.startsWith('/api/v1/') ? rawPath.slice(4) : rawPath;
  const normUrl = new URL(url.toString());
  normUrl.pathname = path;
  const m = req.method;
  const ctx = { ip: req.headers.get('cf-connecting-ip') || null, user: null };

  if (path === '/v1/health' || path === '/health') {
    let schema = 'missing';
    try { const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM schema_migrations').first(); schema = `${r.n}/${MIGRATIONS.length}`; } catch { /* not migrated */ }
    return json({ ok: true, env: env.APP_ENV || 'unknown', schema, time: new Date().toISOString() });
  }

  if (path === '/v1/resources/manifest' && m === 'GET') {
    const [manifests, resRows] = await env.DB.batch([
      env.DB.prepare('SELECT id, version, url, size_bytes, sha256, required, platform_min_version, metadata_json, updated_at FROM resource_manifest ORDER BY id'),
      env.DB.prepare(`SELECT r.id, r.chapter_id, r.type, r.title, rv.version, rv.url, rv.checksum, rv.size_bytes
        FROM resources r JOIN resource_versions rv ON rv.resource_id = r.id AND rv.version = r.current_version
        WHERE r.status = 'published' AND rv.url IS NOT NULL ORDER BY r.chapter_id, r.sort`),
    ]);
    const items = [
      ...manifests.results.map((r) => ({
        id: r.id, version: r.version, url: r.url, sizeBytes: r.size_bytes, sha256: r.sha256,
        required: !!r.required, platformMinVersion: r.platform_min_version,
        metadata: JSON.parse(r.metadata_json || '{}'), updatedAt: r.updated_at,
      })),
      ...resRows.results.filter((r) => r.checksum).map((r) => ({
        id: r.id, version: String(r.version), url: r.url, sizeBytes: r.size_bytes || 0, sha256: r.checksum,
        required: false, type: r.type, title: r.title, chapterId: r.chapter_id,
      })),
    ];
    return json({ resources: items, serverTime: now() });
  }

  if (m === 'GET' && path.startsWith('/v1/media/')) {
    let key;
    try { key = decodeURIComponent(path.slice('/v1/media/'.length)); }
    catch { throw new HttpError(404, 'not-found', 'Media not found'); }
    return serveCommunityMedia(env, key);
  }

  // Everything else requires a signed-in user.
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  const claims = await verifyFirebaseToken(auth.slice(7), env.FIREBASE_PROJECT_ID, opts);

  // Bootstrap: before migrations exist, only owners may run /v1/admin/migrate.
  if (path === '/v1/admin/migrate' && m === 'POST') {
    const owners = String(env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim());
    if (!claims.emailVerified || !owners.includes(String(claims.email).toLowerCase())) throw new HttpError(403, 'permission-denied', 'Only the owner can run migrations');
    const res = await migrate(env);
    ctx.user = await loadUser(env, claims);
    await audit(env, ctx, 'schema.migrate', res.applied.join(',') || 'none');
    return json(res);
  }

  ctx.user = await loadUser(env, claims);
  const isWrite = m !== 'GET';
  const isAdminPath = path.startsWith('/v1/admin/');
  await rateLimit(env, `u:${ctx.user.uid}:${isAdminPath ? 'a' : isWrite ? 'w' : 'r'}`, isAdminPath ? RATE.admin : isWrite ? RATE.write : RATE.default);
  if (ctx.user.blocked && isWrite) throw new HttpError(403, 'permission-denied', 'Your account has been restricted by the admin');

  let mm;
  if ((path === '/v1/me' || path === '/v1/profile') && m === 'GET') return json({ user: pick(ctx.user, PROFILE_FIELDS) });
  if ((path === '/v1/me' || path === '/v1/profile') && m === 'PATCH') return json({ user: await updateMe(env, ctx, await body(req, 10_000)) });
  if (path === '/v1/me' && m === 'DELETE') return json(await deleteMe(env, ctx));
  if (path === '/v1/catalog' && m === 'GET') return catalog(env, req);
  if (path === '/v1/config' && m === 'GET') return json({ config: await getConfig(env) });

  // ----- admin -----
  if (path === '/v1/admin/users' && m === 'GET') return json(await listUsers(env, ctx, normUrl));
  if ((mm = path.match(/^\/v1\/admin\/users\/([\w-]{1,128})\/role$/)) && m === 'PUT') return json(await setRole(env, ctx, mm[1], (await body(req, 1000)).role));
  if ((mm = path.match(/^\/v1\/admin\/users\/([\w-]{1,128})\/block$/)) && m === 'PUT') return json(await setBlocked(env, ctx, mm[1], (await body(req, 1000)).blocked));
  if ((mm = path.match(/^\/v1\/admin\/config\/([\w.-]{1,40})$/)) && m === 'PUT') return json(await putConfig(env, ctx, mm[1], (await body(req, 60_000)).value));
  if (path === '/v1/admin/audit' && m === 'GET') return json(await auditList(env, ctx, normUrl));
  const featured = (await routeFeatures(req, env, ctx, normUrl)) || (await routeAdmin(req, env, ctx, normUrl));
  if (featured) return featured;

  throw new HttpError(404, 'not-found', 'No such endpoint');
}

export default {
  async fetch(req, env, execCtx, opts) {
    const headers = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const res = await handle(req, env, opts);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        const extra = e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {};
        return json({ error: { code: e.code, message: e.message } }, e.status, { ...headers, ...extra });
      }
      console.error('Unhandled', e?.stack || e);
      return json({ error: { code: 'internal', message: 'Something went wrong on the server' } }, 500, headers);
    }
  },
};
