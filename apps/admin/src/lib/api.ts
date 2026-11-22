'use client';
import type { Session } from './auth';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

let current: Session | null = null;
export const setSession = (s: Session | null) => { current = s; };

export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!current) throw new ApiError(401, 'unauthenticated', 'Please sign in');
  if (!API_BASE) throw new ApiError(0, 'configuration', 'Backend is not configured yet.');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method || 'GET',
      headers: { authorization: `Bearer ${await current.token()}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error — check the connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || `http-${res.status}`, data?.error?.message || `Request failed (${res.status})`);
  return data as T;
}
