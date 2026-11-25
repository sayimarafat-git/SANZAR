/**
 * Smooth cubic-Bézier SVG monoline pen paths for English (A-Z, a-z, 0-9, and common symbols).
 * Vertical 4-line penmanship coordinates (y in 0..100):
 *  - Ascender line:  y = 20
 *  - Midline (x-ht): y = 44
 *  - Baseline:       y = 74
 *  - Descender line: y = 92
 */

export interface PenGlyph {
  /** Proportional advance width in 0..100 coordinate units */
  w: number;
  /** Ordered SVG path strings (smooth M/L/C/Q commands) */
  strokes: string[];
}

export const LATIN_PEN_GLYPHS: Record<string, PenGlyph> = {
  // Uppercase A-Z
  A: { w: 58, strokes: ['M 29 20 L 8 74', 'M 29 20 L 50 74', 'M 15 56 L 43 56'] },
  B: {
    w: 54,
    strokes: [
      'M 12 20 L 12 74',
      'M 12 20 L 32 20 C 46 20 46 46 32 46 L 12 46',
      'M 12 46 L 34 46 C 49 46 49 74 34 74 L 12 74',
    ],
  },
  C: { w: 54, strokes: ['M 46 30 C 40 19 20 18 12 31 C 6 42 6 54 12 64 C 20 76 40 76 46 65'] },
  D: { w: 56, strokes: ['M 12 20 L 12 74', 'M 12 20 L 28 20 C 50 20 50 74 28 74 L 12 74'] },
  E: { w: 48, strokes: ['M 12 20 L 12 74', 'M 12 20 L 42 20', 'M 12 46 L 37 46', 'M 12 74 L 43 74'] },
  F: { w: 46, strokes: ['M 12 20 L 12 74', 'M 12 20 L 41 20', 'M 12 46 L 36 46'] },
  G: {
    w: 58,
    strokes: [
      'M 48 30 C 42 19 20 18 12 31 C 6 42 6 54 12 64 C 20 76 42 76 49 64 L 49 50 L 32 50',
    ],
  },
  H: { w: 56, strokes: ['M 12 20 L 12 74', 'M 44 20 L 44 74', 'M 12 46 L 44 46'] },
  I: { w: 32, strokes: ['M 16 20 L 16 74', 'M 7 20 L 25 20', 'M 7 74 L 25 74'] },
  J: { w: 42, strokes: ['M 32 20 L 32 58 C 32 74 12 77 8 63'] },
  K: { w: 52, strokes: ['M 12 20 L 12 74', 'M 44 20 L 12 50', 'M 22 41 L 45 74'] },
  L: { w: 46, strokes: ['M 12 20 L 12 74 L 41 74'] },
  M: { w: 66, strokes: ['M 10 74 L 10 20', 'M 10 20 L 33 54', 'M 56 20 L 33 54', 'M 56 20 L 56 74'] },
  N: { w: 56, strokes: ['M 12 74 L 12 20', 'M 12 20 L 44 74', 'M 44 20 L 44 74'] },
  O: {
    w: 58,
    strokes: ['M 29 20 C 12 20 8 34 8 47 C 8 60 12 74 29 74 C 46 74 50 60 50 47 C 50 34 46 20 29 20'],
  },
  P: { w: 52, strokes: ['M 12 20 L 12 74', 'M 12 20 L 32 20 C 47 20 47 48 32 48 L 12 48'] },
  Q: {
    w: 60,
    strokes: [
      'M 29 20 C 12 20 8 34 8 47 C 8 60 12 74 29 74 C 46 74 50 60 50 47 C 50 34 46 20 29 20',
      'M 34 59 L 52 77',
    ],
  },
  R: {
    w: 54,
    strokes: [
      'M 12 20 L 12 74',
      'M 12 20 L 32 20 C 47 20 47 47 32 47 L 12 47',
      'M 29 47 L 46 74',
    ],
  },
  S: {
    w: 50,
    strokes: ['M 42 29 C 38 19 13 18 11 31 C 9 43 43 45 43 60 C 43 75 16 77 9 65'],
  },
  T: { w: 52, strokes: ['M 7 20 L 45 20', 'M 26 20 L 26 74'] },
  U: { w: 56, strokes: ['M 12 20 L 12 56 C 12 76 44 76 44 56 L 44 20'] },
  V: { w: 54, strokes: ['M 8 20 L 27 74', 'M 46 20 L 27 74'] },
  W: { w: 72, strokes: ['M 8 20 L 21 74', 'M 36 34 L 21 74', 'M 36 34 L 51 74', 'M 64 20 L 51 74'] },
  X: { w: 52, strokes: ['M 10 20 L 42 74', 'M 42 20 L 10 74'] },
  Y: { w: 52, strokes: ['M 8 20 L 26 48', 'M 44 20 L 26 48', 'M 26 48 L 26 74'] },
  Z: { w: 50, strokes: ['M 10 20 L 42 20 L 10 74 L 42 74'] },

  // Lowercase a-z (clean modern textbook print)
  a: {
    w: 46,
    strokes: [
      'M 36 52 C 32 42 10 42 9 59 C 8 75 32 76 36 66',
      'M 36 44 L 36 74',
    ],
  },
  b: {
    w: 46,
    strokes: [
      'M 11 20 L 11 74',
      'M 11 52 C 16 42 38 42 38 59 C 38 75 16 76 11 66',
    ],
  },
  c: { w: 42, strokes: ['M 36 50 C 31 42 10 43 9 59 C 8 74 30 76 36 68'] },
  d: {
    w: 46,
    strokes: [
      'M 36 52 C 31 42 9 42 9 59 C 9 75 31 76 36 66',
      'M 36 20 L 36 74',
    ],
  },
  e: {
    w: 45,
    strokes: ['M 10 58 L 37 58 C 37 42 10 41 9 59 C 8 75 31 76 36 68'],
  },
  f: { w: 34, strokes: ['M 29 24 C 24 18 16 21 16 31 L 16 74', 'M 7 44 L 27 44'] },
  g: {
    w: 46,
    strokes: [
      'M 36 52 C 31 42 9 42 9 59 C 9 75 31 76 36 66',
      'M 36 44 L 36 79 C 36 93 15 94 11 86',
    ],
  },
  h: { w: 46, strokes: ['M 11 20 L 11 74', 'M 11 53 C 16 42 36 42 36 55 L 36 74'] },
  i: { w: 22, strokes: ['M 11 44 L 11 74', 'M 11 30 L 11 32'] },
  j: { w: 26, strokes: ['M 16 44 L 16 80 C 16 92 7 93 4 89', 'M 16 30 L 16 32'] },
  k: { w: 44, strokes: ['M 11 20 L 11 74', 'M 36 44 L 11 60', 'M 20 54 L 37 74'] },
  l: { w: 22, strokes: ['M 11 20 L 11 74'] },
  m: {
    w: 66,
    strokes: [
      'M 9 44 L 9 74',
      'M 9 53 C 13 42 33 42 33 54 L 33 74',
      'M 33 53 C 37 42 57 42 57 54 L 57 74',
    ],
  },
  n: { w: 46, strokes: ['M 11 44 L 11 74', 'M 11 53 C 16 42 36 42 36 55 L 36 74'] },
  o: {
    w: 46,
    strokes: ['M 23 44 C 11 44 8 52 8 59 C 8 66 11 74 23 74 C 35 74 38 66 38 59 C 38 52 35 44 23 44'],
  },
  p: {
    w: 46,
    strokes: [
      'M 11 44 L 11 92',
      'M 11 52 C 16 42 38 42 38 59 C 38 75 16 76 11 66',
    ],
  },
  q: {
    w: 46,
    strokes: [
      'M 36 52 C 31 42 9 42 9 59 C 9 75 31 76 36 66',
      'M 36 44 L 36 92',
    ],
  },
  r: { w: 34, strokes: ['M 11 44 L 11 74', 'M 11 54 C 15 44 25 43 30 46'] },
  s: { w: 40, strokes: ['M 33 50 C 29 43 11 43 10 51 C 9 59 34 59 34 67 C 34 75 14 76 9 68'] },
  t: { w: 34, strokes: ['M 16 26 L 16 67 C 16 74 24 75 28 73', 'M 7 44 L 27 44'] },
  u: { w: 46, strokes: ['M 11 44 L 11 63 C 11 76 31 76 36 66', 'M 36 44 L 36 74'] },
  v: { w: 44, strokes: ['M 8 44 L 22 74', 'M 36 44 L 22 74'] },
  w: { w: 62, strokes: ['M 7 44 L 18 74', 'M 31 50 L 18 74', 'M 31 50 L 44 74', 'M 55 44 L 44 74'] },
  x: { w: 42, strokes: ['M 9 44 L 33 74', 'M 33 44 L 9 74'] },
  y: { w: 44, strokes: ['M 9 44 L 22 74', 'M 35 44 L 14 92'] },
  z: { w: 42, strokes: ['M 9 44 L 33 44 L 9 74 L 33 74'] },

  // Digits 0-9
  '0': { w: 48, strokes: ['M 24 20 C 11 20 8 34 8 47 C 8 60 11 74 24 74 C 37 74 40 60 40 47 C 40 34 37 20 24 20'] },
  '1': { w: 36, strokes: ['M 11 31 L 21 20 L 21 74', 'M 10 74 L 31 74'] },
  '2': { w: 48, strokes: ['M 10 32 C 13 18 39 18 39 33 C 39 46 16 58 9 74 L 41 74'] },
  '3': { w: 48, strokes: ['M 11 28 C 16 18 39 19 39 32 C 39 42 29 46 21 46 C 33 46 41 52 41 62 C 41 75 16 77 10 66'] },
  '4': { w: 50, strokes: ['M 34 20 L 9 56 L 43 56', 'M 34 20 L 34 74'] },
  '5': { w: 48, strokes: ['M 39 20 L 13 20 L 11 46 C 18 40 40 41 40 58 C 40 75 16 77 10 66'] },
  '6': { w: 48, strokes: ['M 36 24 C 24 17 10 29 10 52 C 10 75 39 76 39 58 C 39 42 15 41 10 53'] },
  '7': { w: 46, strokes: ['M 9 20 L 39 20 L 18 74'] },
  '8': {
    w: 48,
    strokes: [
      'M 24 46 C 11 44 10 22 24 20 C 38 22 37 44 24 46 C 9 49 8 74 24 74 C 40 74 39 49 24 46',
    ],
  },
  '9': { w: 48, strokes: ['M 38 38 C 33 21 10 21 10 38 C 10 53 33 54 38 40', 'M 38 36 L 38 52 C 38 72 22 76 13 70'] },

  // Common symbols
  '.': { w: 20, strokes: ['M 10 71 L 10 74'] },
  ',': { w: 20, strokes: ['M 11 71 C 11 78 8 83 5 85'] },
  '!': { w: 22, strokes: ['M 11 20 L 11 60', 'M 11 71 L 11 74'] },
  '?': { w: 44, strokes: ['M 11 32 C 12 18 35 18 35 32 C 35 44 22 46 22 58', 'M 22 71 L 22 74'] },
  ':': { w: 20, strokes: ['M 10 47 L 10 50', 'M 10 71 L 10 74'] },
  ';': { w: 22, strokes: ['M 11 47 L 11 50', 'M 11 71 C 11 78 8 83 5 85'] },
  "'": { w: 18, strokes: ['M 9 20 L 9 32'] },
  '"': { w: 28, strokes: ['M 9 20 L 9 32', 'M 19 20 L 19 32'] },
  '-': { w: 34, strokes: ['M 8 56 L 26 56'] },
  '_': { w: 40, strokes: ['M 6 78 L 34 78'] },
  '(': { w: 28, strokes: ['M 20 18 C 8 34 8 64 20 80'] },
  ')': { w: 28, strokes: ['M 8 18 C 20 34 20 64 8 80'] },
  '/': { w: 36, strokes: ['M 29 18 L 7 78'] },
  '&': { w: 54, strokes: ['M 44 74 L 15 41 C 10 34 12 20 23 20 C 33 20 35 31 27 38 L 13 51 C 6 58 10 74 24 74 C 34 74 41 64 44 52'] },
  '@': { w: 62, strokes: ['M 42 57 C 39 65 23 66 22 55 C 21 43 38 41 41 51 L 41 61 C 41 66 49 65 52 57 C 56 44 50 22 31 22 C 13 22 7 38 8 53 C 9 71 25 77 42 74'] },
  '#': { w: 52, strokes: ['M 20 22 L 14 72', 'M 38 22 L 32 72', 'M 8 38 L 44 38', 'M 6 56 L 42 56'] },
  '$': { w: 50, strokes: ['M 41 30 C 37 21 13 20 11 32 C 9 43 42 45 42 59 C 42 72 16 74 10 64', 'M 26 14 L 26 80'] },
  '%': {
    w: 56,
    strokes: [
      'M 16 22 C 9 22 9 36 16 36 C 23 36 23 22 16 22',
      'M 44 20 L 12 74',
      'M 40 58 C 33 58 33 72 40 72 C 47 72 47 58 40 58',
    ],
  },
  '+': { w: 46, strokes: ['M 23 34 L 23 66', 'M 8 50 L 38 50'] },
  '=': { w: 46, strokes: ['M 8 42 L 38 42', 'M 8 58 L 38 58'] },
  '*': { w: 40, strokes: ['M 20 24 L 20 50', 'M 9 30 L 31 44', 'M 31 30 L 9 44'] },
};

export interface LaidOutStroke {
  id: string;
  d: string;
  char: string;
  charIdx: number;
  strokeIdx: number;
  offsetX: number;
}

export const ENGLISH_HANDWRITING_FONT = '"Patrick Hand", "Comic Sans MS", cursive, system-ui, sans-serif';

/**
 * Shifts X by dx and applies a subtle natural right-hand penmanship slant (~5° anchored at y=74)
 * plus a gentle organic micro-bow on straight L segments so strokes look genuinely handwritten
 * (matching Patrick Hand) rather than stiff CAD lines.
 */
function toHandwrittenLatinPath(d: string, dx: number): string {
  const tokens = d.trim().split(/\s+/);
  const out: string[] = [];
  const slantX = (x: number, y: number) => +(x + dx + (74 - y) * 0.088).toFixed(2);
  let curX = 0;
  let curY = 74;
  let i = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M') {
      const rx = Number(tokens[i + 1]);
      const ry = Number(tokens[i + 2]);
      curX = slantX(rx, ry);
      curY = ry;
      out.push('M', String(curX), String(curY));
      i += 3;
    } else if (cmd === 'L') {
      const rx = Number(tokens[i + 1]);
      const ry = Number(tokens[i + 2]);
      const nx = slantX(rx, ry);
      const ny = ry;
      const len = Math.hypot(nx - curX, ny - curY);
      if (len > 10) {
        // Gentle organic hand bow (slight leftward curve on downstrokes, slight upward arc on crossbars)
        const isHoriz = Math.abs(nx - curX) > Math.abs(ny - curY);
        const mx = +((curX + nx) / 2 + (isHoriz ? 0 : -0.9)).toFixed(2);
        const my = +((curY + ny) / 2 + (isHoriz ? -0.8 : 0.4)).toFixed(2);
        out.push('Q', String(mx), String(my), String(nx), String(ny));
      } else {
        out.push('L', String(nx), String(ny));
      }
      curX = nx;
      curY = ny;
      i += 3;
    } else if (cmd === 'C') {
      const x1 = slantX(Number(tokens[i + 1]), Number(tokens[i + 2]));
      const y1 = Number(tokens[i + 2]);
      const x2 = slantX(Number(tokens[i + 3]), Number(tokens[i + 4]));
      const y2 = Number(tokens[i + 4]);
      const x = slantX(Number(tokens[i + 5]), Number(tokens[i + 6]));
      const y = Number(tokens[i + 6]);
      out.push('C', String(x1), String(y1), String(x2), String(y2), String(x), String(y));
      curX = x;
      curY = y;
      i += 7;
    } else if (cmd === 'Q') {
      const x1 = slantX(Number(tokens[i + 1]), Number(tokens[i + 2]));
      const y1 = Number(tokens[i + 2]);
      const x = slantX(Number(tokens[i + 3]), Number(tokens[i + 4]));
      const y = Number(tokens[i + 4]);
      out.push('Q', String(x1), String(y1), String(x), String(y));
      curX = x;
      curY = y;
      i += 5;
    } else {
      out.push(cmd);
      i++;
    }
  }
  return out.join(' ');
}

export function layoutEnglishWord(word: string): {
  strokes: LaidOutStroke[];
  viewWidth: number;
} {
  const paddingX = 18;
  let cursorX = paddingX;
  const strokes: LaidOutStroke[] = [];
  const chars = Array.from(word);

  chars.forEach((ch, charIdx) => {
    if (ch === ' ') {
      cursorX += 26;
      return;
    }
    const glyph = LATIN_PEN_GLYPHS[ch] || LATIN_PEN_GLYPHS[ch.toLowerCase()];
    if (!glyph) {
      cursorX += 18;
      return;
    }
    glyph.strokes.forEach((rawD, strokeIdx) => {
      strokes.push({
        id: `${charIdx}-${strokeIdx}`,
        d: toHandwrittenLatinPath(rawD, cursorX),
        char: ch,
        charIdx,
        strokeIdx,
        offsetX: cursorX,
      });
    });
    cursorX += glyph.w;
  });

  return {
    strokes,
    viewWidth: Math.max(240, cursorX + paddingX + 6),
  };
}
