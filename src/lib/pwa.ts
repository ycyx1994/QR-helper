import { writable, get } from 'svelte/store';
import { registerSW } from 'virtual:pwa-register';

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

/** 触发安装弹窗；返回用户选择。事件一次性消费。
 *  兜底：事件从未发生（iOS PWA / 不支持的浏览器）、已安装、prompt/userChoice 抛错或挂起时
 *  一律返回 'unavailable'（调用方据此走手动安装文案分支），不抛未捕获异常、不挂起 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = get(deferredPrompt);
  if (!ev || isStandalone()) return 'unavailable';
  deferredPrompt.set(null);
  try {
    await ev.prompt();
    // 部分环境 userChoice 永不 resolve：60s 兜底返回，避免调用方挂起
    let timer: ReturnType<typeof setTimeout> | undefined;
    const choice = await Promise.race([
      ev.userChoice,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 60_000);
      })
    ]).finally(() => clearTimeout(timer));
    return choice?.outcome ?? 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/* ==================== Service Worker 更新（prompt 模式） ==================== */

/** 有新版本待更新 */
export const updateAvailable = writable(false);
/** 正在检查更新 */
export const updateChecking = writable(false);

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
/** 每小时后台查新的 interval 句柄（模块级，防重复 init 泄漏） */
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

/** 注册 SW：检测到新版本只提示（onNeedRefresh），由用户触发更新 */
export function initSwUpdate(): void {
  stopSwUpdateCheck(); // 重复 init 时先清旧 interval，避免泄漏多个定时器
  updateSWFn = registerSW({
    immediate: true,
    onNeedRefresh: () => updateAvailable.set(true),
    onRegisteredSW: (_swUrl, reg) => {
      swRegistration = reg ?? null;
      // 每小时后台静默查一次（常驻标签/已安装 PWA 也能发现新版本）
      stopSwUpdateCheck();
      updateCheckTimer = setInterval(() => void reg?.update(), 3_600_000);
    }
  });
}

/** 停止后台定时检查更新（重复 init / 应用销毁时清理 interval） */
export function stopSwUpdateCheck(): void {
  if (updateCheckTimer !== null) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

/** 主动检查更新；返回是否发现新版本（最多等 5s 安装完成） */
export async function checkForUpdate(): Promise<boolean> {
  if (!swRegistration) return false;
  updateChecking.set(true);
  try {
    await swRegistration.update().catch(() => {});
    for (let i = 0; i < 20; i++) {
      if (swRegistration.waiting || get(updateAvailable)) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  } finally {
    updateChecking.set(false);
  }
}

/** 应用更新：skipWaiting → 新 SW 接管 → 页面自动刷新 */
export function applyUpdate(): void {
  void updateSWFn?.(true);
}
