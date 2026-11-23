import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Lang, translate } from './i18n';

export type ThemeMode = 'light' | 'dark';

interface SettingsContextType {
  lang: Lang;
  themeMode: ThemeMode;
  isDark: boolean;
  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
  t: (key: string, args?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<SettingsContextType>({
  lang: 'en',
  themeMode: 'light',
  isDark: false,
  setLang: () => {},
  setThemeMode: () => {},
  t: (k) => k,
});

const K_LANG = 'sanzar.lang';
const K_THEME = 'sanzar.theme';

const normalizeTheme = (raw: string | null): ThemeMode => (raw === 'dark' ? 'dark' : 'light');
const normalizeLang = (raw: string | null): Lang => (raw === 'bn' || raw === 'en' || raw === 'zh' ? raw : 'en');

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
      setThemeModeState((prev) => (prev === nextTheme ? prev : nextTheme));
      setLangState((prev) => (prev === nextLang ? prev : nextLang));
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === K_THEME || e.key === K_LANG) syncFromStorage();
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

  const t = (key: string, args?: Record<string, string | number>) => translate(lang, key, args);

  return (
    <SettingsContext.Provider value={{ lang, themeMode, isDark, setLang, setThemeMode, t }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
