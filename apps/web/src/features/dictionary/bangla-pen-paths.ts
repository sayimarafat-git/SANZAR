/**
 * Smooth cubic-Bézier SVG pen paths for Bangla base letters & digits (0..100 coordinate space).
 * Matra (headline) at y = 26, baseline at y = 76.
 * Font default: Atma (Google Fonts, with Hind Siliguri fallback).
 */

export const BANGLA_DEFAULT_FONT = '"Atma", "Hind Siliguri", system-ui, sans-serif';

export const BANGLA_PEN_PATHS: Record<string, string[]> = {
  // Swaravarna (Vowels)
  অ: [
    'M 20 26 L 80 26',
    'M 42 36 C 30 34 26 48 30 61 C 35 73 54 74 60 58 C 63 48 56 38 45 40',
    'M 58 55 C 66 64 72 60 72 48',
    'M 72 26 L 72 76',
  ],
  আ: [
    'M 16 26 L 84 26',
    'M 36 36 C 25 35 22 48 26 60 C 31 72 48 73 53 58 C 56 48 50 38 40 40',
    'M 51 55 C 58 63 63 60 63 48',
    'M 63 26 L 63 76',
    'M 77 26 L 77 76',
  ],
  ই: [
    'M 22 26 L 78 26',
    'M 50 26 C 34 32 34 45 50 48 C 64 51 58 66 36 66 C 46 70 58 74 66 78',
    'M 44 15 C 52 13 60 19 52 26',
  ],
  ঈ: [
    'M 22 26 L 78 26',
    'M 48 26 C 34 32 34 45 48 48 C 60 51 56 64 38 66 C 48 70 58 74 66 78',
    'M 46 14 C 58 10 68 18 54 26',
  ],
  উ: [
    'M 22 26 L 78 26',
    'M 50 26 C 34 35 34 48 50 51 C 64 54 62 72 42 74 C 33 74 28 68 32 62',
    'M 45 15 C 54 13 61 19 52 26',
  ],
  ঊ: [
    'M 22 26 L 78 26',
    'M 48 26 C 34 35 34 48 48 51 C 62 54 60 72 40 74 C 31 74 28 66 34 62',
    'M 54 58 C 62 62 68 70 64 78',
    'M 45 15 C 54 13 61 19 52 26',
  ],
  এ: ['M 64 34 C 52 24 32 32 32 52 C 32 72 56 78 66 64 L 66 34 L 66 76'],
  ঐ: [
    'M 64 36 C 52 26 32 34 32 54 C 32 72 56 78 66 64 L 66 36 L 66 76',
    'M 48 16 C 58 12 66 18 56 28',
  ],
  ও: ['M 50 34 C 34 32 30 48 44 53 C 62 56 64 73 44 75 C 32 75 26 67 30 58'],
  ঔ: [
    'M 50 36 C 34 34 30 50 44 54 C 62 57 64 74 44 76 C 32 76 26 68 30 59',
    'M 46 16 C 56 12 66 18 56 28',
  ],

  // Byanjanvarna (Core Consonants)
  ক: [
    'M 20 26 L 80 26',
    'M 52 26 L 28 50 L 52 72',
    'M 52 26 L 52 76',
    'M 52 44 C 68 42 74 52 70 61 C 66 67 57 65 56 59',
  ],
  খ: [
    'M 56 26 L 80 26',
    'M 32 34 C 42 30 46 42 36 48 C 28 54 32 66 48 72 L 66 62',
    'M 66 26 L 66 76',
  ],
  গ: [
    'M 56 26 L 80 26',
    'M 30 44 C 36 32 50 34 50 48 C 50 60 36 66 30 62',
    'M 66 26 L 66 76',
  ],
  ঘ: [
    'M 20 26 L 80 26',
    'M 32 26 C 28 42 34 50 48 48 C 34 54 34 68 50 72 L 66 62',
    'M 66 26 L 66 76',
  ],
  চ: [
    'M 24 26 L 76 26',
    'M 42 26 L 42 60 C 42 74 66 74 68 58 C 68 46 52 46 44 54',
  ],
  ছ: [
    'M 22 26 L 78 26',
    'M 40 26 L 40 54 C 40 64 58 64 60 52 C 60 44 48 44 42 50',
    'M 54 58 C 68 62 68 76 48 80',
  ],
  জ: [
    'M 20 26 L 80 26',
    'M 48 26 C 34 38 32 56 46 68 C 58 72 68 62 62 48',
    'M 60 46 C 72 50 74 64 68 76',
  ],
  ট: [
    'M 22 26 L 78 26',
    'M 44 26 L 44 58 C 44 74 68 74 68 56 C 68 46 56 46 48 54',
    'M 46 15 C 54 13 62 19 52 26',
  ],
  ড: [
    'M 22 26 L 78 26',
    'M 44 26 L 44 54 C 44 68 66 68 66 52 C 66 44 56 44 50 50',
  ],
  ত: [
    'M 20 26 L 80 26',
    'M 52 44 C 60 36 70 44 68 56 C 64 72 34 74 30 56 C 28 44 36 34 46 36',
  ],
  থ: [
    'M 56 26 L 80 26',
    'M 44 34 C 32 32 28 46 38 52 C 28 60 36 72 52 70 L 66 60',
    'M 66 26 L 66 76',
  ],
  দ: [
    'M 22 26 L 78 26',
    'M 42 26 L 42 56 C 48 46 60 46 60 58 L 62 76',
  ],
  ধ: [
    'M 56 26 L 80 26',
    'M 52 34 L 30 50 L 56 70 L 66 62',
    'M 66 26 L 66 76',
  ],
  ন: [
    'M 22 26 L 78 26',
    'M 36 58 C 28 52 34 44 46 48 L 64 56',
    'M 64 26 L 64 76',
  ],
  প: [
    'M 56 26 L 80 26',
    'M 30 40 C 36 54 48 56 64 42',
    'M 66 26 L 66 76',
  ],
  ফ: [
    'M 20 26 L 80 26',
    'M 50 26 L 28 50 L 50 68',
    'M 50 26 L 50 76',
    'M 52 44 C 68 42 74 52 70 62',
  ],
  ব: [
    'M 22 26 L 78 26',
    'M 62 26 L 30 50 L 62 72',
    'M 62 26 L 62 76',
  ],
  ভ: [
    'M 20 26 L 80 26',
    'M 54 38 C 42 36 38 48 50 54 C 64 60 54 74 38 70 C 28 66 28 50 36 36',
  ],
  ম: [
    'M 20 26 L 80 26',
    'M 36 26 C 46 42 48 56 36 64 C 28 68 38 74 50 66 L 64 56',
    'M 64 26 L 64 76',
  ],
  য: [
    'M 22 26 L 78 26',
    'M 34 34 C 46 42 48 54 34 64 L 64 70',
    'M 64 26 L 64 76',
  ],
  র: [
    'M 22 26 L 78 26',
    'M 62 26 L 30 50 L 62 70',
    'M 62 26 L 62 76',
    'M 48 77 L 48 80',
  ],
  ল: [
    'M 20 26 L 80 26',
    'M 30 66 C 28 48 40 44 46 54 C 50 44 60 44 66 56',
    'M 66 26 L 66 76',
  ],
  শ: [
    'M 56 26 L 80 26',
    'M 30 42 C 34 32 46 34 44 46 C 42 56 54 56 56 44 C 58 36 64 40 66 50',
    'M 66 26 L 66 76',
  ],
  স: [
    'M 20 26 L 80 26',
    'M 38 26 C 48 42 46 58 34 68',
    'M 46 52 L 64 60',
    'M 64 26 L 64 76',
  ],
  হ: [
    'M 22 26 L 78 26',
    'M 48 36 C 34 36 34 48 50 50 C 60 52 50 66 32 68 C 44 72 58 76 68 78',
  ],

  // Bangla Digits ০-৯
  '০': ['M 50 24 C 30 24 26 38 26 50 C 26 62 30 76 50 76 C 70 76 74 62 74 50 C 74 38 70 24 50 24'],
  '১': ['M 36 34 C 46 22 66 26 64 42 C 62 56 42 64 32 74 C 44 76 62 72 68 62'],
  '২': ['M 32 34 C 38 20 66 22 66 38 C 66 52 44 60 32 74 L 68 74'],
  '৩': ['M 38 30 C 48 20 66 26 64 40 C 62 48 52 52 44 52 C 60 52 68 60 64 70 C 58 78 36 76 30 66'],
  '৪': ['M 44 26 C 30 26 30 46 44 46 C 58 46 58 26 44 26 M 56 54 C 42 54 42 74 56 74 C 70 74 70 54 56 54'],
  '৫': ['M 34 26 L 34 52 C 34 72 66 74 66 54 C 66 42 50 42 44 50'],
  '৬': ['M 36 24 L 36 56 C 36 74 66 74 66 56 C 66 42 46 42 42 54'],
  '৭': ['M 50 24 C 34 24 32 42 46 44 C 60 46 64 62 56 76'],
  '৮': ['M 36 24 L 36 60 C 36 74 66 74 66 56 C 66 44 50 44 44 54 L 66 76'],
  '৯': ['M 62 34 C 52 22 32 28 34 44 C 36 56 52 58 60 48 L 60 76'],

  // Additional Bangla consonants & signs
  'ড়': [
    'M 22 26 L 78 26',
    'M 42 26 L 42 52 C 42 64 60 64 60 50 C 60 42 48 42 46 48',
    'M 52 74 C 48 74 48 78 52 78 C 56 78 56 74 52 74',
  ],
  'ঢ়': [
    'M 22 26 L 78 26',
    'M 34 26 L 34 52 C 34 72 64 72 66 52 C 66 44 56 44 54 52',
    'M 50 74 C 46 74 46 78 50 78 C 54 78 54 74 50 74',
  ],
  'য়': [
    'M 22 26 L 78 26',
    'M 32 26 L 32 48 C 32 62 48 64 56 52',
    'M 64 26 L 64 72',
    'M 48 74 C 44 74 44 78 48 78 C 52 78 52 74 48 74',
  ],
  'ৎ': ['M 32 34 C 44 22 68 28 64 46 C 60 62 42 70 30 68'],
  'ং': ['M 48 36 C 36 36 36 52 48 52 C 60 52 60 36 48 36'],
  'ঃ': [
    'M 48 34 C 40 34 40 44 48 44 C 56 44 56 34 48 34',
    'M 48 56 C 40 56 40 66 48 66 C 56 66 56 56 48 56',
  ],
  'ঁ': [
    'M 34 16 C 42 24 58 24 66 16',
    'M 50 12 C 47 12 47 16 50 16 C 53 16 53 12 50 12',
  ],
  '।': ['M 50 22 L 50 78'],

  // Bangla Vowel Signs (Kars / কার) in 100x100 space
  'া': ['M 24 26 L 54 26', 'M 40 26 L 40 76'],
  'ি': [
    'M 24 26 L 56 26',
    'M 38 26 L 38 76',
    'M 38 26 C 38 8 66 6 76 20',
  ],
  'ী': [
    'M 24 26 L 56 26',
    'M 42 26 L 42 76',
    'M 42 26 C 42 8 18 6 12 18',
  ],
  'ু': ['M 36 78 C 46 92 66 90 62 80 C 58 76 48 80 54 88'],
  'ূ': ['M 34 80 C 44 74 58 78 52 88 C 46 96 64 94 70 86'],
  'ৃ': ['M 38 78 C 34 90 50 94 60 84 C 64 80 58 76 54 82'],
  'ে': ['M 54 26 C 32 26 24 44 28 60 C 32 72 44 74 50 64'],
  'ৈ': [
    'M 54 26 C 32 26 24 44 28 60 C 32 72 44 74 50 64',
    'M 48 24 C 44 10 58 6 66 14',
  ],
  'ৗ': ['M 24 26 L 54 26', 'M 40 26 L 40 76', 'M 40 26 C 42 10 56 8 64 16'],
  '্য': ['M 26 26 L 54 26', 'M 38 26 C 52 38 52 62 34 74'],
  '্র': ['M 32 78 C 46 72 60 76 70 72'],
  '্': ['M 44 76 L 62 88'],
};

export interface BanglaPenStroke {
  d: string;
  charIndex: number;
  strokeInChar: number;
}

export interface BanglaWordPenLayout {
  strokes: BanglaPenStroke[];
  totalWidth: number;
  viewBoxHeight: number;
}

/** Shifts all coordinates in an M/L/C/Q SVG path by (dx, dy). */
function translateSvgPath(d: string, dx: number, dy = 0): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g);
  if (!tokens) return d;
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    out.push(cmd);
    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(tokens[i++]) + dx;
      const y = parseFloat(tokens[i++]) + dy;
      out.push(x.toFixed(1), y.toFixed(1));
    } else if (cmd === 'Q') {
      for (let p = 0; p < 2; p++) {
        const x = parseFloat(tokens[i++]) + dx;
        const y = parseFloat(tokens[i++]) + dy;
        out.push(x.toFixed(1), y.toFixed(1));
      }
    } else if (cmd === 'C') {
      for (let p = 0; p < 3; p++) {
        const x = parseFloat(tokens[i++]) + dx;
        const y = parseFloat(tokens[i++]) + dy;
        out.push(x.toFixed(1), y.toFixed(1));
      }
    }
  }
  return out.join(' ');
}

const PRE_BASE_KARS = new Set(['ি', 'ে', 'ৈ']);
const BELOW_BASE_KARS = new Set(['ু', 'ূ', 'ৃ', '্']);
const ABOVE_BASE_MARKS = new Set(['ঁ']);
const NARROW_POST_KARS = new Set(['া', 'ী', 'ৗ', '্য', 'ং', 'ঃ', '।']);

/**
 * Builds a unified whole-word SVG pen-stroke layout for Bangla text,
 * placing pre-base Kars (ি ে ৈ), split Kars (ো ৌ), base consonants,
 * below-base Kars (ু ূ ৃ), and post-base Kars (া ী) in visual handwriting order.
 */
export function buildBanglaPenLayout(text: string): BanglaWordPenLayout {
  const strokes: BanglaPenStroke[] = [];
  const chars = Array.from(text.normalize('NFC'));
  let cursorX = 16;

  // Group into logical visual clusters: [consonant/vowel + trailing marks/conjuncts]
  let idx = 0;
  let charSlot = 0;

  while (idx < chars.length) {
    const ch = chars[idx];
    if (/\s/.test(ch)) {
      cursorX += 38;
      idx++;
      continue;
    }

    // Collect a cluster: base + (hasanta + next consonant)* + trailing vowel signs/modifiers
    const clusterChars: string[] = [ch];
    idx++;
    while (idx < chars.length) {
      const next = chars[idx];
      if (next === '্' && idx + 1 < chars.length) {
        clusterChars.push(next, chars[idx + 1]);
        idx += 2;
      } else if (/[\u0981-\u0983\u09bc\u09be-\u09cd\u09d7]/.test(next)) {
        clusterChars.push(next);
        idx++;
      } else {
        break;
      }
    }

    // Separate visual parts
    const preKars: string[] = [];
    const bases: string[] = [];
    const belowKars: string[] = [];
    const aboveMarks: string[] = [];
    const postKars: string[] = [];

    for (let j = 0; j < clusterChars.length; j++) {
      const c = clusterChars[j];
      if (c === 'ো') {
        preKars.push('ে');
        postKars.push('া');
      } else if (c === 'ৌ') {
        preKars.push('ে');
        postKars.push('ৗ');
      } else if (c === '্' && j + 1 < clusterChars.length) {
        const nextC = clusterChars[j + 1];
        if (nextC === 'য') {
          postKars.push('্য');
          j++;
        } else if (nextC === 'র') {
          belowKars.push('্র');
          j++;
        } else {
          // Conjunct: draw second consonant right after first
          bases.push(nextC);
          j++;
        }
      } else if (PRE_BASE_KARS.has(c)) {
        preKars.push(c);
      } else if (BELOW_BASE_KARS.has(c)) {
        belowKars.push(c);
      } else if (ABOVE_BASE_MARKS.has(c)) {
        aboveMarks.push(c);
      } else if (NARROW_POST_KARS.has(c)) {
        postKars.push(c);
      } else {
        bases.push(c);
      }
    }

    let strokeInChar = 0;

    // 1. Pre-base Kars (left of consonant)
    for (const pk of preKars) {
      const paths = BANGLA_PEN_PATHS[pk];
      if (paths) {
        for (const p of paths) {
          strokes.push({ d: translateSvgPath(p, cursorX - 16, 0), charIndex: charSlot, strokeInChar: strokeInChar++ });
        }
        cursorX += 38;
      }
    }

    // 2. Base letter(s)
    const baseStartX = cursorX;
    for (const b of bases) {
      const paths = BANGLA_PEN_PATHS[b];
      if (paths) {
        for (const p of paths) {
          strokes.push({ d: translateSvgPath(p, cursorX - 16, 0), charIndex: charSlot, strokeInChar: strokeInChar++ });
        }
        cursorX += 64;
      }
    }

    // 3. Above-base marks (centered over base)
    const baseMidX = bases.length > 0 ? baseStartX : cursorX;
    for (const am of aboveMarks) {
      const paths = BANGLA_PEN_PATHS[am];
      if (paths) {
        for (const p of paths) {
          strokes.push({ d: translateSvgPath(p, baseMidX - 16, 0), charIndex: charSlot, strokeInChar: strokeInChar++ });
        }
      }
    }

    // 4. Below-base Kars (under base)
    for (const bk of belowKars) {
      const paths = BANGLA_PEN_PATHS[bk];
      if (paths) {
        for (const p of paths) {
          strokes.push({ d: translateSvgPath(p, baseMidX - 16, 0), charIndex: charSlot, strokeInChar: strokeInChar++ });
        }
      }
    }

    // 5. Post-base Kars (right of base)
    for (const pk of postKars) {
      const paths = BANGLA_PEN_PATHS[pk];
      if (paths) {
        for (const p of paths) {
          strokes.push({ d: translateSvgPath(p, cursorX - 24, 0), charIndex: charSlot, strokeInChar: strokeInChar++ });
        }
        cursorX += 36;
      }
    }

    charSlot++;
  }

  return {
    strokes,
    totalWidth: Math.max(120, cursorX + 16),
    viewBoxHeight: 108,
  };
}
