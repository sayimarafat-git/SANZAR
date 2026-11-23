import { auth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers(options.headers || {});
  
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return response.json();
}
