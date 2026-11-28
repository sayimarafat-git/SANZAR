import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import * as UTIF from 'utif2';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  Presentation,
} from 'lucide-react';

const EMU_PER_PT = 12700;
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type ThemeColors = Record<string, string>;

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSizePt?: number;
  superscript?: boolean;
  subscript?: boolean;
}

interface TextParagraph {
  align?: 'left' | 'center' | 'right' | 'justify';
  bullet?: string;
  marginLeftPt?: number;
  indentPt?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineHeight?: number;
  emptyFontSizePt?: number;
  runs: TextRun[];
}

interface SlideElement {
  kind: 'image' | 'shape' | 'line' | 'table';
  x: number; // pt
  y: number; // pt
  w: number; // pt
  h: number; // pt
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
  src?: string;
  crop?: [number, number, number, number]; // left, top, right, bottom fractions 0..1
  fill?: string;
  gradient?: string;
  borderColor?: string;
  borderWidthPt?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderRadiusPx?: string;
  vAlign?: 'top' | 'center' | 'bottom';
  wrap?: boolean;
  pad?: [number, number, number, number]; // top, right, bottom, left in pt
  paragraphs?: TextParagraph[];
  rows?: { cells: { text: string; bg?: string; color?: string; bold?: boolean; align?: string }[] }[];
}

interface ParsedSlide {
  index: number;
  bgColor?: string;
  bgGradient?: string;
  bgImage?: string;
  elements: SlideElement[];
  titlePreview: string;
}

interface ParsedDeck {
  widthPt: number;
  heightPt: number;
  slides: ParsedSlide[];
  blobUrls: string[];
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

const DEFAULT_THEME: ThemeColors = {
  dk1: '#000000',
  lt1: '#ffffff',
  dk2: '#44546a',
  lt2: '#e7e6e6',
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a5a5a5',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  hlink: '#0563c1',
  folHlink: '#954f72',
  tx1: '#000000',
  tx2: '#44546a',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
};

function localName(node: Element): string {
  return node.localName || node.tagName.split(':').pop() || '';
}

function directChildren(parent: Element | null | undefined, name?: string): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (!name || localName(ch) === name) out.push(ch);
  }
  return out;
}

function firstChild(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    if (localName(parent.children[i]) === name) return parent.children[i];
  }
  return null;
}

function firstDescendant(parent: Element | null | undefined, name: string): Element | null {
  if (!parent) return null;
  const list = parent.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    if (localName(list[i]) === name) return list[i];
  }
  return null;
}

function getRelId(el: Element | null | undefined, attr = 'embed'): string | null {
  if (!el) return null;
  return el.getAttribute(`r:${attr}`) || el.getAttributeNS(REL_NS, attr) || el.getAttribute(attr);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function applyColorTransforms(baseHex: string, colorEl: Element): string {
  let [r, g, b] = hexToRgb(baseHex);
  let [h, s, l] = rgbToHsl(r, g, b);
  let alpha = 1;

  for (const mod of directChildren(colorEl)) {
    const ln = localName(mod);
    const val = Number(mod.getAttribute('val') || 0) / 100000;
    if (ln === 'lumMod') l *= val;
    else if (ln === 'lumOff') l += val;
    else if (ln === 'tint') {
      r = r + (255 - r) * (1 - val);
      g = g + (255 - g) * (1 - val);
      b = b + (255 - b) * (1 - val);
      [h, s, l] = rgbToHsl(r, g, b);
    } else if (ln === 'shade') {
      r *= val;
      g *= val;
      b *= val;
      [h, s, l] = rgbToHsl(r, g, b);
    } else if (ln === 'alpha') {
      alpha = Math.max(0, Math.min(1, val));
    }
  }

  l = Math.max(0, Math.min(1, l));
  [r, g, b] = hslToRgb(h, s, l);
  if (alpha < 0.999) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha.toFixed(3)})`;
  }
  return rgbToHex(r, g, b);
}

function parseColor(container: Element | null | undefined, theme: ThemeColors): string | undefined {
  if (!container) return undefined;
  const srgb = firstChild(container, 'srgbClr') || firstDescendant(container, 'srgbClr');
  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val && /^[0-9A-Fa-f]{6}$/.test(val)) return applyColorTransforms(`#${val}`, srgb);
  }
  const sys = firstChild(container, 'sysClr') || firstDescendant(container, 'sysClr');
  if (sys) {
    const last = sys.getAttribute('lastClr');
    const base = last && /^[0-9A-Fa-f]{6}$/.test(last) ? `#${last}` : '#000000';
    return applyColorTransforms(base, sys);
  }
  const scheme = firstChild(container, 'schemeClr') || firstDescendant(container, 'schemeClr');
  if (scheme) {
    const key = scheme.getAttribute('val') || '';
    const base = theme[key] || DEFAULT_THEME[key] || '#1e293b';
    return applyColorTransforms(base, scheme);
  }
  const prst = firstChild(container, 'prstClr') || firstDescendant(container, 'prstClr');
  if (prst) {
    const val = prst.getAttribute('val');
    if (val === 'white') return '#ffffff';
    if (val === 'black') return '#000000';
    if (val === 'red') return '#dc2626';
  }
  return undefined;
}

function parseGradient(gradFill: Element | null | undefined, theme: ThemeColors): string | undefined {
  if (!gradFill) return undefined;
  const gsLst = firstChild(gradFill, 'gsLst');
  if (!gsLst) return undefined;
  const stops: { pos: number; color: string }[] = [];
  for (const gs of directChildren(gsLst, 'gs')) {
    const pos = Math.max(0, Math.min(100, Math.round(Number(gs.getAttribute('pos') || 0) / 1000)));
    const col = parseColor(gs, theme);
    if (col) stops.push({ pos, color: col });
  }
  if (stops.length < 2) return stops[0]?.color;
  stops.sort((a, b) => a.pos - b.pos);
  const lin = firstChild(gradFill, 'lin');
  const angAttr = lin?.getAttribute('ang');
  // OOXML angle: 0 = left-to-right (90deg in CSS), 5400000 = top-to-bottom (180deg in CSS)
  const cssDeg = angAttr ? (Math.round(Number(angAttr) / 60000) + 90) % 360 : 180;
  return `linear-gradient(${cssDeg}deg, ${stops.map((s) => `${s.color} ${s.pos}%`).join(', ')})`;
}

function resolveRelTarget(basePath: string, target: string): string {
  if (!target) return '';
  if (target.startsWith('/')) return target.slice(1);
  const parts = basePath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

interface RelEntry {
  target: string;
  type: string;
}

async function parseRelsFull(zip: JSZip, ownerPath: string): Promise<Record<string, RelEntry>> {
  const relsPath = ownerPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const file = zip.file(relsPath);
  if (!file) return {};
  const xml = await file.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const map: Record<string, RelEntry> = {};
  const rels = doc.getElementsByTagName('*');
  for (let i = 0; i < rels.length; i++) {
    const el = rels[i];
    if (localName(el) !== 'Relationship') continue;
    const id = el.getAttribute('Id');
    const target = el.getAttribute('Target');
    const type = el.getAttribute('Type') || '';
    if (id && target) {
      map[id] = {
        target: target.startsWith('http') ? target : resolveRelTarget(ownerPath, target),
        type,
      };
    }
  }
  return map;
}

async function parseTheme(zip: JSZip, themePath: string): Promise<ThemeColors> {
  const colors: ThemeColors = { ...DEFAULT_THEME };
  const f = zip.file(themePath);
  if (!f) return colors;
  const xml = await f.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const clrScheme = firstDescendant(doc.documentElement, 'clrScheme');
  if (clrScheme) {
    for (const ch of directChildren(clrScheme)) {
      const name = localName(ch);
      const c = parseColor(ch, colors);
      if (c) colors[name] = c;
    }
  }
  colors.tx1 = colors.dk1;
  colors.tx2 = colors.dk2;
  colors.bg1 = colors.lt1;
  colors.bg2 = colors.lt2;
  return colors;
}

function applyClrMap(theme: ThemeColors, clrMapEl: Element | null): ThemeColors {
  if (!clrMapEl) return theme;
  const out = { ...theme };
  for (const k of ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
    const mapped = clrMapEl.getAttribute(k);
    if (mapped && out[mapped]) out[k] = out[mapped];
  }
  return out;
}

async function decodeTiffToPngBlob(bytes: Uint8Array): Promise<Blob | null> {
  try {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = UTIF.decode(ab);
    if (!ifds || ifds.length === 0) return null;
    UTIF.decodeImage(ab, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const w = ifds[0].width;
    const h = ifds[0].height;
    if (!w || !h || !rgba) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
    ctx.putImageData(imgData, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}

function parseSpacingPts(spcContainer: Element | null | undefined, baseFontPt: number): number | undefined {
  if (!spcContainer) return undefined;
  const pts = firstChild(spcContainer, 'spcPts');
  if (pts) return Number(pts.getAttribute('val') || 0) / 100;
  const pct = firstChild(spcContainer, 'spcPct');
  if (pct) return (Number(pct.getAttribute('val') || 0) / 100000) * baseFontPt;
  return undefined;
}

function parseParagraphs(txBody: Element, theme: ThemeColors, defaultColor?: string, defaultFontPt = 18): TextParagraph[] {
  const out: TextParagraph[] = [];
  const pNodes = directChildren(txBody, 'p');

  for (const p of pNodes) {
    const pPr = firstChild(p, 'pPr');
    let align: TextParagraph['align'];
    const algn = pPr?.getAttribute('algn');
    if (algn === 'ctr') align = 'center';
    else if (algn === 'r') align = 'right';
    else if (algn === 'just' || algn === 'dist') align = 'justify';
    else if (algn === 'l') align = 'left';

    const marL = pPr?.getAttribute('marL');
    const indent = pPr?.getAttribute('indent');
    const marginLeftPt = marL != null ? Number(marL) / EMU_PER_PT : undefined;
    const indentPt = indent != null ? Number(indent) / EMU_PER_PT : undefined;

    let bullet: string | undefined;
    if (pPr && !firstChild(pPr, 'buNone')) {
      const buChar = firstChild(pPr, 'buChar');
      const buAuto = firstChild(pPr, 'buAutoNum');
      if (buChar) bullet = buChar.getAttribute('char') || '•';
      else if (buAuto) bullet = '•';
    }

    const defRPr = pPr ? firstChild(pPr, 'defRPr') : null;
    const endParaRPr = firstChild(p, 'endParaRPr');
    const fallbackSzAttr = defRPr?.getAttribute('sz') || endParaRPr?.getAttribute('sz');
    const paraBasePt = fallbackSzAttr ? Math.max(6, Math.min(120, Number(fallbackSzAttr) / 100)) : defaultFontPt;

    let lineHeight: number | undefined;
    const lnSpc = pPr ? firstChild(pPr, 'lnSpc') : null;
    if (lnSpc) {
      const spcPct = firstChild(lnSpc, 'spcPct');
      const spcPts = firstChild(lnSpc, 'spcPts');
      if (spcPct) lineHeight = Math.max(0.85, Math.min(3, (Number(spcPct.getAttribute('val') || 100000) / 100000) * 1.2));
      else if (spcPts) lineHeight = Math.max(0.85, (Number(spcPts.getAttribute('val') || 0) / 100) / paraBasePt);
    }

    const spaceBeforePt = pPr ? parseSpacingPts(firstChild(pPr, 'spcBef'), paraBasePt) : undefined;
    const spaceAfterPt = pPr ? parseSpacingPts(firstChild(pPr, 'spcAft'), paraBasePt) : undefined;

    const runs: TextRun[] = [];
    for (const child of directChildren(p)) {
      const ln = localName(child);
      if (ln === 'r' || ln === 'fld') {
        const tNode = firstChild(child, 't');
        const text = tNode?.textContent ?? '';
        if (!text) continue;
        const rPr = firstChild(child, 'rPr');
        const szAttr = rPr?.getAttribute('sz') || defRPr?.getAttribute('sz');
        const fontSizePt = szAttr ? Math.max(6, Math.min(120, Number(szAttr) / 100)) : paraBasePt;
        const fillNode = (rPr && firstChild(rPr, 'solidFill')) || (defRPr && firstChild(defRPr, 'solidFill'));
        const baseline = Number(rPr?.getAttribute('baseline') || 0);
        runs.push({
          text,
          bold: rPr?.getAttribute('b') === '1' || defRPr?.getAttribute('b') === '1',
          italic: rPr?.getAttribute('i') === '1' || defRPr?.getAttribute('i') === '1',
          underline: Boolean(rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none'),
          color: parseColor(fillNode, theme) || defaultColor || theme.tx1 || '#1e293b',
          fontSizePt,
          superscript: baseline > 0,
          subscript: baseline < 0,
        });
      } else if (ln === 'br') {
        runs.push({ text: '\n', fontSizePt: paraBasePt });
      }
    }

    // Preserve empty paragraphs (<a:p> spacers) so multi-line layouts keep exact vertical spacing!
    out.push({
      align,
      bullet: runs.length > 0 ? bullet : undefined,
      marginLeftPt,
      indentPt,
      spaceBeforePt,
      spaceAfterPt,
      lineHeight,
      emptyFontSizePt: runs.length === 0 ? paraBasePt : undefined,
      runs,
    });
  }

  return out;
}

interface EmuBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
}

function parseXfrm(xfrm: Element | null | undefined, allowZeroExtent = false): EmuBox | null {
  if (!xfrm) return null;
  const off = firstChild(xfrm, 'off');
  const ext = firstChild(xfrm, 'ext');
  if (!off || !ext) return null;
  const x = Number(off.getAttribute('x') || 0);
  const y = Number(off.getAttribute('y') || 0);
  const w = Number(ext.getAttribute('cx') || 0);
  const h = Number(ext.getAttribute('cy') || 0);
  if (!allowZeroExtent && (w <= 0 || h <= 0)) return null;
  if (allowZeroExtent && w <= 0 && h <= 0) return null;
  const rotAttr = xfrm.getAttribute('rot');
  return {
    x,
    y,
    w,
    h,
    rot: rotAttr ? Number(rotAttr) / 60000 : undefined,
    flipH: xfrm.getAttribute('flipH') === '1',
    flipV: xfrm.getAttribute('flipV') === '1',
  };
}

interface PtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function mapBoxToPt(raw: EmuBox, parentPt: PtBox, childSpaceEmu: PtBox): PtBox {
  const cw = childSpaceEmu.w || 1;
  const ch = childSpaceEmu.h || 1;
  return {
    x: parentPt.x + ((raw.x - childSpaceEmu.x) / cw) * parentPt.w,
    y: parentPt.y + ((raw.y - childSpaceEmu.y) / ch) * parentPt.h,
    w: (raw.w / cw) * parentPt.w,
    h: (raw.h / ch) * parentPt.h,
  };
}

interface PhDef {
  box: EmuBox;
  type: string;
  idx: string;
  align?: TextParagraph['align'];
  vAlign?: SlideElement['vAlign'];
  defaultFontPt: number;
}

function getPhKey(sp: Element): { type: string; idx: string } | null {
  const nvSpPr = firstChild(sp, 'nvSpPr');
  const nvPr = nvSpPr ? firstChild(nvSpPr, 'nvPr') : null;
  const ph = nvPr ? firstChild(nvPr, 'ph') : null;
  if (!ph) return null;
  return {
    type: ph.getAttribute('type') || '',
    idx: ph.getAttribute('idx') || '',
  };
}

function isPlaceholderShape(sp: Element): boolean {
  return getPhKey(sp) !== null;
}

function extractPlaceholders(doc: Document | null): PhDef[] {
  if (!doc) return [];
  const out: PhDef[] = [];
  const spTree = firstDescendant(doc.documentElement, 'spTree');
  if (!spTree) return out;
  for (const sp of directChildren(spTree, 'sp')) {
    const pk = getPhKey(sp);
    if (!pk) continue;
    const spPr = firstChild(sp, 'spPr');
    const box = parseXfrm(spPr ? firstChild(spPr, 'xfrm') : null);
    if (!box) continue;
    const txBody = firstChild(sp, 'txBody');
    const bodyPr = txBody ? firstChild(txBody, 'bodyPr') : null;
    const anchor = bodyPr?.getAttribute('anchor');
    const vAlign: SlideElement['vAlign'] = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'bottom' : 'top';
    const p0 = txBody ? firstChild(txBody, 'p') : null;
    const algn = p0 ? firstChild(p0, 'pPr')?.getAttribute('algn') : null;
    const align: TextParagraph['align'] =
      algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : pk.type === 'ctrTitle' ? 'center' : undefined;
    const isTitle = pk.type === 'title' || pk.type === 'ctrTitle';
    out.push({
      box,
      type: pk.type,
      idx: pk.idx,
      align,
      vAlign,
      defaultFontPt: isTitle ? 32 : pk.type === 'subTitle' ? 22 : 20,
    });
  }
  return out;
}

function matchPlaceholder(pk: { type: string; idx: string } | null, layoutPhs: PhDef[], masterPhs: PhDef[]): PhDef | null {
  if (!pk) return null;
  for (const list of [layoutPhs, masterPhs]) {
    if (pk.type && pk.idx) {
      const m = list.find((p) => p.type === pk.type && p.idx === pk.idx);
      if (m) return m;
    }
    if (pk.idx) {
      const m = list.find((p) => p.idx === pk.idx);
      if (m) return m;
    }
    if (pk.type) {
      const m = list.find((p) => p.type === pk.type || (pk.type === 'body' && p.type === 'obj'));
      if (m) return m;
    }
  }
  return null;
}

function parseCropRect(container: Element): [number, number, number, number] | undefined {
  const srcRect = firstDescendant(container, 'srcRect');
  if (!srcRect) return undefined;
  const l = Math.max(0, Math.min(0.9, Number(srcRect.getAttribute('l') || 0) / 100000));
  const t = Math.max(0, Math.min(0.9, Number(srcRect.getAttribute('t') || 0) / 100000));
  const r = Math.max(0, Math.min(0.9, Number(srcRect.getAttribute('r') || 0) / 100000));
  const b = Math.max(0, Math.min(0.9, Number(srcRect.getAttribute('b') || 0) / 100000));
  if (l === 0 && t === 0 && r === 0 && b === 0) return undefined;
  if (l + r >= 0.98 || t + b >= 0.98) return undefined;
  return [l, t, r, b];
}

function resolveBlipRelId(container: Element): string | null {
  const blip = firstDescendant(container, 'blip');
  if (!blip) return null;
  // Prefer high-DPI vector SVG blip when Office provides both PNG + SVG
  const svgBlip = firstDescendant(blip, 'svgBlip');
  if (svgBlip) {
    const svgId = getRelId(svgBlip, 'embed');
    if (svgId) return svgId;
  }
  return getRelId(blip, 'embed') || getRelId(blip, 'link');
}

async function parsePptxBuffer(buffer: ArrayBuffer): Promise<ParsedDeck> {
  const zip = await JSZip.loadAsync(buffer);
  const blobUrls: string[] = [];
  const mediaCache = new Map<string, string | null>();

  async function getMediaUrl(zipPath: string): Promise<string | undefined> {
    if (!zipPath || zipPath.startsWith('http')) return undefined;
    if (mediaCache.has(zipPath)) return mediaCache.get(zipPath) || undefined;
    const f = zip.file(zipPath);
    if (!f) {
      mediaCache.set(zipPath, null);
      return undefined;
    }
    const ext = zipPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'emf' || ext === 'wmf' || ext === 'wdp' || ext === 'mp3' || ext === 'wav' || ext === 'm4a') {
      mediaCache.set(zipPath, null);
      return undefined;
    }
    const bytes = await f.async('uint8array');
    if (ext === 'tif' || ext === 'tiff') {
      const pngBlob = await decodeTiffToPngBlob(bytes);
      if (!pngBlob) {
        mediaCache.set(zipPath, null);
        return undefined;
      }
      const url = URL.createObjectURL(pngBlob);
      mediaCache.set(zipPath, url);
      blobUrls.push(url);
      return url;
    }
    const mime = MIME_BY_EXT[ext] || 'image/png';
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    mediaCache.set(zipPath, url);
    blobUrls.push(url);
    return url;
  }

  // 1. Read presentation.xml for slide dimensions (EMUs) and slide order
  let slideCx = 12192000;
  let slideCy = 6858000;
  let slidePaths: string[] = [];

  const presFile = zip.file('ppt/presentation.xml');
  if (presFile) {
    const presXml = await presFile.async('text');
    const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
    const sldSz = firstDescendant(presDoc.documentElement, 'sldSz');
    if (sldSz) {
      const cx = Number(sldSz.getAttribute('cx') || 0);
      const cy = Number(sldSz.getAttribute('cy') || 0);
      if (cx > 0 && cy > 0) {
        slideCx = cx;
        slideCy = cy;
      }
    }
    const presRels = await parseRelsFull(zip, 'ppt/presentation.xml');
    const sldIds = presDoc.getElementsByTagName('*');
    for (let i = 0; i < sldIds.length; i++) {
      if (localName(sldIds[i]) !== 'sldId') continue;
      const rId = getRelId(sldIds[i], 'id');
      if (rId && presRels[rId]) slidePaths.push(presRels[rId].target);
    }
  }

  if (slidePaths.length === 0) {
    slidePaths = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
  }

  const widthPt = slideCx / EMU_PER_PT;
  const heightPt = slideCy / EMU_PER_PT;

  // Cache parsed master/theme per master path
  const themeCache = new Map<string, ThemeColors>();
  async function getMasterTheme(masterPath: string, masterDoc: Document): Promise<ThemeColors> {
    if (themeCache.has(masterPath)) return themeCache.get(masterPath)!;
    const masterRels = await parseRelsFull(zip, masterPath);
    const themeRel = Object.values(masterRels).find((r) => r.type.endsWith('/theme'));
    const rawTheme = themeRel ? await parseTheme(zip, themeRel.target) : { ...DEFAULT_THEME };
    const clrMap = firstDescendant(masterDoc.documentElement, 'clrMap');
    const mapped = applyClrMap(rawTheme, clrMap);
    themeCache.set(masterPath, mapped);
    return mapped;
  }

  async function extractBg(doc: Document, rels: Record<string, RelEntry>, theme: ThemeColors) {
    const cSld = firstDescendant(doc.documentElement, 'cSld');
    const bgNode = cSld ? firstChild(cSld, 'bg') : null;
    if (!bgNode) return null;
    const bgPr = firstChild(bgNode, 'bgPr');
    const bgRef = firstChild(bgNode, 'bgRef');
    const target = bgPr || bgRef;
    if (!target) return null;

    const blipFill = firstChild(target, 'blipFill');
    if (blipFill) {
      const rId = resolveBlipRelId(blipFill);
      if (rId && rels[rId]) {
        const bgImage = await getMediaUrl(rels[rId].target);
        if (bgImage) return { bgImage };
      }
    }
    const grad = firstChild(target, 'gradFill');
    if (grad) {
      const bgGradient = parseGradient(grad, theme);
      if (bgGradient) return { bgGradient };
    }
    const solid = firstChild(target, 'solidFill') || bgRef;
    const bgColor = parseColor(solid, theme);
    if (bgColor) return { bgColor };
    return null;
  }

  async function walkShapes(
    container: Element,
    rels: Record<string, RelEntry>,
    theme: ThemeColors,
    parentPt: PtBox,
    childSpaceEmu: PtBox,
    skipPlaceholders: boolean,
    layoutPhs: PhDef[],
    masterPhs: PhDef[],
    out: SlideElement[]
  ) {
    for (const node of directChildren(container)) {
      // Unwrap mc:AlternateContent -> mc:Choice or mc:Fallback
      if (localName(node) === 'AlternateContent') {
        const choice = firstChild(node, 'Choice') || firstChild(node, 'Fallback');
        if (choice) {
          await walkShapes(choice, rels, theme, parentPt, childSpaceEmu, skipPlaceholders, layoutPhs, masterPhs, out);
        }
        continue;
      }

      const ln = localName(node);

      if (ln === 'grpSp') {
        const grpSpPr = firstChild(node, 'grpSpPr');
        const xfrm = grpSpPr ? firstChild(grpSpPr, 'xfrm') : null;
        const raw = parseXfrm(xfrm);
        if (raw && xfrm) {
          const chOff = firstChild(xfrm, 'chOff');
          const chExt = firstChild(xfrm, 'chExt');
          const nextParentPt = mapBoxToPt(raw, parentPt, childSpaceEmu);
          const nextChildEmu: PtBox = {
            x: Number(chOff?.getAttribute('x') || 0),
            y: Number(chOff?.getAttribute('y') || 0),
            w: Number(chExt?.getAttribute('cx') || raw.w) || raw.w,
            h: Number(chExt?.getAttribute('cy') || raw.h) || raw.h,
          };
          await walkShapes(node, rels, theme, nextParentPt, nextChildEmu, skipPlaceholders, layoutPhs, masterPhs, out);
        } else {
          await walkShapes(node, rels, theme, parentPt, childSpaceEmu, skipPlaceholders, layoutPhs, masterPhs, out);
        }
        continue;
      }

      if (ln === 'pic') {
        const pk = getPhKey(node);
        if (skipPlaceholders && pk) continue;
        const spPr = firstChild(node, 'spPr');
        const xfrm = spPr ? firstChild(spPr, 'xfrm') : null;
        const inherited = !xfrm ? matchPlaceholder(pk, layoutPhs, masterPhs) : null;
        const raw = parseXfrm(xfrm) || inherited?.box || null;
        const rId = resolveBlipRelId(node);
        if (raw && rId && rels[rId]) {
          const pt = mapBoxToPt(raw, parentPt, childSpaceEmu);
          // Skip off-canvas hidden media icons (e.g., y < 0 audio triggers)
          if (pt.x + pt.w <= 0 || pt.y + pt.h <= 0 || pt.x >= widthPt || pt.y >= heightPt) continue;
          const src = await getMediaUrl(rels[rId].target);
          if (src) {
            out.push({
              kind: 'image',
              ...pt,
              rot: raw.rot,
              flipH: raw.flipH,
              flipV: raw.flipV,
              src,
              crop: parseCropRect(node),
            });
          }
        }
        continue;
      }

      if (ln === 'cxnSp') {
        const spPr = firstChild(node, 'spPr');
        const xfrm = spPr ? firstChild(spPr, 'xfrm') : null;
        const raw = parseXfrm(xfrm, true);
        if (!raw) continue;
        const pt = mapBoxToPt(raw, parentPt, childSpaceEmu);
        const lnNode = spPr ? firstChild(spPr, 'ln') : null;
        if (lnNode && firstChild(lnNode, 'noFill')) continue;
        const styleLnRef = firstDescendant(node, 'lnRef');
        const strokeColor =
          parseColor(lnNode ? firstChild(lnNode, 'solidFill') : null, theme) ||
          parseColor(styleLnRef, theme) ||
          '#cbd5e1';
        const wAttr = lnNode?.getAttribute('w');
        const strokePt = wAttr ? Math.max(0.75, Number(wAttr) / EMU_PER_PT) : 1;
        const dashVal = firstDescendant(lnNode, 'prstDash')?.getAttribute('val') || '';
        const borderStyle: SlideElement['borderStyle'] = dashVal.includes('dot')
          ? 'dotted'
          : dashVal.includes('dash')
            ? 'dashed'
            : 'solid';
        out.push({
          kind: 'line',
          ...pt,
          rot: raw.rot,
          borderColor: strokeColor,
          borderWidthPt: strokePt,
          borderStyle,
        });
        continue;
      }

      if (ln === 'sp') {
        const pk = getPhKey(node);
        if (skipPlaceholders && pk) continue;

        const nvSpPr = firstChild(node, 'nvSpPr');
        const cNvSpPr = nvSpPr ? firstChild(nvSpPr, 'cNvSpPr') : null;
        const isTxBox = cNvSpPr?.getAttribute('txBox') === '1';

        const spPr = firstChild(node, 'spPr');
        const xfrm = spPr ? firstChild(spPr, 'xfrm') : null;
        const inheritedPh = matchPlaceholder(pk, layoutPhs, masterPhs);
        const raw = parseXfrm(xfrm, true) || inheritedPh?.box || null;

        const styleNode = firstChild(node, 'style');
        const fillRef = styleNode ? firstChild(styleNode, 'fillRef') : null;
        const lnRef = styleNode ? firstChild(styleNode, 'lnRef') : null;
        const fontRef = styleNode ? firstChild(styleNode, 'fontRef') : null;
        const styleFontColor = parseColor(fontRef, theme);

        let fill: string | undefined;
        let gradient: string | undefined;
        let shapeImgSrc: string | undefined;

        if (spPr && !firstChild(spPr, 'noFill')) {
          const solid = firstChild(spPr, 'solidFill');
          const grad = firstChild(spPr, 'gradFill');
          const blipFill = firstChild(spPr, 'blipFill');
          if (solid) fill = parseColor(solid, theme);
          else if (grad) gradient = parseGradient(grad, theme);
          else if (blipFill) {
            const rId = resolveBlipRelId(blipFill);
            if (rId && rels[rId]) shapeImgSrc = await getMediaUrl(rels[rId].target);
          } else if (fillRef && Number(fillRef.getAttribute('idx') || 0) > 0) {
            fill = parseColor(fillRef, theme);
          }
        }

        let borderColor: string | undefined;
        let borderWidthPt: number | undefined;
        let borderStyle: SlideElement['borderStyle'] = 'solid';
        const lnNode = spPr ? firstChild(spPr, 'ln') : null;
        if (lnNode && !firstChild(lnNode, 'noFill')) {
          borderColor = parseColor(firstChild(lnNode, 'solidFill'), theme);
          if (!borderColor && lnRef && Number(lnRef.getAttribute('idx') || 0) > 0) {
            borderColor = parseColor(lnRef, theme);
          }
          if (borderColor) {
            const wAttr = lnNode.getAttribute('w');
            borderWidthPt = wAttr ? Math.max(0.75, Number(wAttr) / EMU_PER_PT) : 1;
            const dashVal = firstDescendant(lnNode, 'prstDash')?.getAttribute('val') || '';
            if (dashVal.includes('dot')) borderStyle = 'dotted';
            else if (dashVal.includes('dash')) borderStyle = 'dashed';
          }
        }

        // Geometry radius (roundRect, ellipse, line)
        const prstGeom = spPr ? firstChild(spPr, 'prstGeom') : null;
        const prst = prstGeom?.getAttribute('prst') || 'rect';
        if (prst === 'line' && raw) {
          const pt = mapBoxToPt(raw, parentPt, childSpaceEmu);
          out.push({
            kind: 'line',
            ...pt,
            rot: raw.rot,
            borderColor: borderColor || fill || '#cbd5e1',
            borderWidthPt: borderWidthPt || 1,
            borderStyle,
          });
          continue;
        }

        const txBody = firstChild(node, 'txBody');
        const bodyPr = txBody ? firstChild(txBody, 'bodyPr') : null;
        const rawParagraphs = txBody
          ? parseParagraphs(
              txBody,
              theme,
              styleFontColor || (fill && !isTxBox ? '#ffffff' : undefined),
              inheritedPh?.defaultFontPt || 18
            )
          : [];
        const paragraphs = inheritedPh?.align
          ? rawParagraphs.map((p) => (p.align ? p : { ...p, align: inheritedPh.align }))
          : rawParagraphs;
        const hasVisibleText = paragraphs.some((p) => p.runs.some((r) => r.text.length > 0));

        // Fallback box if slide has unpositioned placeholder not found in layout/master
        const resolvedRaw: EmuBox | null =
          raw ||
          (hasVisibleText && pk
            ? pk.type === 'title' || pk.type === 'ctrTitle'
              ? { x: slideCx * 0.07, y: slideCy * 0.08, w: slideCx * 0.86, h: slideCy * 0.18 }
              : { x: slideCx * 0.07, y: slideCy * 0.28, w: slideCx * 0.86, h: slideCy * 0.62 }
            : null);

        if (!resolvedRaw) continue;
        if (!hasVisibleText && !fill && !gradient && !borderColor && !shapeImgSrc) continue;

        const pt = mapBoxToPt(resolvedRaw, parentPt, childSpaceEmu);

        let borderRadiusPx: string | undefined;
        if (prst === 'ellipse') {
          borderRadiusPx = '50%';
        } else if (prst === 'roundRect') {
          const gd = prstGeom ? firstDescendant(prstGeom, 'gd') : null;
          const fmla = gd?.getAttribute('fmla') || '';
          const m = fmla.match(/val\s+(\d+)/);
          const adj = m ? Number(m[1]) / 100000 : 0.16667;
          const rPt = Math.round(Math.min(pt.w, pt.h) * adj);
          borderRadiusPx = `${Math.max(4, rPt)}px`;
        }

        const anchor = bodyPr?.getAttribute('anchor');
        const vAlign: SlideElement['vAlign'] =
          anchor === 'ctr' ? 'center' : anchor === 'b' ? 'bottom' : inheritedPh?.vAlign || 'top';
        const wrapAttr = bodyPr?.getAttribute('wrap');
        const wrap = wrapAttr !== 'none';

        // Default PowerPoint text box insets: lIns=91440 (7.2pt), tIns=45720 (3.6pt)
        // Clamp horizontal inset on narrow columns (e.g. single-syllable Pinyin boxes) so text never wraps prematurely
        const defHorz = pt.w < 75 ? 1.5 : 6;
        const defVert = pt.h < 32 ? 1 : 3.2;
        const lIns = bodyPr?.getAttribute('lIns');
        const rIns = bodyPr?.getAttribute('rIns');
        const tIns = bodyPr?.getAttribute('tIns');
        const bIns = bodyPr?.getAttribute('bIns');
        const pad: [number, number, number, number] = [
          tIns != null ? Number(tIns) / EMU_PER_PT : defVert,
          rIns != null ? Number(rIns) / EMU_PER_PT : defHorz,
          bIns != null ? Number(bIns) / EMU_PER_PT : defVert,
          lIns != null ? Number(lIns) / EMU_PER_PT : defHorz,
        ];

        out.push({
          kind: 'shape',
          ...pt,
          rot: resolvedRaw.rot,
          flipH: resolvedRaw.flipH,
          flipV: resolvedRaw.flipV,
          src: shapeImgSrc,
          fill,
          gradient,
          borderColor,
          borderWidthPt,
          borderStyle,
          borderRadiusPx,
          vAlign,
          wrap,
          pad,
          paragraphs: hasVisibleText ? paragraphs : undefined,
        });
        continue;
      }

      if (ln === 'graphicFrame') {
        const xfrm = firstChild(node, 'xfrm');
        const raw = parseXfrm(xfrm);
        const tbl = firstDescendant(node, 'tbl');
        if (raw && tbl) {
          const pt = mapBoxToPt(raw, parentPt, childSpaceEmu);
          const rows: NonNullable<SlideElement['rows']> = [];
          for (const tr of directChildren(tbl, 'tr')) {
            const cells: { text: string; bg?: string; color?: string; bold?: boolean; align?: string }[] = [];
            for (const tc of directChildren(tr, 'tc')) {
              if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') continue;
              const tcPr = firstChild(tc, 'tcPr');
              const bg = tcPr ? parseColor(firstChild(tcPr, 'solidFill'), theme) : undefined;
              const txBody = firstChild(tc, 'txBody');
              const ps = txBody ? parseParagraphs(txBody, theme) : [];
              const firstRun = ps.flatMap((p) => p.runs)[0];
              cells.push({
                text: ps.map((p) => p.runs.map((r) => r.text).join('')).join('\n').trim(),
                bg,
                color: firstRun?.color,
                bold: firstRun?.bold,
                align: ps[0]?.align,
              });
            }
            if (cells.length > 0) rows.push({ cells });
          }
          if (rows.length > 0) out.push({ kind: 'table', ...pt, rows });
        }
      }
    }
  }

  const rootPt: PtBox = { x: 0, y: 0, w: widthPt, h: heightPt };
  const rootEmu: PtBox = { x: 0, y: 0, w: slideCx, h: slideCy };
  const slides: ParsedSlide[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const sPath = slidePaths[i];
    const sFile = zip.file(sPath);
    if (!sFile) continue;

    const sXml = await sFile.async('text');
    const sDoc = new DOMParser().parseFromString(sXml, 'application/xml');
    const sRels = await parseRelsFull(zip, sPath);

    // Resolve SlideLayout & SlideMaster for accurate theme colors, backgrounds, and frame graphics
    const layoutRel = Object.values(sRels).find((r) => r.type.endsWith('/slideLayout'));
    let layoutDoc: Document | null = null;
    let layoutRels: Record<string, RelEntry> = {};
    let masterDoc: Document | null = null;
    let masterRels: Record<string, RelEntry> = {};
    let theme: ThemeColors = { ...DEFAULT_THEME };

    if (layoutRel && zip.file(layoutRel.target)) {
      layoutDoc = new DOMParser().parseFromString(await zip.file(layoutRel.target)!.async('text'), 'application/xml');
      layoutRels = await parseRelsFull(zip, layoutRel.target);
      const masterRel = Object.values(layoutRels).find((r) => r.type.endsWith('/slideMaster'));
      if (masterRel && zip.file(masterRel.target)) {
        masterDoc = new DOMParser().parseFromString(await zip.file(masterRel.target)!.async('text'), 'application/xml');
        masterRels = await parseRelsFull(zip, masterRel.target);
        theme = await getMasterTheme(masterRel.target, masterDoc);
      }
    }

    // Background inheritance: Slide -> SlideLayout -> SlideMaster
    const bg =
      (await extractBg(sDoc, sRels, theme)) ||
      (layoutDoc ? await extractBg(layoutDoc, layoutRels, theme) : null) ||
      (masterDoc ? await extractBg(masterDoc, masterRels, theme) : null);

    const layoutPhs = extractPlaceholders(layoutDoc);
    const masterPhs = extractPlaceholders(masterDoc);

    const elements: SlideElement[] = [];
    const slideShowMaster = sDoc.documentElement.getAttribute('showMasterSp') !== '0';
    const layoutShowMaster = layoutDoc?.documentElement.getAttribute('showMasterSp') !== '0';

    if (slideShowMaster && layoutShowMaster && masterDoc) {
      const mSpTree = firstDescendant(masterDoc.documentElement, 'spTree');
      if (mSpTree) await walkShapes(mSpTree, masterRels, theme, rootPt, rootEmu, true, [], [], elements);
    }
    if (slideShowMaster && layoutDoc) {
      const lSpTree = firstDescendant(layoutDoc.documentElement, 'spTree');
      if (lSpTree) await walkShapes(lSpTree, layoutRels, theme, rootPt, rootEmu, true, [], [], elements);
    }

    const slideStartIdx = elements.length;
    const sSpTree = firstDescendant(sDoc.documentElement, 'spTree');
    if (sSpTree) await walkShapes(sSpTree, sRels, theme, rootPt, rootEmu, false, layoutPhs, masterPhs, elements);

    const slideOwnText = elements
      .slice(slideStartIdx)
      .filter((e) => e.kind === 'shape' && e.paragraphs?.length)
      .flatMap((e) => e.paragraphs!)
      .map((p) => p.runs.map((r) => r.text).join('').trim())
      .find((t) => t.length > 0);

    slides.push({
      index: i + 1,
      bgColor: bg?.bgColor || theme.bg1 || '#ffffff',
      bgGradient: bg?.bgGradient,
      bgImage: bg?.bgImage,
      elements,
      titlePreview: slideOwnText ? slideOwnText.replace(/\s+/g, ' ').slice(0, 42) : `Slide ${i + 1}`,
    });
  }

  return { widthPt, heightPt, slides, blobUrls };
}

export interface PptxSlideViewerProps {
  url: string;
  title?: string;
}

export const PptxSlideViewer: React.FC<PptxSlideViewerProps> = ({ url, title }) => {
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useOfficeFallback, setUseOfficeFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const isLegacyPpt = /\.ppt(\?|$)/i.test(url) && !/\.pptx(\?|$)/i.test(url);

  useEffect(() => {
    if (isLegacyPpt) {
      setLoading(false);
      setUseOfficeFallback(true);
      return;
    }

    let cancelled = false;
    let createdBlobUrls: string[] = [];

    (async () => {
      setLoading(true);
      setError(null);
      setProgress(null);
      setDeck(null);
      setSlideIdx(0);
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Could not load presentation (HTTP ${res.status})`);

        const total = Number(res.headers.get('content-length') || 0);
        let buffer: ArrayBuffer;

        if (res.body && total > 0) {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) {
              reader.cancel().catch(() => {});
              return;
            }
            if (value) {
              chunks.push(value);
              loaded += value.byteLength;
              setProgress({ loaded, total });
            }
          }
          const combined = new Uint8Array(loaded);
          let offset = 0;
          for (const c of chunks) {
            combined.set(c, offset);
            offset += c.byteLength;
          }
          buffer = combined.buffer;
        } else {
          buffer = await res.arrayBuffer();
        }

        if (cancelled) return;
        const parsed = await parsePptxBuffer(buffer);
        if (cancelled) {
          parsed.blobUrls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        createdBlobUrls = parsed.blobUrls;
        if (parsed.slides.length === 0) {
          throw new Error('No slides found inside this presentation.');
        }
        setDeck(parsed);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to render presentation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [url, isLegacyPpt]);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el || !deck) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / deck.widthPt);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deck, isFullscreen]);

  const totalSlides = deck?.slides.length ?? 0;

  const goPrev = useCallback(() => setSlideIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setSlideIdx((i) => Math.min(Math.max(0, totalSlides - 1), i + 1)),
    [totalSlides]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Home') {
        setSlideIdx(0);
      } else if (e.key === 'End' && totalSlides > 0) {
        setSlideIdx(totalSlides - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, totalSlides]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore fullscreen rejection */
    }
  };

  if (useOfficeFallback) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
          <span className="font-semibold text-sanzar-muted flex items-center gap-1.5">
            <Presentation className="w-4 h-4 text-sanzar-primary" /> Office Online Viewer
          </span>
          <div className="flex items-center gap-2">
            {!isLegacyPpt && (
              <button
                type="button"
                onClick={() => setUseOfficeFallback(false)}
                className="px-2.5 py-1 rounded-lg bg-sanzar-surface border border-sanzar-border font-semibold hover:bg-sanzar-primarySoft"
              >
                Use Built-in Slide Viewer
              </button>
            )}
            <a
              href={url}
              download
              className="px-2.5 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary font-semibold inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
        </div>
        <iframe
          src={officeUrl}
          title={title || 'Presentation'}
          className="w-full h-[75vh] border-0"
          allowFullScreen
        />
      </div>
    );
  }

  if (loading) {
    const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
    const loadedMb = progress ? (progress.loaded / 1048576).toFixed(1) : null;
    const totalMb = progress && progress.total > 0 ? (progress.total / 1048576).toFixed(1) : null;
    return (
      <div className="p-10 sm:p-14 flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="w-8 h-8 text-sanzar-primary animate-spin" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Loading presentation slides…</p>
          {pct !== null && loadedMb && totalMb ? (
            <p className="text-xs text-sanzar-muted">
              {loadedMb} MB / {totalMb} MB ({pct}%)
            </p>
          ) : (
            <p className="text-xs text-sanzar-muted">Rendering slides, typography, and illustrations</p>
          )}
        </div>
        {pct !== null && (
          <div className="w-full max-w-xs h-2 rounded-full bg-sanzar-surface2 overflow-hidden">
            <div
              className="h-full bg-sanzar-primary transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="p-10 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-sanzar-warning" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Could not preview presentation directly</p>
          <p className="text-xs text-sanzar-muted max-w-md mx-auto">{error}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={url}
            download
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download .pptx
          </a>
          <button
            type="button"
            onClick={() => setUseOfficeFallback(true)}
            className="px-4 py-2 rounded-xl border border-sanzar-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-sanzar-surface2"
          >
            <ExternalLink className="w-4 h-4" /> Try Office Online Viewer
          </button>
        </div>
      </div>
    );
  }

  const slide = deck.slides[slideIdx] || deck.slides[0];

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? 'bg-slate-950 p-4 h-screen justify-between' : 'bg-sanzar-surface'}`}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={slideIdx === 0}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft disabled:opacity-40"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold tabular-nums px-1">
            Slide {slideIdx + 1} / {totalSlides}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={slideIdx >= totalSlides - 1}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft disabled:opacity-40"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <select
            aria-label="Jump to slide"
            value={slideIdx}
            onChange={(e) => setSlideIdx(Number(e.target.value))}
            className="hidden sm:block max-w-[220px] px-2 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface text-xs font-medium truncate"
          >
            {deck.slides.map((s, idx) => (
              <option key={s.index} value={idx}>
                {idx + 1}. {s.titlePreview}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={url}
            download
            className="px-2.5 py-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft font-semibold inline-flex items-center gap-1"
            title="Download original .pptx file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download .pptx</span>
          </a>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Slide Stage */}
      <div className="p-2 sm:p-4 bg-slate-900/5 dark:bg-slate-950/60 flex items-center justify-center flex-1 overflow-hidden">
        <div
          ref={stageWrapRef}
          className="w-full max-w-[960px] mx-auto relative shadow-lg rounded-lg overflow-hidden border border-black/10 select-text"
          style={{
            height: `${Math.round(deck.heightPt * scale)}px`,
            backgroundColor: slide.bgColor || '#ffffff',
          }}
        >
          <div
            style={{
              width: `${deck.widthPt}px`,
              height: `${deck.heightPt}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: slide.bgColor || '#ffffff',
              backgroundImage: slide.bgImage
                ? `url(${slide.bgImage})`
                : slide.bgGradient || undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: '#1e293b',
              fontFamily:
                '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Hiragino Sans GB", system-ui, -apple-system, sans-serif',
            }}
          >
            {slide.elements.map((el, idx) => {
              const transforms: string[] = [];
              if (el.rot) transforms.push(`rotate(${el.rot}deg)`);
              if (el.flipH) transforms.push('scaleX(-1)');
              if (el.flipV) transforms.push('scaleY(-1)');

              const baseStyle: React.CSSProperties = {
                position: 'absolute',
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${Math.max(el.w, 0)}px`,
                height: `${Math.max(el.h, 0)}px`,
                transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                boxSizing: 'border-box',
              };

              if (el.kind === 'image' && el.src) {
                if (el.crop) {
                  const [cl, ct, cr, cb] = el.crop;
                  const visW = Math.max(0.05, 1 - cl - cr);
                  const visH = Math.max(0.05, 1 - ct - cb);
                  return (
                    <div key={idx} style={{ ...baseStyle, overflow: 'hidden' }}>
                      <img
                        src={el.src}
                        alt=""
                        style={{
                          position: 'absolute',
                          width: `${(100 / visW).toFixed(2)}%`,
                          height: `${(100 / visH).toFixed(2)}%`,
                          left: `${((-cl / visW) * 100).toFixed(2)}%`,
                          top: `${((-ct / visH) * 100).toFixed(2)}%`,
                          maxWidth: 'none',
                        }}
                        draggable={false}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <img
                    key={idx}
                    src={el.src}
                    alt=""
                    style={{ ...baseStyle, objectFit: 'contain' }}
                    draggable={false}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                );
              }

              if (el.kind === 'line') {
                const isHoriz = el.w >= el.h;
                return (
                  <div
                    key={idx}
                    style={{
                      ...baseStyle,
                      width: isHoriz ? `${el.w}px` : '0px',
                      height: isHoriz ? '0px' : `${el.h}px`,
                      borderTop: isHoriz
                        ? `${el.borderWidthPt || 1}px ${el.borderStyle || 'solid'} ${el.borderColor || '#cbd5e1'}`
                        : undefined,
                      borderLeft: !isHoriz
                        ? `${el.borderWidthPt || 1}px ${el.borderStyle || 'solid'} ${el.borderColor || '#cbd5e1'}`
                        : undefined,
                    }}
                  />
                );
              }

              if (el.kind === 'table' && el.rows) {
                return (
                  <div key={idx} style={{ ...baseStyle, overflow: 'visible' }}>
                    <table className="w-full h-full border-collapse text-[14px] bg-white/95 text-slate-900">
                      <tbody>
                        {el.rows.map((row, ri) => (
                          <tr key={ri} className={ri === 0 ? 'font-bold' : ''}>
                            {row.cells.map((cell, ci) => (
                              <td
                                key={ci}
                                style={{
                                  backgroundColor: cell.bg || (ri === 0 ? '#f1f5f9' : undefined),
                                  color: cell.color || '#1e293b',
                                  fontWeight: cell.bold ? 700 : undefined,
                                  textAlign: (cell.align as any) || 'left',
                                }}
                                className="border border-slate-300 px-2 py-1 align-middle whitespace-pre-wrap"
                              >
                                {cell.text}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              const pad = el.pad || [3, 6, 3, 6];
              const isStyledBox = Boolean(el.fill || el.gradient || el.borderColor || el.src);

              return (
                <div
                  key={idx}
                  style={{
                    ...baseStyle,
                    backgroundColor: el.fill || 'transparent',
                    backgroundImage: el.src
                      ? `url(${el.src})`
                      : el.gradient || undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: el.borderColor
                      ? `${el.borderWidthPt || 1}px ${el.borderStyle || 'solid'} ${el.borderColor}`
                      : undefined,
                    borderRadius: el.borderRadiusPx,
                    padding: `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`,
                    overflow: 'visible',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent:
                      el.vAlign === 'center'
                        ? 'center'
                        : el.vAlign === 'bottom'
                          ? 'flex-end'
                          : 'flex-start',
                    pointerEvents: isStyledBox && !el.paragraphs ? 'none' : undefined,
                  }}
                >
                  {el.paragraphs?.map((p, pi) => (
                    <div
                      key={pi}
                      style={{
                        textAlign: p.align || 'left',
                        marginTop: p.spaceBeforePt ? `${p.spaceBeforePt}px` : '0px',
                        marginBottom: p.spaceAfterPt ? `${p.spaceAfterPt}px` : '0px',
                        paddingLeft: p.marginLeftPt ? `${p.marginLeftPt}px` : undefined,
                        textIndent: p.indentPt ? `${p.indentPt}px` : undefined,
                        lineHeight: p.lineHeight || 1.22,
                        whiteSpace: el.wrap === false ? 'pre' : 'pre-wrap',
                        wordBreak: 'normal',
                        overflowWrap: 'break-word',
                        fontSize: p.emptyFontSizePt ? `${p.emptyFontSizePt}px` : undefined,
                      }}
                    >
                      {p.runs.length === 0 ? (
                        '\u00A0'
                      ) : (
                        <>
                          {p.bullet && <span className="mr-1">{p.bullet}</span>}
                          {p.runs.map((r, ri) =>
                            r.text === '\n' ? (
                              <br key={ri} />
                            ) : (
                              <span
                                key={ri}
                                style={{
                                  fontWeight: r.bold ? 700 : 400,
                                  fontStyle: r.italic ? 'italic' : 'normal',
                                  textDecoration: r.underline ? 'underline' : 'none',
                                  color: r.color || '#1e293b',
                                  fontSize: r.fontSizePt
                                    ? `${r.superscript || r.subscript ? Math.round(r.fontSizePt * 0.68) : r.fontSizePt}px`
                                    : '18px',
                                  verticalAlign: r.superscript ? 'super' : r.subscript ? 'sub' : undefined,
                                }}
                              >
                                {r.text}
                              </span>
                            )
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Slide Number Strip */}
      {totalSlides > 1 && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-sanzar-surface2 border-t border-sanzar-border overflow-x-auto">
          {deck.slides.map((s, idx) => (
            <button
              key={s.index}
              type="button"
              onClick={() => setSlideIdx(idx)}
              title={s.titlePreview}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition ${
                idx === slideIdx
                  ? 'bg-sanzar-primary text-sanzar-onPrimary shadow-sm'
                  : 'bg-sanzar-surface border border-sanzar-border text-sanzar-muted hover:text-sanzar-text'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PptxSlideViewer;
