import { writable, get } from 'svelte/store';

/** Chrome/Edge 的 beforeinstallprompt 事件（TS 标准库未收录，自定义） */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 捕获到的安装事件（null = 当前环境无安装入口） */
export const deferredPrompt = writable<BeforeInstallPromptEvent | null>(null);

/** 已作为 PWA 安装（standalone 显示模式） */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari：只能走「分享 → 添加到主屏幕」，无 beforeinstallprompt */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua);
}

/** 全局监听一次：拦截浏览器默认迷你安装栏，改为应用内提示 */
export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.set(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => deferredPrompt.set(null));
}

/** 触发安装弹窗；返回用户选择。事件一次性消费 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = get(deferredPrompt);
  if (!ev) return 'unavailable';
  deferredPrompt.set(null);
  await ev.prompt();
  const choice = await ev.userChoice;
  return choice.outcome;
}
