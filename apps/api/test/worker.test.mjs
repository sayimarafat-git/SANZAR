import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './d1-shim.mjs';
import worker, { migrate } from '../src/worker.js';

const PROJECT = 'sanzar-test-project';
const OWNER = 'owner@example.test';
let env;
let keyPair;
let jwk;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function token(uid = 'owner-user', email = OWNER) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', kid: 'test-key' });
  const payload = encode({
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: uid,
    email,
    email_verified: true,
    name: 'Platform Owner',
    iat: seconds - 10,
    exp: seconds + 3600,
    auth_time: seconds - 10,
  });
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

async function call(method, path, { auth, body } = {}) {
  const response = await worker.fetch(new Request(`https://api.test${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, undefined, {
    fetcher: async () => new Response(JSON.stringify({ keys: [jwk] })),
  });
  return { response, data: response.status === 204 ? null : await response.json() };
}

async function callRaw(method, path, { auth, body, contentType } = {}) {
  const response = await worker.fetch(new Request(`https://api.test${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(contentType ? { 'content-type': contentType } : {}),
    },
    body,
  }), env, undefined, {
    fetcher: async () => new Response(JSON.stringify({ keys: [jwk] })),
  });
  return { response, data: await response.json() };
}

let ownerToken;

before(async () => {
  keyPair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'test-key' };

  const DB = makeD1();
  const initialSchema = await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  await DB.exec(initialSchema);
  await DB.prepare(`INSERT INTO users (uid, email, display_name, role, locale, profile_visibility, blocked, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind('preserved-profile', 'preserved@example.test', 'Preserved profile', 'student', 'en', 'private', 0, 100, 100).run();
  env = {
    DB,
    FIREBASE_PROJECT_ID: PROJECT,
    SUPER_ADMIN_EMAILS: OWNER,
    ALLOWED_ORIGINS: 'https://student.test,https://admin.test',
    APP_ENV: 'test',
  };
  const migration = await migrate(env);
  assert.deepEqual(migration.applied, ['0001_init', '0002_existing_profiles', '0003_sync_and_resources', '0004_levels_6_to_uni', '0005_learning_languages']);
  const preserved = await DB.prepare('SELECT uid, email, display_name, created_at FROM users WHERE uid = ?').bind('preserved-profile').first();
  assert.equal(preserved.uid, 'preserved-profile');
  assert.equal(preserved.email, 'preserved@example.test');
  assert.equal(preserved.display_name, 'Preserved profile');
  assert.equal(preserved.created_at, 100);
  ownerToken = await token();
});

test('health reports completed schema migrations', async () => {
  const { response, data } = await call('GET', '/v1/health');
  assert.equal(response.status, 200);
  assert.equal(data.schema, '5/5');
});

test('catalog starts with platform levels and no imported course data', async () => {
  const { response, data } = await call('GET', '/v1/catalog', { auth: ownerToken });
  assert.equal(response.status, 200);
  assert.deepEqual(data.levels.map((level) => level.id), ['zh', 'en']);
  assert.deepEqual(data.books, []);
  assert.deepEqual(data.notes, {});
});

test('profile requires a verified Firebase token and bootstraps the owner privately', async () => {
  const unauthenticated = await call('GET', '/v1/me');
  assert.equal(unauthenticated.response.status, 401);

  const { response, data } = await call('GET', '/v1/me', { auth: ownerToken });
  assert.equal(response.status, 200);
  assert.equal(data.user.role, 'super_admin');
  assert.equal(data.user.profile_visibility, 'private');

  const duplicate = await call('GET', '/v1/me', {
    auth: await token('duplicate-account', OWNER.toUpperCase()),
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.data.error.code, 'email-already-in-use');
  assert.equal(
    await env.DB.prepare('SELECT uid FROM users WHERE uid = ?').bind('duplicate-account').first(),
    null,
  );
});

test('admin can create clean catalog content and students can study and take an exam', async () => {
  const subject = await call('PUT', '/v1/admin/subjects/mathematics', {
    auth: ownerToken,
    body: { name_en: 'Mathematics', name_bn: 'গণিত', color: '#247754' },
  });
  assert.equal(subject.response.status, 200);

  const book = await call('PUT', '/v1/admin/books/foundations', {
    auth: ownerToken,
    body: { title: 'Foundations', subject_id: 'mathematics', levels: ['zh'], status: 'published' },
  });
  assert.equal(book.response.status, 200);

  const chapter = await call('PUT', '/v1/admin/chapters/first-steps', {
    auth: ownerToken,
    body: { book_id: 'foundations', number: 1, title: 'First steps', status: 'published' },
  });
  assert.equal(chapter.response.status, 200);

  const notes = await call('PUT', '/v1/admin/notes/first-steps', {
    auth: ownerToken,
    body: { sections: [{ heading: 'Overview', text: 'A short learning introduction.', terms: ['learning'], page: 1 }] },
  });
  assert.equal(notes.response.status, 200);

  const question = await call('PUT', '/v1/admin/questions/question-one', {
    auth: ownerToken,
    body: { chapter_id: 'first-steps', text: 'Choose the correct option.', options: ['Correct', 'Incorrect'], answer: 0, status: 'published' },
  });
  assert.equal(question.response.status, 200);

  const exam = await call('PUT', '/v1/admin/exams/first-quiz', {
    auth: ownerToken,
    body: { title: 'First quiz', type: 'chapter_quiz', chapter_id: 'first-steps', duration_sec: 600, question_count: 1, status: 'published' },
  });
  assert.equal(exam.response.status, 200);

  const catalog = await call('GET', '/v1/catalog', { auth: ownerToken });
  assert.equal(catalog.data.books[0].title, 'Foundations');
  assert.equal(catalog.data.books[0].chapters[0].hasNotes, true);

  const tutor = await call('POST', '/v1/tutor/ask', { auth: ownerToken, body: { q: 'learning' } });
  assert.equal(tutor.data.found, true);

  const started = await call('POST', '/v1/exams/first-quiz/start', { auth: ownerToken, body: {} });
  assert.equal(started.response.status, 200);
  assert.equal('answer' in started.data.questions[0], false);

  const submitted = await call('POST', `/v1/attempts/${started.data.attempt.id}/submit`, {
    auth: ownerToken,
    body: { answers: { 'question-one': 0 } },
  });
  assert.equal(submitted.data.attempt.score, 1);
});

test('study activity and community actions update user progress', async () => {
  const startedAt = Date.now() - 10_000;
  const study = await call('POST', '/v1/study/events', {
    auth: ownerToken,
    body: { events: [{ id: 'focus-event', type: 'focus', sec: 60, startedAt }] },
  });
  assert.equal(study.response.status, 200);
  assert.equal(study.data.results[0].acceptedSec, 60);

  const progress = await call('GET', '/v1/progress', { auth: ownerToken });
  assert.ok(progress.data.todaySec >= 60);

  const groupAdmin = await call('PUT', '/v1/admin/groups/study-circle', {
    auth: ownerToken,
    body: { name: 'Study Circle', about: '', type: 'study', active: true },
  });
  assert.equal(groupAdmin.response.status, 404);
  const joined = await call('POST', '/v1/groups/study-circle/join', { auth: ownerToken, body: {} });
  assert.equal(joined.response.status, 404);

  const post = await call('POST', '/v1/posts', {
    auth: ownerToken,
    body: {
      text: 'A new platform discussion.',
      attachments: [{
        url: 'https://example.test/guide.pdf',
        name: 'guide.pdf',
        mime: 'application/pdf',
      }],
    },
  });
  assert.equal(post.response.status, 200);
  assert.deepEqual(post.data.post.attachments, [{
    url: 'https://example.test/guide.pdf',
    name: 'guide.pdf',
    mime: 'application/pdf',
  }]);
  const feed = await call('GET', '/v1/feed', { auth: ownerToken });
  assert.equal(feed.data.posts[0].text, 'A new platform discussion.');
  assert.equal(feed.data.posts[0].attachments[0].name, 'guide.pdf');

  const unsafeAttachment = await call('POST', '/v1/posts', {
    auth: ownerToken,
    body: {
      text: 'Unsafe link should fail.',
      attachments: [{ url: 'javascript:alert(1)', name: 'unsafe', mime: 'text/uri-list' }],
    },
  });
  assert.equal(unsafeAttachment.response.status, 400);

  const upload = await callRaw('POST', '/v1/uploads?name=note.pdf', {
    auth: ownerToken,
    contentType: 'application/pdf',
    body: new Uint8Array([37, 80, 68, 70]),
  });
  assert.equal(upload.response.status, 503);
  assert.equal(upload.data.error.code, 'uploads-unavailable');
});

test('legacy import endpoint is not exposed and configured origins receive CORS headers', async () => {
  const response = await call('POST', '/v1/admin/import-legacy', { auth: ownerToken, body: {} });
  assert.equal(response.response.status, 404);

  const cors = await worker.fetch(new Request('https://api.test/v1/catalog', {
    headers: { origin: 'https://student.test' },
  }), env);
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://student.test');
});

test('offline sync is idempotent and resource manifest works on /v1 and /api/v1', async () => {
  const sha = 'a'.repeat(64);
  const putManifest = await call('PUT', '/api/v1/admin/manifest/translation-en-bn', {
    auth: ownerToken,
    body: {
      version: '1.2.0',
      url: 'https://downloads.example.test/models/en-bn-1.2.0.bin',
      sizeBytes: 1024,
      sha256: sha,
      required: false,
    },
  });
  assert.equal(putManifest.response.status, 200);

  const manifest = await call('GET', '/api/v1/resources/manifest');
  assert.equal(manifest.response.status, 200);
  assert.equal(manifest.data.resources[0].id, 'translation-en-bn');
  assert.equal(manifest.data.resources[0].sha256, sha);

  const op = {
    operationId: 'op-sync-study-1',
    type: 'study_event',
    payload: { type: 'notes', sec: 120, startedAt: Date.now() - 5000 },
  };
  const firstSync = await call('POST', '/api/v1/sync', {
    auth: ownerToken,
    body: { operations: [op] },
  });
  assert.equal(firstSync.response.status, 200);
  assert.equal(firstSync.data.accepted[0].status, 'accepted');

  const retrySync = await call('POST', '/v1/sync', {
    auth: ownerToken,
    body: { operations: [op] },
  });
  assert.equal(retrySync.response.status, 200);
  assert.equal(retrySync.data.accepted[0].status, 'duplicate');
});
