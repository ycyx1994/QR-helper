import './app.css';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import App from './App.svelte';
import { setupI18n } from './lib/i18n';
import { settings } from './lib/settings';
import { registerSW } from 'virtual:pwa-register';
import { initInstallPrompt } from './lib/pwa';

setupI18n(get(settings).lang);
initInstallPrompt();

const app = mount(App, { target: document.getElementById('app')! });

registerSW({ immediate: true });

// 禁用移动端缩放：双指捏合（iOS gesture 事件 + 多点触控）与双击缩放
for (const g of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
  document.addEventListener(g, (e) => e.preventDefault());
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

export default app;
