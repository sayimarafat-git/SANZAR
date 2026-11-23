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

export const AmbientBackdrop: React.FC = () => (
  <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <div
      className="absolute -top-32 -left-24 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-55 dark:opacity-35"
      style={{ background: 'radial-gradient(circle, rgba(25,180,107,0.42) 0%, rgba(23,107,75,0.12) 60%, transparent 75%)' }}
    />
    <div
      className="absolute -top-20 right-[-6rem] w-[34rem] h-[34rem] rounded-full blur-3xl opacity-50 dark:opacity-30"
      style={{ background: 'radial-gradient(circle, rgba(26,134,160,0.38) 0%, rgba(61,107,255,0.12) 60%, transparent 75%)' }}
    />
    <div
      className="absolute bottom-[-10rem] left-1/4 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-45 dark:opacity-25"
      style={{ background: 'radial-gradient(circle, rgba(198,164,106,0.34) 0%, rgba(36,119,84,0.14) 60%, transparent 75%)' }}
    />
    <div
      className="absolute bottom-10 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-45 dark:opacity-30"
      style={{ background: 'radial-gradient(circle, rgba(37,138,92,0.36) 0%, rgba(18,57,42,0.1) 60%, transparent 75%)' }}
    />
  </div>
);

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
  <div
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.54) }}
    className={`bg-brand-grad flex items-center justify-center text-white font-black leading-none shrink-0 shadow-sm select-none ${className}`}
  >
    S
  </div>
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
  className?: string;
}> = ({ colors, title, className = 'w-24 h-32' }) => {
  const c1 = colors?.[0] || '#176B4B';
  const c2 = colors?.[1] || '#247754';
  return (
    <div
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={title}
        className="sanzar-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-sanzar-border">
          <h2 className="text-lg font-bold m-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-sanzar-surface2 text-sanzar-muted hover:text-sanzar-text transition"
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
          className="fixed right-5 bottom-20 md:bottom-6 z-50 bg-sanzar-text text-sanzar-bg px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg max-w-sm animate-fade-in"
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
