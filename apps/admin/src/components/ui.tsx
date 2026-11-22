'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); } }, [msg]);
  return <ToastCtx.Provider value={setMsg}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

/** Loads data once (and on reload()), exposing loading/error state. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setError(null);
    run().then((d) => live && setData(d)).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [run, n]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  if (error) return <div className="errors" role="alert">{error} {onRetry && <button onClick={onRetry}>Retry</button>}</div>;
  return <p className="muted">Loading…</p>;
}

export function Errors({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <div className="errors" role="alert"><ul>{list.map((e) => <li key={e}>{e}</li>)}</ul></div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="top"><h2 style={{ margin: 0 }}>{title}</h2><button onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Save button wrapper: runs fn, shows toast or error. */
export function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const save = async (fn: () => Promise<unknown>, ok = 'Saved') => {
    setBusy(true); setErrors([]);
    try { await fn(); toast(ok); return true; } catch (e) { setErrors([errorText(e)]); return false; } finally { setBusy(false); }
  };
  return { busy, errors, setErrors, save };
}

export const Status = ({ s }: { s: string }) => <span className={`pill ${s}`}>{s}</span>;
