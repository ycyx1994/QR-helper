import { writable } from 'svelte/store';
import type { LangPref } from './i18n';

export type ThemePref = 'light' | 'dark' | 'system';

export type AccentPreset = 'green' | 'blue' | 'violet' | 'pink' | 'orange' | 'slate';

export interface Settings {
  theme: ThemePref;
  accent: AccentPreset;
  sound: boolean;
  vibrate: boolean;
  lang: LangPref;
}

const DEFAULTS: Settings = {
  theme: 'system',
  accent: 'green',
  sound: true,
  vibrate: true,
  lang: 'auto'
};

const KEY = 'qrhelper.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* 忽略损坏数据 */
  }
  return { ...DEFAULTS };
}

function createSettings() {
  const { subscribe, update, set } = writable<Settings>(load());

  subscribe((s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 存储满则忽略 */
    }
    applyTheme(s);
  });

  return {
    subscribe,
    set,
    update,
    reset: () => set({ ...DEFAULTS })
  };
}

function applyTheme(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark =
    s.theme === 'dark' ||
    (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.accent = s.accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0E1116' : '#2E6B3E');
}

export const settings = createSettings();

// 跟随系统时监听系统主题变化
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    settings.update((s) => ({ ...s }));
  });
}
