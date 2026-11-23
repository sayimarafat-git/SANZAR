import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Lang, translate } from './i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

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
  themeMode: 'system',
  isDark: false,
  setLang: () => {},
  setThemeMode: () => {},
  t: (k) => k,
});

const K_LANG = 'sanzar.lang';
const K_THEME = 'sanzar.theme';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(K_LANG);
    return saved === 'bn' || saved === 'en' || saved === 'zh' ? saved : 'en';
  });

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(K_THEME);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem(K_LANG, next);
  };

  const setThemeMode = (next: ThemeMode) => {
    setThemeModeState(next);
    localStorage.setItem(K_THEME, next);
  };

  const t = (key: string, args?: Record<string, string | number>) => translate(lang, key, args);

  return (
    <SettingsContext.Provider value={{ lang, themeMode, isDark, setLang, setThemeMode, t }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
