import React, { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import * as UTIF from 'utif2';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  fontSizePt?: number;
  imageSrc?: string;
  imageWidthPx?: number;
}

interface DocParagraph {
  kind: 'paragraph';
  headingLevel?: 1 | 2 | 3 | 4;
  align?: 'left' | 'center' | 'right' | 'justify';
  isList?: boolean;
  indentPx?: number;
  runs: DocRun[];
}

interface DocTable {
  kind: 'table';
  rows: {
    cells: {
      colSpan?: number;
      bg?: string;
      paragraphs: DocParagraph[];
    }[];
  }[];
}

type DocBlock = DocParagraph | DocTable;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

const HIGHLIGHT_MAP: Record<string, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  cyan: '#a5f3fc',
  magenta: '#f5d0fe',
  blue: '#bfdbfe',
  red: '#fecaca',
  lightGray: '#e2e8f0',
};

function localName(el: Element): string {
  return el.localName || el.tagName.split(':').pop() || '';
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
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (localName(all[i]) === name) return all[i];
  }
  return null;
}

function getAttrLocal(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  if (el.hasAttribute(`w:${name}`)) return el.getAttribute(`w:${name}`);
  if (el.hasAttribute(name)) return el.getAttribute(name);
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.localName === name || a.name.endsWith(`:${name}`)) return a.value;
  }
  return null;
}

async function decodeTiffBlob(bytes: Uint8Array): Promise<Blob | null> {
  try {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = UTIF.decode(ab);
    if (!ifds?.length) return null;
    UTIF.decodeImage(ab, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
  } catch {
    return null;
  }
}

async function parseDocxBuffer(buffer: ArrayBuffer): Promise<{ blocks: DocBlock[]; blobUrls: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const blobUrls: string[] = [];
  const mediaCache = new Map<string, string | null>();

  async function getMediaUrl(target: string): Promise<string | undefined> {
    const zipPath = target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^(\.\.\/)+/, '')}`;
    if (mediaCache.has(zipPath)) return mediaCache.get(zipPath) || undefined;
    const f = zip.file(zipPath) || zip.file(target.replace(/^\/+/, ''));
    if (!f) {
      mediaCache.set(zipPath, null);
      return undefined;
    }
    const ext = zipPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'emf' || ext === 'wmf' || ext === 'wdp') {
      mediaCache.set(zipPath, null);
      return undefined;
    }
    const bytes = await f.async('uint8array');
    if (ext === 'tif' || ext === 'tiff') {
      const b = await decodeTiffBlob(bytes);
      if (!b) return undefined;
      const u = URL.createObjectURL(b);
      mediaCache.set(zipPath, u);
      blobUrls.push(u);
      return u;
    }
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME_BY_EXT[ext] || 'image/png' }));
    mediaCache.set(zipPath, u);
    blobUrls.push(u);
    return u;
  }

  // Parse relationships
  const rels: Record<string, string> = {};
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const rDoc = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml');
    const nodes = rDoc.getElementsByTagName('*');
    for (let i = 0; i < nodes.length; i++) {
      if (localName(nodes[i]) !== 'Relationship') continue;
      const id = nodes[i].getAttribute('Id');
      const tgt = nodes[i].getAttribute('Target');
      if (id && tgt) rels[id] = tgt;
    }
  }

  // Parse heading style map from styles.xml
  const headingStyleMap: Record<string, 1 | 2 | 3 | 4> = {
    Title: 1,
    Subtitle: 2,
    Heading1: 1,
    Heading2: 2,
    Heading3: 3,
    Heading4: 4,
    '1': 1,
    '2': 2,
    '3': 3,
  };
  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    const sDoc = new DOMParser().parseFromString(await stylesFile.async('text'), 'application/xml');
    for (const st of directChildren(sDoc.documentElement, 'style')) {
      const styleId = getAttrLocal(st, 'styleId');
      const nameEl = firstChild(st, 'name');
      const nameVal = (getAttrLocal(nameEl, 'val') || '').toLowerCase();
      if (!styleId) continue;
      if (nameVal === 'title' || nameVal.startsWith('heading 1')) headingStyleMap[styleId] = 1;
      else if (nameVal === 'subtitle' || nameVal.startsWith('heading 2')) headingStyleMap[styleId] = 2;
      else if (nameVal.startsWith('heading 3')) headingStyleMap[styleId] = 3;
      else if (nameVal.startsWith('heading 4')) headingStyleMap[styleId] = 4;
    }
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid .docx archive (missing word/document.xml).');
  const docXml = await docFile.async('text');
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const body = firstDescendant(doc.documentElement, 'body');
  if (!body) throw new Error('Empty document body.');

  async function parseParagraph(p: Element): Promise<DocParagraph> {
    const pPr = firstChild(p, 'pPr');
    const pStyle = pPr ? getAttrLocal(firstChild(pPr, 'pStyle'), 'val') : null;
    const headingLevel = pStyle ? headingStyleMap[pStyle] : undefined;
    const jc = pPr ? getAttrLocal(firstChild(pPr, 'jc'), 'val') : null;
    const align: DocParagraph['align'] =
      jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : 'left';
    const isList = Boolean(pPr && firstChild(pPr, 'numPr'));
    const indLeft = pPr ? getAttrLocal(firstChild(pPr, 'ind'), 'left') : null;
    const indentPx = indLeft ? Math.min(160, Math.round(Number(indLeft) / 15)) : undefined;

    const runs: DocRun[] = [];

    const collectRuns = async (parent: Element) => {
      for (const ch of directChildren(parent)) {
        const ln = localName(ch);
        if (ln === 'hyperlink' || ln === 'smartTag' || ln === 'sdt' || ln === 'sdtContent') {
          await collectRuns(ch);
          continue;
        }
        if (ln !== 'r') continue;

        const rPr = firstChild(ch, 'rPr');
        const bold = Boolean(rPr && firstChild(rPr, 'b') && getAttrLocal(firstChild(rPr, 'b'), 'val') !== '0');
        const italic = Boolean(rPr && firstChild(rPr, 'i') && getAttrLocal(firstChild(rPr, 'i'), 'val') !== '0');
        const uVal = rPr ? getAttrLocal(firstChild(rPr, 'u'), 'val') : null;
        const underline = Boolean(rPr && firstChild(rPr, 'u') && uVal !== 'none');
        const strike = Boolean(rPr && firstChild(rPr, 'strike'));
        const colVal = rPr ? getAttrLocal(firstChild(rPr, 'color'), 'val') : null;
        const color = colVal && colVal !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(colVal) ? `#${colVal}` : undefined;
        const hlVal = rPr ? getAttrLocal(firstChild(rPr, 'highlight'), 'val') : null;
        const highlight = hlVal ? HIGHLIGHT_MAP[hlVal] : undefined;
        const szVal = rPr ? getAttrLocal(firstChild(rPr, 'sz'), 'val') : null;
        const fontSizePt = szVal ? Math.max(8, Math.min(72, Number(szVal) / 2)) : undefined;

        for (const rc of directChildren(ch)) {
          const rln = localName(rc);
          if (rln === 't') {
            runs.push({
              text: rc.textContent ?? '',
              bold,
              italic,
              underline,
              strike,
              color,
              highlight,
              fontSizePt,
            });
          } else if (rln === 'tab') {
            runs.push({ text: '\t' });
          } else if (rln === 'br' || rln === 'cr') {
            runs.push({ text: '\n' });
          } else if (rln === 'drawing' || rln === 'pict') {
            const blip = firstDescendant(rc, 'blip');
            const imgData = firstDescendant(rc, 'imagedata');
            const rId =
              blip?.getAttribute('r:embed') ||
              blip?.getAttributeNS(REL_NS, 'embed') ||
              imgData?.getAttribute('r:id') ||
              imgData?.getAttributeNS(REL_NS, 'id');
            if (rId && rels[rId]) {
              const src = await getMediaUrl(rels[rId]);
              if (src) {
                const extent = firstDescendant(rc, 'extent');
                const cx = Number(extent?.getAttribute('cx') || 0);
                const imageWidthPx = cx > 0 ? Math.min(680, Math.round(cx / 9525)) : undefined;
                runs.push({ text: '', imageSrc: src, imageWidthPx });
              }
            }
          }
        }
      }
    };

    await collectRuns(p);
    return { kind: 'paragraph', headingLevel, align, isList, indentPx, runs };
  }

  const blocks: DocBlock[] = [];
  for (const child of directChildren(body)) {
    const ln = localName(child);
    if (ln === 'p') {
      blocks.push(await parseParagraph(child));
    } else if (ln === 'tbl') {
      const rows: DocTable['rows'] = [];
      for (const tr of directChildren(child, 'tr')) {
        const cells: DocTable['rows'][number]['cells'] = [];
        for (const tc of directChildren(tr, 'tc')) {
          const tcPr = firstChild(tc, 'tcPr');
          const vMerge = tcPr ? firstChild(tcPr, 'vMerge') : null;
          if (vMerge && !getAttrLocal(vMerge, 'val')) continue;
          const spanVal = tcPr ? getAttrLocal(firstChild(tcPr, 'gridSpan'), 'val') : null;
          const colSpan = spanVal ? Math.max(1, Number(spanVal)) : undefined;
          const shdFill = tcPr ? getAttrLocal(firstChild(tcPr, 'shd'), 'fill') : null;
          const bg = shdFill && shdFill !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(shdFill) ? `#${shdFill}` : undefined;
          const paragraphs: DocParagraph[] = [];
          for (const p of directChildren(tc, 'p')) {
            paragraphs.push(await parseParagraph(p));
          }
          cells.push({ colSpan, bg, paragraphs });
        }
        if (rows.length >= 0 && cells.length > 0) rows.push({ cells });
      }
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
    }
  }

  return { blocks, blobUrls };
}

export interface DocxDocumentViewerProps {
  url: string;
  title?: string;
}

export const DocxDocumentViewer: React.FC<DocxDocumentViewerProps> = ({ url, title }) => {
  const [blocks, setBlocks] = useState<DocBlock[] | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [useOfficeFallback, setUseOfficeFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pathLower = url.split('?')[0].toLowerCase();
  const isLegacyDoc = /\.doc$/.test(pathLower);
  const isPlainTextFile = /\.(txt|md|csv)$/.test(pathLower);

  useEffect(() => {
    if (isLegacyDoc) {
      setLoading(false);
      setUseOfficeFallback(true);
      return;
    }

    let cancelled = false;
    let createdUrls: string[] = [];

    (async () => {
      setLoading(true);
      setError(null);
      setBlocks(null);
      setPlainText(null);
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Could not load document (HTTP ${res.status})`);
        if (isPlainTextFile) {
          const txt = await res.text();
          if (!cancelled) setPlainText(txt);
        } else {
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          const parsed = await parseDocxBuffer(buf);
          if (cancelled) {
            parsed.blobUrls.forEach((u) => URL.revokeObjectURL(u));
            return;
          }
          createdUrls = parsed.blobUrls;
          setBlocks(parsed.blocks);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to render document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [url, isLegacyDoc, isPlainTextFile]);

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
      /* ignore */
    }
  };

  if (useOfficeFallback) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
          <span className="font-semibold text-sanzar-muted flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-sanzar-primary" /> Office Online Document Viewer
          </span>
          <div className="flex items-center gap-2">
            {!isLegacyDoc && (
              <button
                type="button"
                onClick={() => setUseOfficeFallback(false)}
                className="px-2.5 py-1 rounded-lg bg-sanzar-surface border border-sanzar-border font-semibold hover:bg-sanzar-primarySoft"
              >
                Use Built-in Reader
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
        <iframe src={officeUrl} title={title || 'Document'} className="w-full h-[70dvh] sm:h-[78dvh] border-0" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-sanzar-primary animate-spin" />
        <p className="font-bold text-sm">Loading document…</p>
      </div>
    );
  }

  if (error || (!blocks && plainText == null)) {
    return (
      <div className="p-10 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-sanzar-warning" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Could not preview document directly</p>
          <p className="text-xs text-sanzar-muted max-w-md mx-auto">{error}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={url}
            download
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download Document
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

  const renderParagraph = (p: DocParagraph, idx: number) => {
    const isEmpty = p.runs.length === 0 || p.runs.every((r) => !r.text && !r.imageSrc);
    if (isEmpty) return <div key={idx} className="h-3" />;

    const headingCls =
      p.headingLevel === 1
        ? 'text-2xl font-extrabold mt-4 mb-2'
        : p.headingLevel === 2
          ? 'text-xl font-bold mt-3.5 mb-1.5'
          : p.headingLevel === 3
            ? 'text-lg font-bold mt-3 mb-1'
            : p.headingLevel === 4
              ? 'text-base font-bold mt-2 mb-1'
              : 'my-1.5';

    return (
      <div
        key={idx}
        className={`leading-relaxed ${headingCls}`}
        style={{
          textAlign: p.align || 'left',
          paddingLeft: p.indentPx ? `${p.indentPx}px` : p.isList ? '20px' : undefined,
        }}
      >
        {p.isList && <span className="mr-2 font-bold">•</span>}
        {p.runs.map((r, ri) => {
          if (r.imageSrc) {
            return (
              <img
                key={ri}
                src={r.imageSrc}
                alt=""
                style={{ maxWidth: r.imageWidthPx ? `${r.imageWidthPx}px` : '100%' }}
                className="my-2 rounded inline-block h-auto"
              />
            );
          }
          if (r.text === '\n') return <br key={ri} />;
          return (
            <span
              key={ri}
              style={{
                fontWeight: r.bold ? 700 : undefined,
                fontStyle: r.italic ? 'italic' : undefined,
                textDecoration:
                  r.underline && r.strike
                    ? 'underline line-through'
                    : r.underline
                      ? 'underline'
                      : r.strike
                        ? 'line-through'
                        : undefined,
                color: r.color,
                backgroundColor: r.highlight,
                fontSize: r.fontSizePt ? `${Math.round(r.fontSizePt * zoom * 1.25)}px` : undefined,
                whiteSpace: 'pre-wrap',
              }}
            >
              {r.text}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? 'bg-slate-950 h-[100dvh]' : 'bg-sanzar-surface'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
        <span className="font-bold flex items-center gap-1.5 truncate">
          <FileText className="w-4 h-4 text-sanzar-primary shrink-0" />
          <span className="truncate">{title || 'Document Reader'}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.1) * 100) / 100))}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title="Decrease text size"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface font-bold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.1) * 100) / 100))}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title="Increase text size"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <a
            href={url}
            download
            className="px-2.5 py-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div
        className={`overflow-auto p-2.5 sm:p-6 bg-slate-900/5 dark:bg-slate-950/60 ${
          isFullscreen ? 'flex-1' : 'max-h-[72dvh] sm:max-h-[78dvh]'
        }`}
      >
        <div
          className="max-w-3xl mx-auto bg-white text-slate-900 shadow-md rounded-xl border border-black/10 p-4 sm:p-8 lg:p-10 select-text"
          style={{ fontSize: `${Math.round(15 * zoom)}px` }}
        >
          {plainText != null ? (
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">{plainText}</pre>
          ) : (
            blocks?.map((b, bi) =>
              b.kind === 'paragraph' ? (
                renderParagraph(b, bi)
              ) : (
                <div key={bi} className="my-4 overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-sm">
                    <tbody>
                      {b.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.cells.map((cell, ci) => (
                            <td
                              key={ci}
                              colSpan={cell.colSpan}
                              style={{ backgroundColor: cell.bg || (ri === 0 ? '#f8fafc' : undefined) }}
                              className="border border-slate-300 px-3 py-2 align-top"
                            >
                              {cell.paragraphs.map((cp, cpi) => renderParagraph(cp, cpi))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default DocxDocumentViewer;
