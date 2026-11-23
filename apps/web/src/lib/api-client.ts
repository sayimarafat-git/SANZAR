import { auth } from './firebase';
import type { Catalog } from './models';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public isNetwork = false
  ) {
    super(message);
  }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { bodyJson?: unknown } = {}
): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers(options.headers || {});

  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  let body = options.body;
  if (options.bodyJson !== undefined) {
    body = JSON.stringify(options.bodyJson);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  } else if (!headers.has('Content-Type') && !(body instanceof FormData) && body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      body,
      headers,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error — check your connection and try again.', true);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : null) ||
      data?.message ||
      `Request failed (${response.status})`;
    const code = data?.error?.code || `http-${response.status}`;
    throw new ApiError(response.status, code, msg);
  }

  return data as T;
}

export async function apiUploadBytes<T = any>(
  endpoint: string,
  bytes: ArrayBuffer | Uint8Array,
  mime: string
): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers({ 'Content-Type': mime });
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: bytes as BodyInit,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error — upload failed.', true);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code || `http-${response.status}`,
      data?.error?.message || `Upload failed (${response.status})`
    );
  }
  return data as T;
}

const K_CAT = 'sanzar.catalog.body';
const K_ETAG = 'sanzar.catalog.etag';

export async function fetchCatalogWithCache(): Promise<{ catalog: Catalog; offline: boolean }> {
  const cachedRaw = localStorage.getItem(K_CAT);
  const cached = cachedRaw ? (JSON.parse(cachedRaw) as Catalog) : null;
  const etag = cached ? localStorage.getItem(K_ETAG) : null;

  const user = auth.currentUser;
  if (!user) {
    if (cached) return { catalog: cached, offline: true };
    throw new ApiError(401, 'unauthenticated', 'Sign in required');
  }

  try {
    const token = await user.getIdToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (etag) headers['If-None-Match'] = etag;
    const res = await fetch(`${API_BASE}/v1/catalog`, { headers });
    if (res.status === 304 && cached) {
      return { catalog: cached, offline: false };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err?.error?.code || 'http', err?.error?.message || 'Catalog failed');
    }
    const text = await res.text();
    const parsed = JSON.parse(text) as Catalog;
    localStorage.setItem(K_CAT, text);
    const nextEtag = res.headers.get('etag');
    if (nextEtag) localStorage.setItem(K_ETAG, nextEtag);
    return { catalog: parsed, offline: false };
  } catch (e) {
    if (cached) return { catalog: cached, offline: true };
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'network', 'Offline and no cached catalog', true);
  }
}
