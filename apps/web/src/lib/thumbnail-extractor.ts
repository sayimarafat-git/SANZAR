import { apiRequest } from './api-client';
import { auth } from './firebase';

export interface ExtractedThumbnail {
  coverImage: string;
  coverRatio: number;
}

export function clampRatio(r: number | null | undefined, fallback = 0.7071): number {
  if (!r || !Number.isFinite(r) || r <= 0) return fallback;
  return Math.round(Math.max(0.45, Math.min(2.2, r)) * 10000) / 10000;
}

export function extractGoogleDriveId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.toLowerCase();
    if (host === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] || u.searchParams.get('id');
      return id && /^[\w-]{10,120}$/.test(id) ? id : null;
    }
    if (host === 'docs.google.com' && u.pathname.startsWith('/presentation/d/')) {
      const id = u.pathname.split('/').filter(Boolean)[2];
      return id && /^[\w-]{10,120}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

function encodeCanvas(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.8);
  if (webp.startsWith('data:image/webp') && webp.length <= 240_000) return webp;
  const jpg = canvas.toDataURL('image/jpeg', 0.78);
  if (jpg.length <= 240_000) return jpg;
  return canvas.toDataURL('image/jpeg', 0.6);
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function blobToDataUri(blob: Blob, maxEdge = 440, forcedRatio?: number): Promise<ExtractedThumbnail> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const natRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
    const ratio = clampRatio(forcedRatio ?? natRatio);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(120, Math.round(img.naturalWidth * scale));
    const h = Math.max(120, Math.round(w / ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { coverImage: encodeCanvas(canvas), coverRatio: ratio };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderSlideFallbackCanvas(title: string, lines: string[], ratio: number): ExtractedThumbnail {
  const safeRatio = clampRatio(ratio, 1.7778);
  const w = safeRatio >= 1 ? 440 : Math.round(440 * safeRatio);
  const h = Math.round(w / safeRatio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0f3d2b');
  grad.addColorStop(0.55, '#176b4b');
  grad.addColorStop(1, '#247754');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.15, Math.max(w, h) * 0.28, 0, Math.PI * 2);
  ctx.fill();

  const pad = Math.round(w * 0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.max(16, Math.round(h * 0.095))}px Inter, system-ui, sans-serif`;
  const heading = (title || lines[0] || 'Presentation').slice(0, 60);
  wrapCanvasText(ctx, heading, pad + 14, pad + Math.round(h * 0.16), w - pad * 2 - 28, Math.round(h * 0.12), 3);

  const body = lines.slice(1).join(' · ').slice(0, 140);
  if (body) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `500 ${Math.max(11, Math.round(h * 0.055))}px Inter, system-ui, sans-serif`;
    wrapCanvasText(ctx, body, pad + 14, Math.round(h * 0.56), w - pad * 2 - 28, Math.round(h * 0.08), 3);
  }

  return { coverImage: encodeCanvas(canvas), coverRatio: safeRatio };
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  let line = '';
  let row = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      row++;
      if (row >= maxLines) return;
      line = w;
    } else {
      line = test;
    }
  }
  if (line && row < maxLines) {
    ctx.fillText(line, x, y + row * lineHeight);
  }
}

export async function extractFromPdfBytes(buffer: ArrayBuffer): Promise<ExtractedThumbnail> {
  const pdfjs = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const rawRatio = vp1.width / Math.max(1, vp1.height);
    const maxEdge = 440;
    const scale = maxEdge / Math.max(vp1.width, vp1.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return {
      coverImage: encodeCanvas(canvas),
      coverRatio: clampRatio(rawRatio, 0.7071),
    };
  } finally {
    await task.destroy().catch(() => {});
  }
}

export async function extractFromPptxBytes(buffer: ArrayBuffer, fallbackTitle = 'Slides'): Promise<ExtractedThumbnail> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  // Read exact slide dimensions from ppt/presentation.xml (<p:sldSz cx="..." cy="..."/>)
  let slideRatio = 16 / 9;
  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  if (presXml) {
    const m = presXml.match(/<[^>]*sldSz\b[^>]*>/);
    if (m) {
      const cx = Number(m[0].match(/\bcx="(\d+)"/)?.[1] || 0);
      const cy = Number(m[0].match(/\bcy="(\d+)"/)?.[1] || 0);
      if (cx > 0 && cy > 0) slideRatio = clampRatio(cx / cy, 1.7778);
    }
  }

  // Prefer embedded Office thumbnail if available (exact Page 1 / Slide 1 snapshot)
  const thumbPaths = ['docProps/thumbnail.jpeg', 'docProps/thumbnail.jpg', 'docProps/thumbnail.png'];
  for (const tp of thumbPaths) {
    const file = zip.file(tp);
    if (file) {
      const bytes = await file.async('uint8array');
      const mime = tp.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return await blobToDataUri(new Blob([copy], { type: mime }), 440, slideRatio);
    }
  }

  // Parse Slide 1 XML for image reference or slide text
  const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
  const slide1Rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string');
  if (slide1Xml && slide1Rels) {
    const embedId = slide1Xml.match(/r:embed="(rId\d+)"/)?.[1];
    if (embedId) {
      const relRegex = new RegExp(`Id="${embedId}"[^>]*Target="([^"]+)"`, 'i');
      const target = slide1Rels.match(relRegex)?.[1];
      if (target) {
        const normalized = `ppt/slides/${target}`.replace(/\/[^/]+\/\.\.\//g, '/').replace(/^ppt\/slides\/\.\.\//, 'ppt/');
        const cleanPath = normalized.startsWith('ppt/') ? normalized : `ppt/media/${target.split('/').pop()}`;
        const mediaFile = zip.file(cleanPath);
        if (mediaFile && /\.(png|jpe?g|webp)$/i.test(cleanPath)) {
          const bytes = await mediaFile.async('uint8array');
          const mime = cleanPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          return await blobToDataUri(new Blob([copy], { type: mime }), 440, slideRatio);
        }
      }
    }
  }

  // Fallback: render slide 1 text onto a crisp canvas matching the slide aspect ratio
  const texts = slide1Xml
    ? Array.from(slide1Xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)).map((m) => m[1].trim()).filter(Boolean)
    : [];
  return renderSlideFallbackCanvas(texts[0] || fallbackTitle, texts, slideRatio);
}

function isPdfBytes(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 5));
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}

function isZipBytes(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 4));
  return b[0] === 0x50 && b[1] === 0x4b; // PK (PPTX / Office Open XML)
}

export async function extractThumbnailFromFile(file: File, fallbackTitle?: string): Promise<ExtractedThumbnail> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (isPdfBytes(buf) || name.endsWith('.pdf')) {
    return extractFromPdfBytes(buf);
  }
  if (isZipBytes(buf) || name.endsWith('.pptx')) {
    return extractFromPptxBytes(buf, fallbackTitle || file.name.replace(/\.[^.]+$/, ''));
  }
  if (name.endsWith('.ppt')) {
    return renderSlideFallbackCanvas(fallbackTitle || file.name.replace(/\.ppt$/i, ''), [], 16 / 9);
  }
  throw new Error('Choose a PDF or PPT/PPTX file.');
}

async function fetchAdminPreviewBytes(url: string): Promise<ArrayBuffer> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const { API_BASE } = await import('./api-client');
  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE}/v1/admin/fetch-preview?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Could not inspect file (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}

export async function extractThumbnailFromUrl(
  url: string,
  type: 'pdf' | 'ppt',
  title?: string
): Promise<ExtractedThumbnail> {
  const driveId = extractGoogleDriveId(url);
  if (driveId) {
    const thumbUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
    const dims = await loadImageDimensions(thumbUrl);
    return {
      coverImage: thumbUrl,
      coverRatio: clampRatio(dims ? dims.width / dims.height : undefined, type === 'ppt' ? 1.7778 : 0.7071),
    };
  }

  const buf = await fetchAdminPreviewBytes(url);
  if (isPdfBytes(buf) || (type === 'pdf' && !isZipBytes(buf))) {
    return extractFromPdfBytes(buf);
  }
  if (isZipBytes(buf) || type === 'ppt') {
    return extractFromPptxBytes(buf, title || 'Slides');
  }
  throw new Error('Could not parse file at this URL. Upload the local PDF/PPTX file directly to generate its thumbnail.');
}

const directCache = new Map<string, ExtractedThumbnail>();

export async function tryExtractPublicPdfCover(url: string): Promise<ExtractedThumbnail | null> {
  if (directCache.has(url)) return directCache.get(url)!;
  try {
    const driveId = extractGoogleDriveId(url);
    if (driveId) {
      const thumbUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
      const dims = await loadImageDimensions(thumbUrl);
      if (!dims) return null;
      const out = { coverImage: thumbUrl, coverRatio: clampRatio(dims.width / dims.height, 0.7071) };
      directCache.set(url, out);
      return out;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const out = isPdfBytes(buf) ? await extractFromPdfBytes(buf) : isZipBytes(buf) ? await extractFromPptxBytes(buf) : null;
    if (out) directCache.set(url, out);
    return out;
  } catch {
    return null;
  }
}

export { apiRequest };
