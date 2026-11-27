import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './d1-shim.mjs';
import worker, { migrate } from '../src/worker.js';

const ISSUER = 'https://a69649.logto.app/oidc';
const JWKS_URL = 'https://a69649.logto.app/oidc/jwks';
const AUDIENCE = 'https://sanzar-api.sanzar.workers.dev';
const OWNER = 'owner@example.test';
let env;
let keyPair;
let jwk;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function token(uid = 'owner-user', email = OWNER) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'ES384', kid: 'test-key' });
  const payload = encode({
    aud: AUDIENCE,
    iss: ISSUER,
    sub: uid,
    email,
    email_verified: true,
    name: 'Platform Owner',
    iat: seconds - 10,
    exp: seconds + 3600,
  });
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-384' }, keyPair.privateKey, new TextEncoder().encode(input));
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
    name: 'ECDSA',
    namedCurve: 'P-384',
  }, true, ['sign', 'verify']);
  jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'test-key' };

  const DB = makeD1();
  const initialSchema = await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  await DB.exec(initialSchema);
  await DB.prepare(`INSERT INTO users (uid, email, display_name, role, locale, profile_visibility, blocked, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind('preserved-profile', 'preserved@example.test', 'Preserved profile', 'student', 'en', 'private', 0, 100, 100).run();
  env = {
    DB,
    LOGTO_ISSUER: ISSUER,
    LOGTO_JWKS_URL: JWKS_URL,
    LOGTO_API_RESOURCE: AUDIENCE,
    SUPER_ADMIN_EMAILS: OWNER,
    ALLOWED_ORIGINS: 'https://student.test,https://admin.test',
    APP_ENV: 'test',
  };
  const migration = await migrate(env);
  assert.deepEqual(migration.applied, ['0001_init', '0002_existing_profiles', '0003_sync_and_resources', '0004_learning_languages', '0005_admin_enhancements', '0006_book_thumbnails', '0007_dictionary', '0008_exam_targeting_and_timezone', '0009_dictionary_translator_sync', '0010_teacher_role', '0011_content_enhancements', '0012_dictionary_insights_columns', '0013_translation_cache_and_quota', '0014_grammar_cache_and_reports', '0015_chapter_lessons', '0016_audio_resources']);
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
  assert.equal(data.schema, '16/16');
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

  // Release media proxy streams allowed GitHub release assets with proper PPTX MIME & CORS
  const proxyRes = await worker.fetch(
    new Request('https://api.test/v1/media/release/book-1/b1-ch1-l1.pptx'),
    env,
    undefined,
    {
      fetcher: async (u) => {
        assert.equal(u, 'https://github.com/sayimarafat-git/SANZAR-Release/releases/download/book-1/b1-ch1-l1.pptx');
        return new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'content-length': '4' },
        });
      },
    },
  );
  assert.equal(proxyRes.status, 200);
  assert.equal(
    proxyRes.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  assert.equal(proxyRes.headers.get('access-control-allow-origin'), '*');

  // Path traversal or invalid tag is rejected
  const badProxy = await worker.fetch(new Request('https://api.test/v1/media/release/bad%20tag/file.pptx'), env);
  assert.equal(badProxy.status, 400);
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

test('admin enhancements: optional pdf url, single book language, expiry, push notifications, and custom xp', async () => {
  const multiLang = await call('PUT', '/v1/admin/books/bad-multi', {
    auth: ownerToken,
    body: { title: 'Bad Multi', subject_id: 'mathematics', levels: ['zh', 'en'], status: 'published' },
  });
  assert.equal(multiLang.response.status, 400);

  const wholeBook = await call('PUT', '/v1/admin/chapters/foundations-full', {
    auth: ownerToken,
    body: { book_id: 'foundations', number: 0, title: 'Whole Book', status: 'published' },
  });
  assert.equal(wholeBook.response.status, 200);

  const pdfNoUrl = await call('PUT', '/v1/admin/resources/pdf-no-url', {
    auth: ownerToken,
    body: { chapter_id: 'foundations-full', type: 'pdf', title: 'Offline Workbook', url: '', status: 'published' },
  });
  assert.equal(pdfNoUrl.response.status, 200);

  const linkNoUrl = await call('PUT', '/v1/admin/resources/link-no-url', {
    auth: ownerToken,
    body: { chapter_id: 'foundations-full', type: 'link', title: 'Required Link', url: '', status: 'published' },
  });
  assert.equal(linkNoUrl.response.status, 400);

  await call('POST', '/v1/admin/announcements', {
    auth: ownerToken,
    body: { title: 'Expired Notice', body: 'Old', expires_at: Date.now() - 10_000 },
  });
  await call('POST', '/v1/admin/announcements', {
    auth: ownerToken,
    body: { title: 'Active Notice', body: 'New', expires_at: Date.now() + 60_000 },
  });
  const catAfterAnn = await call('GET', '/v1/catalog', { auth: ownerToken });
  assert.equal(catAfterAnn.data.announcements.some((a) => a.title === 'Expired Notice'), false);
  assert.equal(catAfterAnn.data.announcements.some((a) => a.title === 'Active Notice'), true);

  const pushRes = await call('POST', '/v1/admin/notifications', {
    auth: ownerToken,
    body: { title: 'Live Update', body: 'New lessons added!' },
  });
  assert.equal(pushRes.response.status, 200);
  assert.ok(pushRes.data.sent >= 1);

  await call('PUT', '/v1/admin/questions/q-custom-xp', {
    auth: ownerToken,
    body: { chapter_id: 'foundations-full', text: 'Custom XP?', options: ['Yes', 'No'], answer: 0, xp_points: 12, status: 'published' },
  });
  await call('PUT', '/v1/admin/exams/exam-custom-xp', {
    auth: ownerToken,
    body: { title: 'Custom XP Quiz', type: 'chapter_quiz', chapter_id: 'foundations-full', duration_sec: 300, question_count: 1, xp_reward: 50, status: 'published' },
  });
  const st = await call('POST', '/v1/exams/exam-custom-xp/start', { auth: ownerToken, body: {} });
  const sub = await call('POST', `/v1/attempts/${st.data.attempt.id}/submit`, {
    auth: ownerToken,
    body: { answers: { 'q-custom-xp': 0 } },
  });
  assert.equal(sub.data.xpAwarded, 50);
});

test('onboarding, single notification read, community search, dictionary, and book thumbnails work end-to-end', async () => {
  const beforeMe = await call('GET', '/v1/me', { auth: ownerToken });
  assert.equal(beforeMe.data.user.onboarding_completed, false);

  const patchedMe = await call('PATCH', '/v1/me', {
    auth: ownerToken,
    body: { onboarding_completed: true, level_id: 'zh' },
  });
  assert.equal(patchedMe.response.status, 200);
  assert.equal(patchedMe.data.user.onboarding_completed, true);

  await env.DB.prepare('INSERT INTO notifications (id, uid, title, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind('n-single-1', 'owner-user', 'First', 'One', 1000).run();
  await env.DB.prepare('INSERT INTO notifications (id, uid, title, body, read, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind('n-single-2', 'owner-user', 'Second', 'Two', 2000).run();
  const markOne = await call('POST', '/v1/notifications/read', { auth: ownerToken, body: { id: 'n-single-1' } });
  assert.equal(markOne.response.status, 200);
  const notifsAfterOne = await call('GET', '/v1/notifications', { auth: ownerToken });
  assert.equal(notifsAfterOne.data.notifications.find((n) => n.id === 'n-single-1')?.read, true);
  assert.equal(notifsAfterOne.data.notifications.find((n) => n.id === 'n-single-2')?.read, false);

  await call('POST', '/v1/posts', { auth: ownerToken, body: { text: 'Mandarin tones practice guide', category: 'general' } });
  await call('POST', '/v1/posts', { auth: ownerToken, body: { text: 'English grammar notes summary', category: 'general' } });
  const searchedFeed = await call('GET', '/v1/feed?q=mandarin', { auth: ownerToken });
  assert.equal(searchedFeed.response.status, 200);
  assert.equal(searchedFeed.data.posts.some((p) => p.text.includes('Mandarin')), true);
  assert.equal(searchedFeed.data.posts.some((p) => p.text.includes('grammar')), false);

  const dictPut = await call('PUT', '/v1/admin/dictionary/zh-ni-hao', {
    auth: ownerToken,
    body: {
      language: 'zh',
      word: '你好',
      phonetic: 'nǐ hǎo',
      part_of_speech: 'greeting',
      meaning_en: 'Hello',
      meaning_bn: 'হ্যালো / নমস্কার',
      meaning_zh: '问候语',
      example: '你好，欢迎来到 SANZAR！',
      example_translation: 'Hello, welcome to SANZAR!',
      hsk_level: 'HSK 1',
      status: 'published',
    },
  });
  assert.equal(dictPut.response.status, 200);
  const dictSearch = await call('GET', '/v1/dictionary?q=n%C7%90&lang=zh', { auth: ownerToken });
  assert.equal(dictSearch.response.status, 200);
  assert.equal(dictSearch.data.entries.length, 1);
  assert.equal(dictSearch.data.entries[0].word, '你好');

  const coverPatch = await call('PATCH', '/v1/admin/books/foundations/cover', {
    auth: ownerToken,
    body: { cover_image: 'data:image/png;base64,iVBORw0KGgo=', cover_ratio: 1.7778 },
  });
  assert.equal(coverPatch.response.status, 200);
  assert.equal(coverPatch.data.cover_ratio, 1.7778);

  const catAfterCover = await call('GET', '/v1/catalog', { auth: ownerToken });
  const book = catAfterCover.data.books.find((b) => b.id === 'foundations');
  assert.equal(book.coverImage, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(book.coverRatio, 1.7778);

  const dictDel = await call('DELETE', '/v1/admin/dictionary/zh-ni-hao', { auth: ownerToken });
  assert.equal(dictDel.response.status, 200);

  const targetedExam = await call('PUT', '/v1/admin/exams/zh-quiz-targeted', {
    auth: ownerToken,
    body: {
      title: 'Targeted Chinese Quiz',
      type: 'chapter_quiz',
      chapter_id: 'foundations-full',
      level_id: 'zh',
      time_zone: 'Asia/Shanghai',
      duration_sec: 300,
      question_count: 1,
      status: 'published',
    },
  });
  assert.equal(targetedExam.response.status, 200);
  const catTargeted = await call('GET', '/v1/catalog', { auth: ownerToken });
  const savedTargeted = catTargeted.data.exams.find((e) => e.id === 'zh-quiz-targeted');
  assert.equal(savedTargeted.level_id, 'zh');
  assert.equal(savedTargeted.time_zone, 'Asia/Shanghai');
});

test('translation QA: Google once, shared cache hit after, quota route reports usage', async () => {
  const realFetch = globalThis.fetch;
  let googleCalls = 0;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://translation.googleapis.com/')) {
      googleCalls += 1;
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'আমি প্রতিদিন চাইনিজ শিখি।' }] } }));
    }
    if (String(u).startsWith('https://api.languagetool.org/')) return new Response(JSON.stringify({ matches: [] }));
    return realFetch(u, init);
  };
  env.GOOGLE_TRANSLATE_API_KEY = 'test-key';
  try {
    const text = 'I study Chinese every single day with my friends.';
    const req = { text, sourceLanguage: 'en', targetLanguage: 'bn' };
    const first = await call('POST', '/v1/translation', { auth: ownerToken, body: req });
    assert.equal(first.response.status, 200, JSON.stringify(first.data));
    assert.equal(googleCalls, 1);
    const second = await call('POST', '/v1/translation', { auth: ownerToken, body: req });
    assert.equal(second.response.status, 200);
    assert.equal(second.data.translatedText, first.data.translatedText);
    assert.equal(googleCalls, 1, 'second request must be served from shared D1 cache');

    const quota = await call('GET', '/v1/admin/translation-quota', { auth: ownerToken });
    assert.equal(quota.response.status, 200, JSON.stringify(quota.data));
    assert.equal(quota.data.charsUsed, text.length);
    assert.equal(quota.data.charCap, 480000);
    assert.ok(quota.data.cache.entries >= 1);

    const insights = await call('POST', '/v1/dictionary/insights', { auth: ownerToken, body: { text: '我比他很高', language: 'zh-Hans' } });
    assert.equal(insights.response.status, 200, JSON.stringify(insights.data));
  } finally {
    globalThis.fetch = realFetch;
    delete env.GOOGLE_TRANSLATE_API_KEY;
  }
});

test('normalized cache keys, D1 LanguageTool grammar cache, report & admin cache CRUD, and expanded ZH/BN rules', async () => {
  const realFetch = globalThis.fetch;
  let ltCalls = 0;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.languagetool.org/')) {
      ltCalls += 1;
      return new Response(JSON.stringify({
        matches: [{ offset: 3, length: 4, message: 'Use does not', shortMessage: 'Verb agreement', replacements: [{ value: "doesn't" }] }],
      }));
    }
    return realFetch(u, init);
  };
  try {
    // 1. LanguageTool called once, 2nd call with extra spaces hits D1 grammar_cache
    const g1 = await call('POST', '/v1/dictionary/insights', { auth: ownerToken, body: { text: 'He dont know this.', language: 'en' } });
    assert.equal(g1.response.status, 200);
    assert.equal(ltCalls, 1);
    const g2 = await call('POST', '/v1/dictionary/insights', { auth: ownerToken, body: { text: '  he   dont know this.. ', language: 'en' } });
    assert.equal(g2.response.status, 200);
    assert.equal(ltCalls, 1, 'second grammar check must be served from D1 grammar_cache');

    // 2. Expanded ZH & BN deterministic rules
    const zh = await call('POST', '/v1/dictionary/insights', { auth: ownerToken, body: { text: '我不有钱', language: 'zh-Hans' } });
    assert.equal(zh.data.grammar.isCorrect, false);
    assert.equal(zh.data.grammar.correctedText, '我没有钱');
    const bn = await call('POST', '/v1/dictionary/insights', { auth: ownerToken, body: { text: 'আমি গতকাল বাজারে যাব।', language: 'bn' } });
    assert.equal(bn.data.grammar.isCorrect, false);
    assert.equal(bn.data.grammar.correctedText, 'আমি গতকাল বাজারে গিয়েছিলাম।');

    // 3. Report translation + admin list/edit/delete
    const rep = await call('POST', '/v1/translation/report', {
      auth: ownerToken,
      body: { sourceLanguage: 'en', targetLanguage: 'bn', sourceText: 'I study   Chinese every single day with my friends..', note: 'Typo' },
    });
    assert.equal(rep.response.status, 200);
    const list = await call('GET', '/v1/admin/translation-cache?reported=1', { auth: ownerToken });
    assert.equal(list.response.status, 200);
    assert.ok(list.data.items.length >= 1);
    const key = list.data.items[0].cacheKey;

    const upd = await call('PATCH', '/v1/admin/translation-cache', {
      auth: ownerToken,
      body: { cacheKey: key, translatedText: 'আমি প্রতিদিন বন্ধুদের সাথে চাইনিজ শিখি।' },
    });
    assert.equal(upd.response.status, 200);

    const del = await call('DELETE', `/v1/admin/translation-cache?cacheKey=${encodeURIComponent(key)}`, { auth: ownerToken });
    assert.equal(del.response.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('polyphone pinyin disambiguation and expanded ZH/BN grammar rules', async () => {
  const testTok = await token('grammar-tester', 'tester@example.test');
  // Polyphone pinyin via identity translation (zh-Hans -> zh-Hans)
  const py1 = await call('POST', '/v1/translation', {
    auth: testTok,
    body: { text: '我去银行了解音乐', sourceLanguage: 'zh-Hans', targetLanguage: 'zh-Hans' },
  });
  assert.equal(py1.response.status, 200);
  assert.equal(py1.data.sourcePinyin, 'wǒ qù yín háng liǎo jiě yīn yuè');

  // Expanded Chinese grammar checks
  const zh1 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: '我是很好', language: 'zh-Hans' } });
  assert.equal(zh1.data.grammar.correctedText, '我很好');
  const zh2 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: '他跑的很快', language: 'zh-Hans' } });
  assert.equal(zh2.data.grammar.correctedText, '他跑得很快');
  const zh3 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: '我学习在学校', language: 'zh-Hans' } });
  assert.equal(zh3.data.grammar.correctedText, '我在学校学习');

  // Expanded Bangla grammar checks
  const bn1 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: 'আমি না জানি।', language: 'bn' } });
  assert.equal(bn1.data.grammar.correctedText, 'আমি জানি না।');
  const bn2 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: 'তিনি ভালো আছে।', language: 'bn' } });
  assert.equal(bn2.data.grammar.correctedText, 'তিনি ভালো আছেন।');
  const bn3 = await call('POST', '/v1/dictionary/insights', { auth: testTok, body: { text: 'একটা শিক্ষক', language: 'bn' } });
  assert.equal(bn3.data.grammar.correctedText, 'একজন শিক্ষক');

  // Symbol-only input returns identity without hitting external translation providers
  const sym = await call('POST', '/v1/translation', {
    auth: testTok,
    body: { text: '??? @#$ 123!', sourceLanguage: 'en', targetLanguage: 'bn' },
  });
  assert.equal(sym.response.status, 200);
  assert.equal(sym.data.translatedText, '??? @#$ 123!');
  assert.equal(sym.data.provider, 'identity');
});
