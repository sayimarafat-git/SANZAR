// Pure helpers shared by the pages (unit-tested in test/model.test.ts).

export const ROLE_RANK = { student: 0, moderator: 1, content_admin: 2, admin: 3, super_admin: 4 } as const;
export type Role = keyof typeof ROLE_RANK;
export const ROLES = Object.keys(ROLE_RANK) as Role[];
export const atLeast = (role: string | undefined, min: Role) => role !== undefined && role in ROLE_RANK && ROLE_RANK[role as Role] >= ROLE_RANK[min];

export const LEVELS = [
  { id: 'c9', name: 'Class 9' }, { id: 'c10', name: 'Class 10' }, { id: 'hsc', name: 'HSC' }, { id: 'uni', name: 'University' },
];

/** Same rule as the API: letters, digits, dot, dash, underscore; max 64. */
export const isId = (v: string) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v);

/** Makes a safe id from a title, e.g. "Physics 9–10" → "physics-9-10". */
export function slugify(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^\w\s.-]/g, ' ').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 64);
}

export interface NoteSection { heading: string; page: number | null; text: string; terms: string[] }

/** Returns a list of problems (empty = valid), mirroring the API checks so editors see them before saving. */
export function validateSections(sections: NoteSection[]): string[] {
  const errs: string[] = [];
  if (!sections.length) errs.push('Add at least one section.');
  if (sections.length > 60) errs.push('At most 60 sections.');
  sections.forEach((s, i) => {
    if (!s.heading.trim()) errs.push(`Section ${i + 1}: heading is empty.`);
    if (!s.text.trim()) errs.push(`Section ${i + 1}: text is empty.`);
    if (s.page !== null && (!Number.isInteger(s.page) || s.page < 1 || s.page > 5000)) errs.push(`Section ${i + 1}: page must be 1–5000.`);
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

export const isHttps = (v: string) => /^https:\/\/[^\s]{4,1000}$/.test(v);

/** "bn terms" field: comma or new-line separated → trimmed list. */
export const parseTerms = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
}
