import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api-client';
import { useAuth } from './auth-context';
import { useSettings } from './settings-context';
import { useStudyTracker } from './study-tracker';
import { useToast } from '../components/SanzarUI';

const STORAGE_KEY = 'sanzar.focusTimer.v1';
const DEFAULT_MINS = 25;

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

function unlockFocusAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // ignore audio unlock errors
  }
}

function playFocusRing(customDataUrl?: string | null) {
  if (customDataUrl && typeof window !== 'undefined') {
    try {
      const audio = new Audio(customDataUrl);
      audio.volume = 0.9;
      void audio.play().catch(() => {
        playDefaultFocusChime();
      });
      return;
    } catch {
      // Fall back to default chime
    }
  }
  playDefaultFocusChime();
}

function playDefaultFocusChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const base = ctx.currentTime + 0.02;
    // Play a clear, pleasant 2-round bell chime (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.5, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, base + idx * 0.22);
      gain.gain.setValueAtTime(0.001, base + idx * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.28, base + idx * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, base + idx * 0.22 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(base + idx * 0.22);
      osc.stop(base + idx * 0.22 + 0.4);
    });
  } catch {
    // ignore Web Audio errors on restricted devices
  }
}

interface StoredFocusState {
  durationMins: number;
  totalSec: number;
  endAt: number | null;
}

interface FocusTimerContextValue {
  durationMins: number;
  setDurationMins: (mins: number) => void;
  totalSec: number;
  remainingSec: number;
  running: boolean;
  start: (minsOverride?: number) => void;
  stop: () => void;
}

const readStored = (): StoredFocusState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { durationMins: DEFAULT_MINS, totalSec: DEFAULT_MINS * 60, endAt: null };
    const parsed = JSON.parse(raw) as Partial<StoredFocusState>;
    const durationMins =
      typeof parsed.durationMins === 'number' && parsed.durationMins >= 1 && parsed.durationMins <= 180
        ? Math.round(parsed.durationMins)
        : DEFAULT_MINS;
    const totalSec =
      typeof parsed.totalSec === 'number' && parsed.totalSec >= 60
        ? Math.round(parsed.totalSec)
        : durationMins * 60;
    const rawEndAt = typeof parsed.endAt === 'number' && Number.isFinite(parsed.endAt) ? parsed.endAt : null;
    if (rawEndAt !== null && rawEndAt <= Date.now()) {
      const reset: StoredFocusState = { durationMins, totalSec: durationMins * 60, endAt: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
      return reset;
    }
    return { durationMins, totalSec, endAt: rawEndAt };
  } catch {
    return { durationMins: DEFAULT_MINS, totalSec: DEFAULT_MINS * 60, endAt: null };
  }
};

const writeStored = (next: StoredFocusState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
};

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null);

export const FocusTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { t } = useSettings();
  const toast = useToast();
  const qc = useQueryClient();

  const [state, setState] = useState<StoredFocusState>(() => readStored());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const cfgQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ config: Record<string, unknown> }>('/v1/config'),
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const customSoundUrl =
    (cfgQuery.data?.config?.focus_sound as { dataUrl?: string | null } | undefined)?.dataUrl ?? null;

  const running = state.endAt !== null && state.endAt > nowMs;
  const remainingSec = state.endAt !== null
    ? Math.max(0, Math.ceil((state.endAt - nowMs) / 1000))
    : state.durationMins * 60;

  useStudyTracker('focus', {
    active: running && !!user,
    playing: running && !!user,
    onFlushed: () => {
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  // Sync across tabs and focus returns
  useEffect(() => {
    const sync = () => {
      setNowMs(Date.now());
      setState(readStored());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Tick while running and complete cleanly on wall-clock expiration
  useEffect(() => {
    if (state.endAt === null) return;
    const endAt = state.endAt;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      if (now >= endAt) {
        const doneState: StoredFocusState = {
          durationMins: state.durationMins,
          totalSec: state.durationMins * 60,
          endAt: null,
        };
        writeStored(doneState);
        setState(doneState);
        void qc.invalidateQueries({ queryKey: ['progress'] });
        playFocusRing(customSoundUrl);
        toast(t('focusDone'));
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [state.endAt, state.durationMins, customSoundUrl, qc, t, toast]);

  const setDurationMins = useCallback((mins: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(mins)));
    setState((prev) => {
      if (prev.endAt !== null && prev.endAt > Date.now()) return prev;
      const next: StoredFocusState = {
        durationMins: clamped,
        totalSec: clamped * 60,
        endAt: null,
      };
      writeStored(next);
      return next;
    });
  }, []);

  const start = useCallback((minsOverride?: number) => {
    unlockFocusAudio();
    const now = Date.now();
    setNowMs(now);
    setState((prev) => {
      const mins =
        typeof minsOverride === 'number'
          ? Math.max(1, Math.min(180, Math.round(minsOverride)))
          : prev.durationMins;
      const totalSec = mins * 60;
      const next: StoredFocusState = {
        durationMins: mins,
        totalSec,
        endAt: now + totalSec * 1000,
      };
      writeStored(next);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setNowMs(Date.now());
    setState((prev) => {
      const next: StoredFocusState = {
        durationMins: prev.durationMins,
        totalSec: prev.durationMins * 60,
        endAt: null,
      };
      writeStored(next);
      return next;
    });
  }, []);

  return (
    <FocusTimerContext.Provider
      value={{
        durationMins: state.durationMins,
        setDurationMins,
        totalSec: state.totalSec,
        remainingSec,
        running,
        start,
        stop,
      }}
    >
      {children}
    </FocusTimerContext.Provider>
  );
};

export const useFocusTimer = (): FocusTimerContextValue => {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) throw new Error('useFocusTimer must be used within FocusTimerProvider');
  return ctx;
};
