import { useEffect, useRef } from 'react';
import { apiRequest, ApiError, hasAuthTokenProvider } from './api-client';

const K_QUEUE = 'sanzar.study.queue';
const IDLE_MS = 120_000;
const MAX_EVENT_SEC = 600;

interface QueuedEvent {
  id: string;
  type: 'notes' | 'pdf' | 'video' | 'ppt' | 'exam' | 'focus';
  chapterId?: string | null;
  resourceId?: string | null;
  sec: number;
  startedAt: number;
}

function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(K_QUEUE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedEvent[]) {
  localStorage.setItem(K_QUEUE, JSON.stringify(q.slice(-500)));
}

let inflightFlush: Promise<void> | null = null;

export async function flushStudyEvents(onFlushed?: () => void): Promise<void> {
  if (!hasAuthTokenProvider()) return;
  if (inflightFlush) return inflightFlush;
  inflightFlush = (async () => {
    try {
      while (true) {
        const q = readQueue();
        if (!q.length) break;
        const batch = q.slice(0, 50);
        try {
          await apiRequest('/v1/study/events', {
            method: 'POST',
            bodyJson: { events: batch },
          });
          onFlushed?.();
        } catch (e) {
          if (e instanceof ApiError && (e.isNetwork || e.status >= 500 || e.status === 429 || e.status === 401)) {
            break;
          }
        }
        const sentIds = new Set(batch.map((b) => b.id));
        writeQueue(readQueue().filter((x) => !sentIds.has(x.id)));
      }
    } finally {
      inflightFlush = null;
    }
  })();
  return inflightFlush;
}

export function useStudyTracker(
  type: 'notes' | 'pdf' | 'video' | 'ppt' | 'exam' | 'focus',
  opts: { chapterId?: string | null; resourceId?: string | null; active?: boolean; playing?: boolean; onFlushed?: () => void } = {}
) {
  const { chapterId = null, resourceId = null, active = true, playing = false, onFlushed } = opts;
  const secRef = useRef(0);
  const lastActRef = useRef(Date.now());
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!active || !hasAuthTokenProvider()) return;
    secRef.current = 0;
    lastActRef.current = Date.now();

    const cut = () => {
      const sec = secRef.current;
      if (sec <= 0) return;
      secRef.current = 0;
      const ev: QueuedEvent = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        type,
        chapterId,
        resourceId,
        sec,
        startedAt: Date.now() - sec * 1000,
      };
      const q = readQueue();
      q.push(ev);
      writeQueue(q);
    };

    const bump = () => {
      lastActRef.current = Date.now();
    };

    const onVisibility = () => {
      if (document.hidden) {
        cut();
        void flushStudyEvents(onFlushed);
      } else {
        bump();
      }
    };

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      if (!playingRef.current && now - lastActRef.current > IDLE_MS) return;
      secRef.current += 1;
      if (secRef.current >= MAX_EVENT_SEC) {
        cut();
        void flushStudyEvents(onFlushed);
      }
    }, 1000);

    window.addEventListener('pointerdown', bump, { passive: true });
    window.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('keydown', bump, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('scroll', bump);
      window.removeEventListener('keydown', bump);
      document.removeEventListener('visibilitychange', onVisibility);
      cut();
      void flushStudyEvents(onFlushed);
    };
  }, [type, chapterId, resourceId, active]);
}
