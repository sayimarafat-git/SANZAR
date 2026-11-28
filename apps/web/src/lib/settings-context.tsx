import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Lang, translate } from './i18n';

export type ThemeMode = 'light' | 'dark';

interface SettingsContextType {
  lang: Lang;
  themeMode: ThemeMode;
  isDark: boolean;
  dailyGoalMinutes: number | null;
  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setDailyGoalMinutes: (minutes: number) => number;
  t: (key: string, args?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<SettingsContextType>({
  lang: 'en',
  themeMode: 'light',
  isDark: false,
  dailyGoalMinutes: null,
  setLang: () => {},
  setThemeMode: () => {},
  setDailyGoalMinutes: () => 60,
  t: (k) => k,
});

const K_LANG = 'sanzar.lang';
const K_THEME = 'sanzar.theme';
const K_DAILY_GOAL = 'sanzar.dailyGoalMinutes';

export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 240;

export const clampDailyGoal = (minutes: number): number =>
  Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, Math.round(minutes)));

const normalizeDailyGoal = (raw: string | null): number | null => {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clampDailyGoal(parsed);
};

const normalizeTheme = (raw: string | null): ThemeMode => (raw === 'dark' ? 'dark' : 'light');
const normalizeLang = (raw: string | null): Lang =>
  raw === 'bn' || raw === 'en' || raw === 'zh' || raw === 'id' ? raw : 'en';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => normalizeLang(localStorage.getItem(K_LANG)));

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(K_THEME);
    const normalized = normalizeTheme(saved);
    if (saved !== normalized) {
      localStorage.setItem(K_THEME, normalized);
    }
    return normalized;
  });

  const [dailyGoalMinutes, setDailyGoalState] = useState<number | null>(() =>
    normalizeDailyGoal(localStorage.getItem(K_DAILY_GOAL))
  );

  const isDark = themeMode === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const syncFromStorage = () => {
      const nextTheme = normalizeTheme(localStorage.getItem(K_THEME));
      const nextLang = normalizeLang(localStorage.getItem(K_LANG));
      const nextGoal = normalizeDailyGoal(localStorage.getItem(K_DAILY_GOAL));
      setThemeModeState((prev) => (prev === nextTheme ? prev : nextTheme));
      setLangState((prev) => (prev === nextLang ? prev : nextLang));
      setDailyGoalState((prev) => (prev === nextGoal ? prev : nextGoal));
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === K_THEME || e.key === K_LANG || e.key === K_DAILY_GOAL) syncFromStorage();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', syncFromStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const setLang = (next: Lang) => {
    const valid = normalizeLang(next);
    setLangState(valid);
    localStorage.setItem(K_LANG, valid);
  };

  const setThemeMode = (next: ThemeMode) => {
    const valid = normalizeTheme(next);
    setThemeModeState(valid);
    localStorage.setItem(K_THEME, valid);
  };

  const setDailyGoalMinutes = (minutes: number): number => {
    const valid = clampDailyGoal(minutes);
    setDailyGoalState(valid);
    localStorage.setItem(K_DAILY_GOAL, String(valid));
    return valid;
  };

  const t = (key: string, args?: Record<string, string | number>) => translate(lang, key, args);

  return (
    <SettingsContext.Provider
      value={{ lang, themeMode, isDark, dailyGoalMinutes, setLang, setThemeMode, setDailyGoalMinutes, t }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
