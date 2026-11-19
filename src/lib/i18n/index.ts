import { addMessages, init, locale, getLocaleFromNavigator } from 'svelte-i18n';
import zhCN from '../locales/zh-CN';
import en from '../locales/en';

export type LangPref = 'auto' | 'zh-CN' | 'en';

addMessages('zh-CN', zhCN);
addMessages('en', en);

export type MessageKey = keyof typeof zhCN;

function resolveLang(pref: LangPref): 'zh-CN' | 'en' {
  if (pref !== 'auto') return pref;
  return (getLocaleFromNavigator() ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function setupI18n(pref: LangPref = 'auto'): 'zh-CN' | 'en' {
  const lang = resolveLang(pref);
  init({ fallbackLocale: 'zh-CN', initialLocale: lang });
  applyHtmlLang(lang);
  return lang;
}

export function switchLang(pref: LangPref): 'zh-CN' | 'en' {
  const lang = resolveLang(pref);
  locale.set(lang);
  applyHtmlLang(lang);
  return lang;
}

function applyHtmlLang(lang: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  const href = lang === 'en' ? './manifest.en.webmanifest' : './manifest.zh-CN.webmanifest';
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}
