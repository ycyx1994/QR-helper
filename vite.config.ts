import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// GH Pages 项目页部署于 /<repo>/ 子路径，由 CI 传入 PWA_BASE；本地/预览默认 '/'
const base = process.env.PWA_BASE || '/';

// HTTPS=1 时启用自签证书（手机局域网测相机用；getUserMedia 需要安全上下文）
const https = !!process.env.HTTPS;

export default defineConfig({
  base,
  plugins: [
    ...(https ? [basicSsl()] : []),
    svelte(),
    VitePWA({
      registerType: 'prompt',
      // manifest 由 public/ 静态双语文件提供（zh-CN / en 运行时切换 link）
      manifest: false,
      // public 静态资源（icons/favicon/双 manifest）已由 globPatterns 全量覆盖，
      // 不再用 includeAssets 重复列出——避免 precache manifest 出现重复条目，
      // 且 glob 键不带 ?query（与 index.html 的 favicon 引用保持一致）
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest,ico}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      }
    })
  ],
  worker: { format: 'es' },
  build: { target: 'es2022' }
});
