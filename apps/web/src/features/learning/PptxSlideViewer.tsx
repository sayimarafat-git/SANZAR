import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
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

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSizePt?: number;
}

interface TextParagraph {
  align?: 'left' | 'center' | 'right' | 'justify';
  bullet?: string;
  runs: TextRun[];
}

interface SlideElement {
  kind: 'image' | 'text' | 'table';
  x: number; // % 0..100
  y: number; // % 0..100
  w: number; // % 0..100
  h: number; // % 0..100
  rot?: number; // degrees
  src?: string;
  fill?: string;
  border?: string;
  paragraphs?: TextParagraph[];
  rows?: string[][];
}

interface ParsedSlide {
  index: number;
  bgColor?: string;
  bgImage?: string;
  elements: SlideElement[];
  titlePreview: string;
}

interface ParsedDeck {
  widthPx: number;
  heightPx: number;
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
  emf: 'image/emf',
  wmf: 'image/wmf',
};

function localName(node: Element): string {
  return node.localName || node.tagName.split(':').pop() || '';
}

function directChildren(parent: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (!name || localName(ch) === name) out.push(ch);
  }
  return out;
}

function firstDescendant(parent: Element, name: string): Element | null {
  const list = parent.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    if (localName(list[i]) === name) return list[i];
  }
  return null;
}

function parseColor(node: Element | null): string | undefined {
  if (!node) return undefined;
  const srgb = firstDescendant(node, 'srgbClr');
  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val && /^[0-9A-Fa-f]{6}$/.test(val)) return `#${val}`;
  }
  const scheme = firstDescendant(node, 'schemeClr');
  if (scheme) {
    const val = scheme.getAttribute('val');
    if (val === 'bg1' || val === 'lt1') return '#ffffff';
    if (val === 'tx1' || val === 'dk1') return '#1e293b';
    if (val === 'accent1') return '#2563eb';
    if (val === 'accent2') return '#dc2626';
  }
  return undefined;
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

async function parseRels(zip: JSZip, relsPath: string, ownerPath: string): Promise<Record<string, string>> {
  const file = zip.file(relsPath);
  if (!file) return {};
  const xml = await file.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const map: Record<string, string> = {};
  const rels = doc.getElementsByTagName('*');
  for (let i = 0; i < rels.length; i++) {
    const el = rels[i];
    if (localName(el) !== 'Relationship') continue;
    const id = el.getAttribute('Id');
    const target = el.getAttribute('Target');
    if (id && target) map[id] = resolveRelTarget(ownerPath, target);
  }
  return map;
}

function parseParagraphs(txBody: Element): TextParagraph[] {
  const out: TextParagraph[] = [];
  const pNodes = directChildren(txBody, 'p');
  for (const p of pNodes) {
    const pPr = directChildren(p, 'pPr')[0];
    let align: TextParagraph['align'];
    const algn = pPr?.getAttribute('algn');
    if (algn === 'ctr') align = 'center';
    else if (algn === 'r') align = 'right';
    else if (algn === 'just') align = 'justify';
    else if (algn === 'l') align = 'left';

    let bullet: string | undefined;
    if (pPr) {
      const buChar = directChildren(pPr, 'buChar')[0];
      const buAuto = directChildren(pPr, 'buAutoNum')[0];
      if (buChar) bullet = buChar.getAttribute('char') || '•';
      else if (buAuto) bullet = '•';
    }

    const runs: TextRun[] = [];
    for (const child of directChildren(p)) {
      const ln = localName(child);
      if (ln === 'r' || ln === 'fld') {
        const tNode = directChildren(child, 't')[0];
        const text = tNode?.textContent ?? '';
        if (!text) continue;
        const rPr = directChildren(child, 'rPr')[0];
        const szAttr = rPr?.getAttribute('sz');
        const fontSizePt = szAttr ? Math.max(8, Math.min(96, Number(szAttr) / 100)) : undefined;
        const fillNode = rPr ? directChildren(rPr, 'solidFill')[0] : null;
        runs.push({
          text,
          bold: rPr?.getAttribute('b') === '1',
          italic: rPr?.getAttribute('i') === '1',
          underline: rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none' ? true : false,
          color: parseColor(fillNode ?? null),
          fontSizePt,
        });
      } else if (ln === 'br') {
        runs.push({ text: '\n' });
      }
    }
    if (runs.length > 0) out.push({ align, bullet, runs });
  }
  return out;
}

interface CoordBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function parseXfrm(xfrm: Element | null): { x: number; y: number; w: number; h: number; rot?: number } | null {
  if (!xfrm) return null;
  const off = directChildren(xfrm, 'off')[0];
  const ext = directChildren(xfrm, 'ext')[0];
  if (!off || !ext) return null;
  const x = Number(off.getAttribute('x') || 0);
  const y = Number(off.getAttribute('y') || 0);
  const w = Number(ext.getAttribute('cx') || 0);
  const h = Number(ext.getAttribute('cy') || 0);
  if (w <= 0 || h <= 0) return null;
  const rotAttr = xfrm.getAttribute('rot');
  const rot = rotAttr ? Number(rotAttr) / 60000 : undefined;
  return { x, y, w, h, rot };
}

async function parsePptxBuffer(buffer: ArrayBuffer): Promise<ParsedDeck> {
  const zip = await JSZip.loadAsync(buffer);
  const blobUrls: string[] = [];
  const mediaCache = new Map<string, string>();

  async function getMediaUrl(zipPath: string): Promise<string | undefined> {
    if (!zipPath) return undefined;
    const cached = mediaCache.get(zipPath);
    if (cached) return cached;
    const f = zip.file(zipPath);
    if (!f) return undefined;
    const ext = zipPath.split('.').pop()?.toLowerCase() || '';
    // Skip Windows metafile formats browsers cannot render natively in <img>
    if (ext === 'emf' || ext === 'wmf') return undefined;
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const bytes = await f.async('uint8array');
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    mediaCache.set(zipPath, url);
    blobUrls.push(url);
    return url;
  }

  // 1. Read presentation.xml for slide dimensions and ordered slide list
  let slideCx = 12192000; // default 16:9
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
    const presRels = await parseRels(zip, 'ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml');
    const sldIds = presDoc.getElementsByTagName('*');
    for (let i = 0; i < sldIds.length; i++) {
      if (localName(sldIds[i]) !== 'sldId') continue;
      const rId =
        sldIds[i].getAttribute('r:id') ||
        sldIds[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (rId && presRels[rId]) slidePaths.push(presRels[rId]);
    }
  }

  if (slidePaths.length === 0) {
    slidePaths = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
        const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
        return na - nb;
      });
  }

  const widthPx = 960;
  const heightPx = Math.round((widthPx * slideCy) / slideCx);

  const slides: ParsedSlide[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const sPath = slidePaths[i];
    const sFile = zip.file(sPath);
    if (!sFile) continue;

    const sXml = await sFile.async('text');
    const sDoc = new DOMParser().parseFromString(sXml, 'application/xml');
    const relsPath = sPath.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = await parseRels(zip, relsPath, sPath);

    // Background
    let bgColor: string | undefined;
    let bgImage: string | undefined;
    const bgNode = firstDescendant(sDoc.documentElement, 'bg');
    if (bgNode) {
      const solid = firstDescendant(bgNode, 'solidFill');
      if (solid) bgColor = parseColor(solid);
      const blip = firstDescendant(bgNode, 'blip');
      if (blip) {
        const rId =
          blip.getAttribute('r:embed') ||
          blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
        if (rId && rels[rId]) bgImage = await getMediaUrl(rels[rId]);
      }
    }

    const elements: SlideElement[] = [];

    const mapToPct = (box: CoordBox, parent: CoordBox, childSpace: CoordBox): CoordBox => ({
      x: parent.x + ((box.x - childSpace.x) / childSpace.w) * parent.w,
      y: parent.y + ((box.y - childSpace.y) / childSpace.h) * parent.h,
      w: (box.w / childSpace.w) * parent.w,
      h: (box.h / childSpace.h) * parent.h,
    });

    const walkTree = async (container: Element, parentPct: CoordBox, childSpace: CoordBox) => {
      for (const node of directChildren(container)) {
        const ln = localName(node);

        if (ln === 'pic') {
          const spPr = directChildren(node, 'spPr')[0];
          const xfrm = spPr ? directChildren(spPr, 'xfrm')[0] : null;
          const raw = parseXfrm(xfrm);
          const blip = firstDescendant(node, 'blip');
          const rId =
            blip?.getAttribute('r:embed') ||
            blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
          if (raw && rId && rels[rId]) {
            const src = await getMediaUrl(rels[rId]);
            if (src) {
              const pct = mapToPct(raw, parentPct, childSpace);
              elements.push({ kind: 'image', ...pct, rot: raw.rot, src });
            }
          }
        } else if (ln === 'sp') {
          const spPr = directChildren(node, 'spPr')[0];
          const xfrm = spPr ? directChildren(spPr, 'xfrm')[0] : null;
          const raw = parseXfrm(xfrm);
          const txBody = directChildren(node, 'txBody')[0];
          const paragraphs = txBody ? parseParagraphs(txBody) : [];
          const solidFill = spPr ? directChildren(spPr, 'solidFill')[0] : null;
          const fill = parseColor(solidFill ?? null);
          const lnNode = spPr ? directChildren(spPr, 'ln')[0] : null;
          const border = lnNode ? parseColor(directChildren(lnNode, 'solidFill')[0] ?? null) : undefined;

          if (raw && (paragraphs.length > 0 || fill || border)) {
            const pct = mapToPct(raw, parentPct, childSpace);
            elements.push({ kind: 'text', ...pct, rot: raw.rot, fill, border, paragraphs });
          } else if (!raw && paragraphs.length > 0) {
            // Inherited layout placeholder without explicit xfrm — place gracefully
            const isFirst = elements.filter((e) => e.kind === 'text').length === 0;
            elements.push({
              kind: 'text',
              x: 6,
              y: isFirst ? 7 : 24,
              w: 88,
              h: isFirst ? 16 : 66,
              paragraphs,
            });
          }
        } else if (ln === 'graphicFrame') {
          const xfrm = directChildren(node, 'xfrm')[0];
          const raw = parseXfrm(xfrm);
          const tbl = firstDescendant(node, 'tbl');
          if (raw && tbl) {
            const rows: string[][] = [];
            for (const tr of directChildren(tbl, 'tr')) {
              const row: string[] = [];
              for (const tc of directChildren(tr, 'tc')) {
                const txBody = directChildren(tc, 'txBody')[0];
                const ps = txBody ? parseParagraphs(txBody) : [];
                row.push(ps.map((p) => p.runs.map((r) => r.text).join('')).join('\n').trim());
              }
              if (row.length > 0) rows.push(row);
            }
            if (rows.length > 0) {
              const pct = mapToPct(raw, parentPct, childSpace);
              elements.push({ kind: 'table', ...pct, rows });
            }
          }
        } else if (ln === 'grpSp') {
          const grpSpPr = directChildren(node, 'grpSpPr')[0];
          const xfrm = grpSpPr ? directChildren(grpSpPr, 'xfrm')[0] : null;
          const raw = parseXfrm(xfrm);
          if (raw && xfrm) {
            const chOff = directChildren(xfrm, 'chOff')[0];
            const chExt = directChildren(xfrm, 'chExt')[0];
            const nextParent = mapToPct(raw, parentPct, childSpace);
            const nextChildSpace: CoordBox = {
              x: Number(chOff?.getAttribute('x') || 0),
              y: Number(chOff?.getAttribute('y') || 0),
              w: Number(chExt?.getAttribute('cx') || raw.w) || raw.w,
              h: Number(chExt?.getAttribute('cy') || raw.h) || raw.h,
            };
            await walkTree(node, nextParent, nextChildSpace);
          } else {
            await walkTree(node, parentPct, childSpace);
          }
        }
      }
    };

    const spTree = firstDescendant(sDoc.documentElement, 'spTree');
    if (spTree) {
      await walkTree(spTree, { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: slideCx, h: slideCy });
    }

    const firstText = elements
      .filter((e) => e.kind === 'text' && e.paragraphs?.length)
      .flatMap((e) => e.paragraphs!)
      .map((p) => p.runs.map((r) => r.text).join('').trim())
      .find((t) => t.length > 0);

    slides.push({
      index: i + 1,
      bgColor,
      bgImage,
      elements,
      titlePreview: firstText ? firstText.slice(0, 42) : `Slide ${i + 1}`,
    });
  }

  return { widthPx, heightPx, slides, blobUrls };
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

  // Responsive scale calculation for crisp slide rendering at any viewport width
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el || !deck) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / deck.widthPx);
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
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
            <p className="text-xs text-sanzar-muted">Preparing native slide deck</p>
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
            className="hidden sm:block max-w-[200px] px-2 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface text-xs font-medium truncate"
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
            height: `${Math.round(deck.heightPx * scale)}px`,
            backgroundColor: slide.bgColor || '#ffffff',
          }}
        >
          <div
            style={{
              width: `${deck.widthPx}px`,
              height: `${deck.heightPx}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'relative',
              backgroundColor: slide.bgColor || '#ffffff',
              backgroundImage: slide.bgImage ? `url(${slide.bgImage})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: '#1e293b',
            }}
          >
            {slide.elements.map((el, idx) => {
              const baseStyle: React.CSSProperties = {
                position: 'absolute',
                left: `${el.x}%`,
                top: `${el.y}%`,
                width: `${el.w}%`,
                height: `${el.h}%`,
                transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
                boxSizing: 'border-box',
              };

              if (el.kind === 'image' && el.src) {
                return (
                  <img
                    key={idx}
                    src={el.src}
                    alt=""
                    style={{ ...baseStyle, objectFit: 'contain' }}
                    draggable={false}
                  />
                );
              }

              if (el.kind === 'table' && el.rows) {
                return (
                  <div key={idx} style={{ ...baseStyle, overflow: 'auto' }}>
                    <table className="w-full border-collapse text-[14px] bg-white/90 text-slate-900">
                      <tbody>
                        {el.rows.map((row, ri) => (
                          <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-bold' : ''}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="border border-slate-300 px-2 py-1 align-top whitespace-pre-wrap"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  style={{
                    ...baseStyle,
                    backgroundColor: el.fill || 'transparent',
                    border: el.border ? `1px solid ${el.border}` : undefined,
                    padding: '4px 6px',
                    overflow: 'hidden',
                    lineHeight: 1.35,
                  }}
                >
                  {el.paragraphs?.map((p, pi) => (
                    <div
                      key={pi}
                      style={{
                        textAlign: p.align || 'left',
                        marginBottom: '4px',
                        wordBreak: 'break-word',
                      }}
                    >
                      {p.bullet && <span className="mr-1.5">{p.bullet}</span>}
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
                              fontSize: r.fontSizePt ? `${Math.round(r.fontSizePt * 1.25)}px` : '18px',
                            }}
                          >
                            {r.text}
                          </span>
                        )
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
