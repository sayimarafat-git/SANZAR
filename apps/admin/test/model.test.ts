import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, isId, slugify, validateSections, validateQuestion, parseTerms, isHttps } from '../src/lib/model.ts';

test('roles', () => {
  assert.equal(atLeast('admin', 'content_admin'), true);
  assert.equal(atLeast('moderator', 'content_admin'), false);
  assert.equal(atLeast('hacker', 'student'), false);
  assert.equal(atLeast(undefined, 'student'), false);
});

test('ids and slugs match the API rule', () => {
  assert.equal(slugify('Physics 9–10 (New!)'), 'physics-9-10-new');
  assert.equal(isId(slugify('Higher Math  Part_2')), true);
  assert.equal(isId('bad id'), false);
  assert.equal(isId('-x'), false);
  assert.equal(slugify('x'.repeat(100)).length, 64);
});

test('notes validation', () => {
  assert.deepEqual(validateSections([{ heading: 'A', page: 3, text: 'B', terms: [] }]), []);
  assert.equal(validateSections([]).length, 1);
  assert.deepEqual(validateSections([{ heading: ' ', page: 0, text: '', terms: [] }]), ['Section 1: heading is empty.', 'Section 1: text is empty.', 'Section 1: page must be 1–5000.']);
});

test('question validation', () => {
  assert.deepEqual(validateQuestion({ text: 'What is V?', options: ['IR', 'I/R'], answer: 0 }), []);
  assert.ok(validateQuestion({ text: 'What?', options: ['a', 'a'], answer: 0 }).includes('Options must be different.'));
  assert.ok(validateQuestion({ text: 'What?', options: ['a', 'b'], answer: null }).includes('Choose the correct option.'));
  assert.ok(validateQuestion({ text: 'What?', options: ['a'], answer: 0 }).includes('Use 2–6 options.'));
});

test('terms and links', () => {
  assert.deepEqual(parseTerms('ও’মের সূত্র, রোধ\nVoltage,, '), ['ও’মের সূত্র', 'রোধ', 'Voltage']);
  assert.equal(isHttps('https://example.com/a.pdf'), true);
  assert.equal(isHttps('http://example.com/a.pdf'), false);
  assert.equal(isHttps('javascript:alert(1)'), false);
});
