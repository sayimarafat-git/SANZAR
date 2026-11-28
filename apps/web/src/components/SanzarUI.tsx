import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Calculator,
  Atom,
  FlaskConical,
  Leaf,
  Languages,
  Monitor,
  Feather,
  LayoutGrid,
  CloudOff,
  X,
} from 'lucide-react';
import { useSettings } from '../lib/settings-context';
import { useOverlayBackButton } from '../lib/useOverlayBackButton';

export const AmbientBackdrop: React.FC = () => (
  <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <div
      className="absolute -top-32 -left-24 w-[36rem] h-[36rem] rounded-full opacity-75 dark:opacity-50"
      style={{ background: 'radial-gradient(circle, rgba(25,180,107,0.34) 0%, rgba(23,107,75,0.10) 48%, transparent 72%)' }}
    />
    <div
      className="absolute -top-20 right-[-6rem] w-[34rem] h-[34rem] rounded-full opacity-70 dark:opacity-45"
      style={{ background: 'radial-gradient(circle, rgba(26,134,160,0.30) 0%, rgba(61,107,255,0.10) 48%, transparent 72%)' }}
    />
    <div
      className="absolute bottom-[-10rem] left-1/4 w-[38rem] h-[38rem] rounded-full opacity-65 dark:opacity-40"
      style={{ background: 'radial-gradient(circle, rgba(198,164,106,0.28) 0%, rgba(36,119,84,0.12) 48%, transparent 72%)' }}
    />
    <div
      className="absolute bottom-10 -right-24 w-[28rem] h-[28rem] rounded-full opacity-65 dark:opacity-45"
      style={{ background: 'radial-gradient(circle, rgba(37,138,92,0.30) 0%, rgba(18,57,42,0.08) 48%, transparent 72%)' }}
    />
  </div>
);

export type BrandMarkVariant = 'badge' | 'emerald' | 'gold' | 'white';

const BRAND_MARK_SRC: Record<BrandMarkVariant, string> = {
  badge: '/brand/sanzar-logo-badge-luxury.svg',
  emerald: '/brand/sanzar-logo-mark-emerald.svg',
  gold: '/brand/sanzar-logo-mark-gold.svg',
  white: '/brand/sanzar-logo-mark-white.svg',
};

export const BrandMark: React.FC<{
  size?: number;
  variant?: BrandMarkVariant;
  className?: string;
}> = ({ size = 36, variant = 'badge', className = '' }) => (
  <img
    src={BRAND_MARK_SRC[variant]}
    alt="Sanzar SA Logo"
    width={size}
    height={size}
    draggable={false}
    style={{ width: size, height: size }}
    className={`shrink-0 select-none object-contain ${variant === 'badge' ? 'drop-shadow-sm' : ''} ${className}`}
  />
);

export const SubjectIcon: React.FC<{ icon?: string; className?: string; color?: string }> = ({
  icon,
  className = 'w-5 h-5',
  color,
}) => {
  const props = { className, style: color ? { color } : undefined };
  switch (icon) {
    case 'calc':
      return <Calculator {...props} />;
    case 'atom':
      return <Atom {...props} />;
    case 'flask':
      return <FlaskConical {...props} />;
    case 'leaf':
      return <Leaf {...props} />;
    case 'lang':
      return <Languages {...props} />;
    case 'monitor':
      return <Monitor {...props} />;
    case 'feather':
      return <Feather {...props} />;
    default:
      return <LayoutGrid {...props} />;
  }
};

export const BookCover: React.FC<{
  colors: string[];
  title: string;
  imageUrl?: string | null;
  aspectRatio?: number | null;
  previewDoc?: { url: string; type: string } | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'card';
  className?: string;
}> = ({ colors, title, imageUrl, aspectRatio, previewDoc, size = 'md', className = '' }) => {
  const c1 = colors?.[0] || '#176B4B';
  const c2 = colors?.[1] || '#247754';

  const [imgFailed, setImgFailed] = useState(false);
  const [detected, setDetected] = useState<{ src: string; ratio: number } | null>(null);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  useEffect(() => {
    setImgFailed(false);
    setNaturalRatio(null);
  }, [imageUrl]);

  useEffect(() => {
    if (imageUrl || !previewDoc?.url) return;
    let cancelled = false;
    void import('../lib/thumbnail-extractor')
      .then((m) => m.tryExtractPublicPdfCover(previewDoc.url))
      .then((res) => {
        if (!cancelled && res) {
          setDetected({ src: res.coverImage, ratio: res.coverRatio });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageUrl, previewDoc?.url]);

  const effectiveSrc = !imgFailed && imageUrl ? imageUrl : detected?.src || null;
  const fallbackRatio = previewDoc?.type === 'ppt' ? 1.5 : 0.72;
  const rawRatio = naturalRatio ?? aspectRatio ?? detected?.ratio ?? fallbackRatio;
  const ratio = Math.max(0.5, Math.min(2.0, Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.72));

  const frameStyle: React.CSSProperties = (() => {
    if (size === 'card') {
      return { aspectRatio: String(ratio) };
    }
    const dim = size === 'xs'
      ? { maxW: 58, maxH: 48 }
      : size === 'sm'
        ? { maxW: 110, maxH: 88 }
        : size === 'lg'
          ? { maxW: 210, maxH: 156 }
          : { maxW: 132, maxH: 108 };

    if (ratio >= 1) {
      const w = dim.maxW;
      const h = Math.max(32, Math.round(w / ratio));
      return { width: `${w}px`, height: `${h}px` };
    }
    const h = dim.maxH;
    const w = Math.max(28, Math.round(h * ratio));
    return { width: `${w}px`, height: `${h}px` };
  })();

  if (effectiveSrc) {
    return (
      <div
        style={frameStyle}
        className={`rounded-xl overflow-hidden shadow-sm border border-sanzar-border bg-white dark:bg-slate-900 shrink-0 relative ${className}`}
      >
        <img
          src={effectiveSrc}
          alt={title}
          loading="lazy"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0 && !aspectRatio) {
              setNaturalRatio(el.naturalWidth / el.naturalHeight);
            }
          }}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain block"
        />
      </div>
    );
  }

  return (
    <div
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, ...frameStyle }}
      className={`rounded-xl p-2.5 flex items-end shadow-sm shrink-0 relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10 pointer-events-none" />
      <span className="relative z-10 text-white font-bold text-xs leading-tight line-clamp-3 drop-shadow-sm">
        {title}
      </span>
    </div>
  );
};

export const StatusPill: React.FC<{ s: string }> = ({ s }) => (
  <span className={`sanzar-pill ${s}`}>{s}</span>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-sanzar-muted">
    <div className="w-8 h-8 rounded-full border-2 border-sanzar-border border-t-sanzar-primary animate-spin" />
    <p className="text-sm">{label}</p>
  </div>
);

export const ErrorRetry: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => {
  const { t } = useSettings();
  return (
    <div className="sanzar-card p-8 flex flex-col items-center justify-center text-center gap-3 max-w-md mx-auto my-8">
      <CloudOff className="w-10 h-10 text-sanzar-muted" />
      <p className="text-sm text-sanzar-text2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold hover:bg-sanzar-surface2 transition"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
};

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => {
  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={title}
        className="sanzar-card w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 sm:gap-4 mb-4 pb-3 border-b border-sanzar-border">
          <h2 className="text-base sm:text-lg font-bold m-0 min-w-0 break-words">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-sanzar-surface2 text-sanzar-muted hover:text-sanzar-text transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const ToastCtx = createContext<(msg: string) => void>(() => {});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-50 bg-sanzar-text text-sanzar-bg px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg w-max max-w-[calc(100vw-2rem)] sm:max-w-sm text-center animate-fade-in"
        >
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
};

export const useToast = () => useContext(ToastCtx);

export function timeAgo(t: (k: string, a?: Record<string, string | number>) => string, ms: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 60) return t('justNow');
  if (diff < 3600) return t('minAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('hAgo', { n: Math.floor(diff / 3600) });
  return t('dAgo', { n: Math.floor(diff / 86400) });
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
