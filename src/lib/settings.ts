import { writable } from 'svelte/store';
import type { LangPref } from './i18n';

export type ThemePref = 'light' | 'dark' | 'system';

export type AccentPreset = 'green' | 'blue' | 'violet' | 'pink' | 'orange' | 'slate';

export interface Settings {
  theme: ThemePref;
  accent: AccentPreset;
  sound: boolean;
  vibrate: boolean;
  autoCamera: boolean;
  lang: LangPref;
}

const DEFAULTS: Settings = {
  theme: 'system',
  accent: 'slate',
  sound: true,
  vibrate: true,
  // 扫码页自动开相机：手机默认开，PC（≥1024px）默认关
  autoCamera: typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches,
  lang: 'auto'
};

const KEY = 'qrhelper.settings';
const VER_KEY = 'qrhelper.settings.v';
const VER = 2;

function load(): Settings {
  let s: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      s = { ...DEFAULTS, ...JSON.parse(raw) };
      // v2 迁移：旧默认色 green 会被自动持久化，统一迁到新默认 slate；
      // 用户显式选过的其他颜色保留。VER_KEY 防止日后显式选 green 被再次迁移。
      if (localStorage.getItem(VER_KEY) !== String(VER) && s.accent === 'green') {
        s.accent = 'slate';
      }
    }
    if (localStorage.getItem(VER_KEY) !== String(VER)) {
      localStorage.setItem(VER_KEY, String(VER));
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return s;
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
