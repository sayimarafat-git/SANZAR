import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  AlertCircle,
} from 'lucide-react';

interface PdfPageCanvasProps {
  pdf: any;
  pageNum: number;
  widthPx: number;
  onVisible: (pageNum: number) => void;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({ pdf, pageNum, widthPx, onVisible }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(pageNum <= 2);
  const [aspect, setAspect] = useState(1.414); // A4 default height/width

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (entry.intersectionRatio >= 0.35) onVisible(pageNum);
          }
        }
      },
      { rootMargin: '600px 0px', threshold: [0.01, 0.4] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNum, onVisible]);

  useEffect(() => {
    if (!inView || !pdf || widthPx <= 0) return;
    let cancelled = false;
    let renderTask: any = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const vp1 = page.getViewport({ scale: 1 });
        if (vp1.width > 0 && vp1.height > 0) {
          setAspect(vp1.height / vp1.width);
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssScale = widthPx / Math.max(1, vp1.width);
        const viewport = page.getViewport({ scale: cssScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.floor(widthPx)}px`;
        canvas.style.height = `${Math.floor((widthPx * vp1.height) / Math.max(1, vp1.width))}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({ canvas, canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch {
        /* ignore aborted render */
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask?.cancel) {
        try {
          renderTask.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [inView, pdf, pageNum, widthPx]);

  const estHeight = Math.round(widthPx * aspect);

  return (
    <div
      ref={wrapRef}
      data-pdf-page={pageNum}
      className="mx-auto bg-white shadow-md rounded border border-black/10 overflow-hidden flex items-center justify-center"
      style={{ width: `${Math.floor(widthPx)}px`, minHeight: `${estHeight}px` }}
    >
      {inView ? (
        <canvas ref={canvasRef} className="block" />
      ) : (
        <span className="text-xs text-slate-400 font-semibold">Page {pageNum}</span>
      )}
    </div>
  );
};

export interface PdfCanvasViewerProps {
  url: string;
  title?: string;
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({ url, title }) => {
  const [pdf, setPdf] = useState<any | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [baseWidth, setBaseWidth] = useState(760);

  useEffect(() => {
    let cancelled = false;
    let loadedTask: any = null;

    (async () => {
      setLoading(true);
      setError(null);
      setPdf(null);
      setNumPages(0);
      setCurrentPage(1);
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

        loadedTask = pdfjs.getDocument({ url, withCredentials: false });
        const doc = await loadedTask.promise;
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages || 1);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unable to load PDF directly.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (loadedTask?.destroy) loadedTask.destroy().catch(() => {});
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 32;
      if (w > 180) setBaseWidth(Math.min(880, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf, isFullscreen]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const jumpToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(numPages, p));
    setCurrentPage(clamped);
    const target = scrollRef.current?.querySelector(`[data-pdf-page="${clamped}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

  if (useIframeFallback) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
          <span className="font-semibold text-sanzar-muted">{title || 'PDF Document'}</span>
          <a
            href={url}
            download
            className="px-2.5 py-1 rounded-lg bg-sanzar-primary text-sanzar-onPrimary font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </a>
        </div>
        <iframe src={url} title={title || 'PDF'} className="w-full h-[70dvh] sm:h-[78dvh] border-0" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-sanzar-primary animate-spin" />
        <p className="font-bold text-sm">Loading PDF document…</p>
      </div>
    );
  }

  if (error || !pdf) {
    return (
      <div className="p-10 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-sanzar-warning" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Could not render PDF inline</p>
          <p className="text-xs text-sanzar-muted max-w-md mx-auto">{error}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setUseIframeFallback(true)}
            className="px-4 py-2 rounded-xl border border-sanzar-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-sanzar-surface2"
          >
            <ExternalLink className="w-4 h-4" /> Open Browser PDF Frame
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download .pdf
          </a>
        </div>
      </div>
    );
  }

  const pageWidth = Math.round(baseWidth * zoom);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isFullscreen ? 'bg-slate-950 h-[100dvh]' : 'bg-sanzar-surface'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-sanzar-surface2 border-b border-sanzar-border text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold tabular-nums px-1.5">
            Page {currentPage} / {numPages}
          </span>
          <button
            type="button"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="px-2 py-1 rounded-lg border border-sanzar-border bg-sanzar-surface font-bold tabular-nums"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
            className="p-1.5 rounded-lg border border-sanzar-border bg-sanzar-surface hover:bg-sanzar-primarySoft"
            title="Zoom in"
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
        ref={scrollRef}
        className={`overflow-auto p-2.5 sm:p-4 space-y-4 bg-slate-900/5 dark:bg-slate-950/60 ${
          isFullscreen ? 'flex-1' : 'max-h-[72dvh] sm:max-h-[78dvh]'
        }`}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <PdfPageCanvas
            key={pageNum}
            pdf={pdf}
            pageNum={pageNum}
            widthPx={pageWidth}
            onVisible={setCurrentPage}
          />
        ))}
      </div>
    </div>
  );
};

export default PdfCanvasViewer;
