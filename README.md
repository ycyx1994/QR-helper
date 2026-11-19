# QR Helper

> 在线体验（GitHub Pages）：https://ycyx1994.github.io/QR-helper/

全平台 PWA 二维码 / 条形码工具箱：**纯本地运行、零网络请求**，可扫码、可生成，支持安装到桌面与手机主屏，可直接部署到 GitHub Pages。

## 功能

**扫码（Camera Scan）**
- 摄像头实时扫码（zxing-wasm 解码，Web Worker 运行，不阻塞 UI）
- 图片识别：拖拽 / 粘贴 / 选择文件（iOS standalone 相机受限时的兜底）
- 闪光灯开关（支持 torch 的设备）
- 结果智能动作：打开网址、拨号、发邮件、发短信、下载 vCard (.vcf)、下载日历 (.ics)、复制、一键转生成
- 扫码反馈：震动 + 提示音（可在设置关闭）
- 同码 2.5s 冷却，避免重复弹卡

**生成（Generate）**
- 8 种内容：文本 / 网址 / WiFi / vCard / 日历事件 / 电话 / 邮件 / 短信
- 13 种码制：QR Code、Data Matrix、PDF417、Aztec、EAN-13、EAN-8、UPC-A、UPC-E、Code 128、Code 39、Code 93、Codabar、ITF
- QR 纠错等级 L/M/Q/H；EAN/UPC 校验位自动补全
- 导出 PNG / SVG，一键复制

**历史（History）**
- 最近 200 条本地记录（localStorage），搜索、多选删除、清空
- 导出 CSV（防公式注入处理）

**设置（Settings）**
- 外观：浅色 / 深色 / 跟随系统 + 6 组强调色
- 反馈：提示音、震动开关
- 语言：跟随系统 / 中文 / English（含 manifest 本地化）
- 数据：导出 / 清空

## 特性

- **纯本地、零网络**：解码引擎 (zxing-wasm) 与生成引擎 (bwip-js) 全部本地打包，无任何外部请求、无遥测
- **PWA 离线**：Service Worker 预缓存全部资源（含 wasm），断网可用，可安装
- **跨平台**：iOS Safari / Android Chrome / 桌面浏览器（摄像头需 HTTPS 或 localhost）

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Svelte 5 + TypeScript + Vite |
| 解码 | zxing-wasm 3.1.7（Web Worker，本地 wasm） |
| 生成 | bwip-js 4.11.4（动态按需加载） |
| UI | 自研 Material 3 Expressive 组件（零 UI 框架依赖） |
| i18n | svelte-i18n（zh-CN / en） |
| PWA | vite-plugin-pwa（Workbox 预缓存） |

## 开发

```bash
npm ci          # 安装
npm run dev     # 开发（http://localhost:5173）
npm test        # 往返测试：payload 构建 → 渲染 → 解码（37 项）
npm run check   # svelte-check 类型与 a11y
npm run build   # 产物在 dist/
npm run icons   # 重新生成 PWA 图标（Pillow）
```

## 部署到 GitHub Pages

1. 推送到 GitHub 仓库 `main` 分支
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. 推送后 `deploy.yml` 自动测试、构建（`PWA_BASE=/<repo>/`）、部署

本地预览产物：

```bash
npm run build && npm run preview
```

## 隐私

全部处理在浏览器本地完成。应用不发起任何网络请求（首次加载资源除外），历史记录仅存于 localStorage，可随时导出或清空。

## 目录结构

```
├── src/
│   ├── lib/
│   │   ├── decoder/        # zxing-wasm Worker 解码器
│   │   ├── payloads.ts     # 8 种 payload 构建 + bwip 渲染
│   │   ├── actions.ts      # 扫码结果智能动作识别
│   │   ├── history.ts      # localStorage 历史 + CSV 导出
│   │   ├── settings.ts     # 主题 / 强调色 / 语言偏好
│   │   ├── i18n/locales/   # 中英语言包
│   │   └── ui/             # Icon / Switch / toast
│   ├── views/              # Scan / Generate / History / Settings
│   └── app.css             # Material 3 Expressive 设计令牌与组件
├── tools/                  # 图标生成 + 往返测试
└── .github/workflows/      # GitHub Pages 部署
```

## 许可

MIT
