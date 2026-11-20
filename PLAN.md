# QR Helper — 全平台 PWA 二维码/条码工具 技术方案

> 状态：已实现（v1，M1–M4 全部完成，见 §13 实现与验收记录）。本文档保留实现前方案框架，与现实的偏差已在文内「实现偏差」标注及 §13 汇总。
> 约束已确认：**联网功能一律不做，保持纯本地**（用户确认，2026-11-19）。

---

## 1. 背景与目标

对标 Android 开源应用 [Atharok/BarcodeScanner](https://gitlab.com/Atharok/BarcodeScanner)（GPL-3.0，Kotlin + CameraX + ZXing，最新 1.26.3）的功能体验，做一个**全平台 PWA**：

- 浏览器直接访问（手机 / 平板 / 桌面），可"添加到主屏幕"安装；
- **纯本地运行**：解码、生成、历史、全部动作零网络请求（安装后完全离线可用）；
- 二维码与条码的**解析 + 生成**双向能力；
- 部署到 **GitHub Pages**（免费、HTTPS、全站相对路径）。

### 1.1 与 Atharok 的范围对照（做什么 / 不做什么）

| Atharok 功能 | 本方案 | 说明 |
|---|---|---|
| 摄像头即时扫码 | ✅ 做 | `getUserMedia` + Worker 解码 |
| 相册图片扫码（裁剪） | ✅ 做 | 文件 / 粘贴 / 拖拽（裁剪区未实现） |
| 全格式读取（QR/DM/PDF417/Aztec + EAN/UPC/Code39/93/128/Codabar/ITF） | ✅ 做 | zxing-wasm，格式表与 Atharok 完全一致 |
| 条码生成（全格式、可调颜色/边距） | ✅ 做 | bwip-js |
| 内容智能动作（vCard→联系人 / 日历 / 开网址 / WiFi） | ✅ 做 | .vcf / .ics 下载、tel/mailto/https、WiFi 配置码 |
| 历史记录（含多选删除） | ✅ 做 | localStorage，多选删除 + 导出 CSV |
| Material 3 深/浅主题 | ✅ 做 | CSS 变量 + 深/浅/跟随系统 |
| PWA 离线安装 | ✅ 做 | Service Worker 预缓存 |
| 商品信息查询（Open Food Facts 等） | ❌ 不做 | 需联网，已确认剔除 |
| 站外搜索（Amazon/Fnac） | ❌ 不做 | 同上 |
| Material You 壁纸取色 | ❌ 不做 | Web 无对应 API，用主题色自定义替代 |
| 14 语言 Weblate | ⭕ 缩减为 zh-CN/en 双语 | 见 §12 i18n（svelte-i18n + TS 键完整性约束） |

**许可红线**：Atharok 为 GPL-3.0，其代码一行不复用。全部功能自主实现，仅使用 MIT/Apache 依赖，PWA 本体建议 MIT 许可。

---

## 2. 技术选型（已定）

| 决策点 | 选型 | 理由 |
|---|---|---|
| 解码引擎 | **zxing-wasm**（zxing-cpp 的 WASM 构建，Apache-2.0） | ① 格式覆盖与 Atharok 完全一致；② 与 Atharok 所用 ZXing 同源算法；③ Safari/iOS 的 `BarcodeDetector` 默认禁用（[caniuse](https://caniuse.com/mdn-api_barcodedetector)），WASM 是唯一全平台路径；④ zxing-js（纯 JS 版）已进维护模式不选 |
| 生成引擎 | **bwip-js**（MIT） | 纯 JS，1D/2D 全格式生成，canvas/SVG 双输出，对齐 Atharok 生成能力 |
| 技术栈 | **Svelte 5 + TypeScript + Vite 8 + vite-plugin-pwa**（§10 选型，推翻初版"纯原生 JS 零构建"设想） | runes 响应式、编译产物无 runtime、Worker/WASM 一等公民；"纯本地"约束不变（构建链仅存在于开发期） |
| 解码执行位置 | **Web Worker** | 解码不阻塞 UI；帧数据经 `transferable` 传递 |
| 存储 | localStorage（≤200 条） | 历史数据量小；结构预留 IndexedDB 升级路径 |
| 离线 | Service Worker 预缓存 + cache-first | 含 wasm 文件一次缓存永久离线 |
| 部署 | GitHub Actions（actions/deploy-pages） | 推送 main 自动 check+test+build+deploy 上线 |

### 2.1 体积预算（首屏加载）

| 资源 | 体积 | 缓存后 |
|---|---|---|
| zxing_reader.wasm + Worker 解码器 | 947 KB + 36 KB | SW 预缓存，离线 0 请求 |
| bwip-js 动态分包（生成页按需 async import） | 916 KB | 同上 |
| 应用代码 + 样式（index + css） | 158 KB + 17 KB | 同上 |
| **合计** | **≈2.1 MB**（一次性，SW 预缓存 14 项） | 首屏 < 1s（4G），离线秒开 |

---

## 3. 系统架构

```
┌────────────────────────────────────────────────────────┐
│               index.html（Svelte 5 SPA）                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ 扫码页    │  │ 生成页    │  │ 历史页   │  │ 设置页  │  │
│  │ScanView  │  │Generate… │  │History…  │  │Settings│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       │             │             │             │       │
│  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌───▼────┐  │
│  │decoder/  │  │payloads. │  │history.ts│  │settings│  │
│  │Worker 解码│  │ts 生成管线│  │存储层     │  │.ts 偏好│  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────────┘  │
│  ┌────▼─────┐  ┌────▼─────┐  ┌──────────┐              │
│  │actions.ts│  │ pwa.ts   │  │ sw.js    │              │
│  │类型识别  │  │安装/更新  │  │(构建生成) │              │
│  │+智能动作 │  └──────────┘  │ 离线缓存  │              │
│  └──────────┘               └──────────┘              │
│        App.svelte（4 tab 轻路由/主题/i18n 全局壳）       │
└────────────────────────────────────────────────────────┘
   ┌────────────────────┐   ┌────────────────────┐
   │ zxing-wasm（npm）   │   │ bwip-js（npm）      │
   │ Worker 内 wasm 解码 │   │ 动态分包，全格式生成 │
   └────────────────────┘   └────────────────────┘
   （全部运行于浏览器本地，零网络请求）
```

### 3.1 目录结构

```
QR-helper/
├── index.html                  # SPA 入口
├── public/
│   ├── favicon.svg
│   ├── icons/                  # 192/512/maskable/apple-touch
│   ├── manifest.zh-CN.webmanifest   # 双语 PWA 清单（按语言切换 link[rel=manifest]）
│   └── manifest.en.webmanifest
├── src/
│   ├── main.ts                 # 入口：i18n/主题/SW/安装提示初始化
│   ├── App.svelte              # 4 tab 轻路由（?tab=）、全局布局
│   ├── app.css                 # Material 3 Expressive 设计令牌与组件
│   ├── lib/
│   │   ├── decoder/            # decoder.worker.ts + Decoder 封装（zxing-wasm）
│   │   ├── payloads.ts         # 8 种 payload 构建 + bwip-js 渲染
│   │   ├── actions.ts          # 扫码结果智能动作识别
│   │   ├── history.ts          # localStorage 历史 + CSV 导出
│   │   ├── settings.ts         # 主题 / 强调色 / 语言偏好
│   │   ├── pwa.ts              # 安装提示 + 软件更新
│   │   ├── i18n/ + locales/    # svelte-i18n 初始化 + zh-CN/en 语言包
│   │   ├── ui/                 # Icon / Switch / toast 自研组件
│   │   └── paste.ts / types.ts
│   └── views/                  # ScanView / GenerateView / HistoryView / SettingsView
├── vite.config.ts              # Vite + vite-plugin-pwa（precache）配置
├── tools/
│   ├── generate_icons.py       # 图标再生成（Pillow）
│   └── test-roundtrip.mjs      # 生成→解码往返测试（node）
└── .github/workflows/deploy.yml
```

### 3.2 关键模块接口（实现契约）

```ts
// src/lib/decoder/index.ts（Worker 封装）
decoder.warm(): Promise<void>                       // 预热 wasm（启动时后台执行）
decoder.decode(imageData: ImageData): Promise<ScanResult[]>   // {text, format, points?}
decoder.terminate(): void

// src/views/ScanView.svelte（摄像头管线，组件内实现）
// getUserMedia 取帧 + rAF 120ms 节流、torch、启停、同码 2.5s 冷却

// src/lib/payloads.ts（生成管线）
buildPayload(type: PayloadType, f: PayloadFields): string     // 模板 → 码内容
autoCheckDigit(bcid: Symbology, text: string): string         // EAN/UPC 校验位自动补全
renderToCanvas(canvas, opts: RenderOpts): Promise<boolean>   // 内容非法返回 false
renderToSvg(opts: RenderOpts): Promise<string | null>
renderToPngBlob(opts: RenderOpts, size = 1024): Promise<Blob | null>

// src/lib/actions.ts
detect(text: string): Detected                    // 类型识别（url/wifi/vcard/vevent/tel/…）
parseWifi(text: string): Record<string, string>

// src/lib/history.ts（svelte store）
history.add(text: string, format: ScanFormat, source: HistorySource): void
history.remove(ids: string[]): void               // 多选删除
exportCsv(items: HistoryItem[], filename?): void
download(blob: Blob, filename: string): void

// src/lib/pwa.ts
initInstallPrompt(): void
promptInstall(): Promise<'accepted'|'dismissed'|'unavailable'>
initSwUpdate(): void / stopSwUpdateCheck(): void
checkForUpdate(): Promise<boolean> / applyUpdate(): void
```
---

## 4. 功能规格

### 4.1 扫码页

- **摄像头**：`facingMode: 'environment'` 优先后置；取景框 + 扫描线动画；解码节流 15fps；
  成功反馈：震动（`navigator.vibrate`，iOS 不支持则自动静默跳过）+ WebAudio 提示音（可关）。
- **闪光灯**：`track.applyConstraints({advanced:[{torch:true}]})`，仅在 `getCapabilities().torch` 存在时显示。
- **图片识别**：文件选择 / Ctrl+V 粘贴 / 拖拽；>1600px 自动降采样（裁剪区未实现）。
- **结果卡**：格式徽章（QRCODE / EAN13 / …）、内容原文（等宽字体、可滚动）、智能动作按钮组、复制、"送入生成页"。
- **同一内容 2.5s 冷却**，防止重复触发（对标连续扫码体验）。

### 4.2 智能动作映射（对标 Atharok "扫码后动作"）

| 识别类型 | 判定 | 动作按钮 | 全本地实现 |
|---|---|---|---|
| 网址 | `^https?://` | 打开链接 / 生成二维码 | `window.open` |
| WiFi | `WIFI:` 头 | 显示 SSID/加密方式，生成连接码 | 内部解析 |
| 名片 | `BEGIN:VCARD` / `MECARD:` | **保存联系人** | 解析→下载 `.vcf` |
| 日历 | `BEGIN:VEVENT` | **保存日历** | 解析→下载 `.ics` |
| 电话 | `tel:` | 拨号 / 复制 | `tel:` 链接 |
| 邮件 | `mailto:` | 写邮件 / 复制 | `mailto:` 链接 |
| 短信 | `SMSTO:` | 发短信 | `sms:` 链接 |
| 位置 | `geo:` | 打开地图 | 打开 URL（跳出后需网，属用户主动行为） |
| 两步验证 | `otpauth://` | 显示 issuer/account/secret | 纯展示，不做验证器 |
| 纯文本 | 其余 | 复制 / 生成二维码 | — |

### 4.3 生成页

- **码制**：QR Code（默认）、Data Matrix、PDF 417、Aztec、EAN-13、EAN-8、UPC-A、UPC-E、Code 128、Code 93、Code 39、Codabar、ITF（13 种，与 Atharok 生成范围一致）。
- **内容模板**：文本 / 网址 / WiFi（T:S:P:H 标准串）/ vCard / 日历 .ics / 电话 / 邮件 / 短信。
- **参数**：纠错等级（QR: L/M/Q/H）、EAN/UPC 校验位自动补全（颜色/尺寸/边距调参未实现，导出用固定样式）。
- **导出**：PNG（1024px）/ SVG（矢量）；1D 条码含人读文本行。
- **实时预览**：输入防抖 120ms 渲染（带 requestId 竞态守卫）；预览/下载/复制/存档统一用补全校验位后的最终文本（所见即所得）。

### 4.4 历史页

- 列表卡片：内容预览、格式徽章、时间、来源（扫码/生成）；搜索过滤；
- **多选删除**（对标 Atharok 1.12 特性）、单条删除、清空；
- 动作：复制 / 打开 / 送入生成页 / 导出 CSV；容量上限 200 条，超限 FIFO。

### 4.5 设置页

- 主题：浅 / 深 / 跟随系统（`prefers-color-scheme` + localStorage 记忆）；
- 提示音开关、震动开关；解码引擎信息（zxing-wasm 版本）；
- 关于：隐私声明（零网络请求、数据仅存本机）、许可清单、对标致谢。

---

## 5. 兼容性与风险

| 风险 | 影响 | 对策 |
|---|---|---|
| iOS standalone 摄像头失效（[WebKit Bug 273938](https://wiki.webkit.org/show_bug.cgi?id=273938)，部分 iOS 17+ 设备） | 主屏模式扫码黑屏 | 图片识别兜底；结果页给出"用浏览器打开"提示；无法根治（平台 bug） |
| Safari 无 `BarcodeDetector` | 无 | zxing-wasm 本就是主引擎，无影响 |
| `getUserMedia` 需安全上下文 | 非 https 不可用 | GitHub Pages 自带 HTTPS；localhost 调试可用 |
| GitHub Pages 的 `.wasm` MIME | 加载失败 | 现版 GH Pages 已正确返回 `application/wasm`；部署后冒烟脚本断言 MIME |
| iOS 不支持 `navigator.vibrate` | 无震动反馈 | 静默跳过，提示音兜底 |
| wasm 首次加载 1MB+ | 首屏变慢 | 启动后台预热 + SW 预缓存；解码在 Worker 不阻塞 |
| 大图/高分屏取帧性能 | 解码延迟 | 640px 解码降采样 + 15fps 节流 + Worker |

**隐私承诺**：除 SW 的本地缓存读写外**零网络请求**；历史仅存 localStorage；无遥测、无第三方脚本（部署后用冒烟脚本断言）。

---

## 6. 部署方案

**主方案：GitHub Actions**
1. 推送仓库至 GitHub（`main` 分支）；
2. Settings → Pages → Source 选 **GitHub Actions**；
3. `.github/workflows/deploy.yml`（checkout → configure-pages → upload-pages-artifact → deploy-pages）自动上线；
4. 地址：`https://<user>.github.io/QR-helper/`（全站相对路径，子路径/自定义域名均兼容）。

**备选：分支直出**（Settings → Pages → Deploy from branch，`main`/root）——未采用，仅留档。

**部署后冒烟清单**：全部资源 200、`.wasm` MIME 正确、SW 注册成功、离线模式二次打开可用、三端（iOS Safari / Android Chrome / 桌面 Chrome+Firefox+Safari）扫码与生成通过。

---

## 7. 里程碑与验收标准

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M1 骨架+扫码 | 页面骨架、zxing-wasm Worker 解码、摄像头管线、结果卡 | 真机扫 QR/DM/PDF417/Aztec/EAN 各 1 例通过 |
| M2 生成 | bwip-js 全码制生成、8 种模板、PNG/SVG 导出 | 生成→解码往返测试全过（node 脚本，含中文/转义/反色） |
| M3 动作+历史+主题 | 智能动作全表、历史 CRUD/多选/CSV、双主题 | 动作映射表逐项通过 |
| M4 PWA+部署 | manifest、SW、图标、Actions、README | 离线二次打开、安装到主屏、GH Pages 上线 |

**总验收**：① Atharok 格式表全量可读可写；② 全程零网络请求（DevTools Network 断言）；③ 离线完全可用；④ iOS/Android/桌面三端清单通过。

---

## 8. 依赖与许可清单

| 依赖 | 版本 | 许可 | 用途 |
|---|---|---|---|
| zxing-wasm | **3.1.7**（实测版本，本地化 vendored，WASM 946KB 预缓存） | Apache-2.0 | 全格式解码 |
| bwip-js | **4.11.4**（实测版本，本地化 vendored，动态按需加载） | MIT | 全格式生成 |
| svelte / svelte-i18n | 5.x / 4.x | MIT | 框架 / 双语 |
| （可选）jsQR | 1.4.0 | MIT | QR 超轻量备选，不默认引入 |

本体代码建议 MIT。所有依赖本地化 vendored，不引 CDN——这是离线要求也是隐私要求。

---

## 9. 前端设计规格（页面/布局/视觉）

### 9.1 工程方案

| 维度 | 方案 |
|---|---|
| 框架 | 无框架纯 HTML/CSS/JS，零构建，仓库即网站 |
| 路由 | `data-view` 视图切换 + `?tab=`/hash 轻路由（PWA shortcuts 直达） |
| 组件组织 | 模板函数 + DOM 引用缓存 + 事件委托 |
| 状态 | 极简全局 store（订阅回调）+ localStorage 持久化 |
| 样式 | CSS 自定义属性（设计令牌）+ 移动优先 + BEM 类名；无预处理器 |
| 图标 | 内联 SVG sprite（symbol/use），零请求可染色 |
| 字体 | 系统字体栈，零下载 |
| 动效 | 纯 CSS，尊重 prefers-reduced-motion |
| 安全 | 扫码/历史内容为不可信数据：textContent 渲染 + 动作白名单，防存储型 XSS |
| 可访问性 | 语义标签、aria、键盘可达、WCAG AA 对比度 |

### 9.2 页面（4 视图）

全局框架：AppBar（Logo+标题+主题切换）+ 主内容 + 导航（手机=底部 Tab Bar 4 入口；≥768px=左侧边栏）。

1. **扫码页**：取景卡片（4:3 视频 + reticle 遮罩 + 扫描线动画；开始相机/闪光灯/识别图片按钮，支持粘贴与拖拽）+ 结果卡（格式徽章 + 等宽内容区 + 智能动作组 + 复制/打开/送入生成；识别成功上滑出现）。
2. **生成页**：码制 chips（QR/DM/PDF417/Aztec + 1D 系列）+ 按类型切换的内容模板表单 + 参数行（QR 纠错 L/M/Q/H；颜色/尺寸/边距未实现）+ 实时预览（防抖 120ms）+ PNG/SVG/复制。手机上表单下预览；桌面左表单 420px + 右预览 sticky。
3. **历史页**：搜索框实时过滤 + 卡片列表（徽章/时间/来源/2 行截断）+ 多选删除（对标 Atharok）+ 导出 CSV + 清空（二次确认）+ 空状态引导。
4. **设置页**：分组卡片——外观（浅/深/跟随系统 + 6 色主题板）、扫码反馈（声音/震动）、数据（CSV/清空）、关于（引擎版本、零网络声明、许可、对标致谢）。

### 9.3 视觉

设计令牌：`--bg #F5F7F9/#0E1116`、`--panel #FFFFFF/#171C22`、`--text #17202A/#E7EDF3`、`--muted #66707C/#8B97A5`、`--line #DDE3E9/#26303C`、`--accent #16A34A`（可换 6 预设）；圆角 卡片16/控件10/胶囊999；单层柔和阴影。字号阶 12/13/14/17/22。组件：按钮（primary/tonal/ghost/danger/图标）、输入、下拉、开关、chips、徽章、卡片、Toast、空状态、底部动作面板、确认对话框。

### 9.4 响应式

<768px 单列+底部 Tab Bar；768–1023px 左侧边栏+单栏；≥1024px 侧边栏+双栏（扫码 取景|结果，生成 表单|预览）。动效：扫描线 2.2s 循环、结果卡上滑、主题 200ms 过渡、按压 scale(.96)。

---

## 10. 现代框架候选对比（已选定：Vite + Svelte 5 + TS + vite-plugin-pwa，用户确认）

GH Pages 只吃静态产物，所有 SSG/静态导出框架均可用，差别在包体、DX、PWA 顺手度：

| 方案 | 运行时增量(gzip) | PWA | GH Pages | 评价 |
|---|---|---|---|---|
| **Vite + Svelte 5 + TS（推荐）** | ~15-20KB | vite-plugin-pwa | ✅ base 一条配置 | runes 响应式、编译后无 runtime、Worker/WASM 一等公民 |
| Vite + Preact | ~3.5KB | 同上 | ✅ | React 语法，包体最小 |
| Vue 3.5 + Vite | ~45KB | 同上 | ✅ | 国内生态最强，体量略重 |
| React 19 + Vite | ~45KB+ | 同上 | ✅ | 生态最大，本项目偏重 |
| Astro 5 + islands | 0 | 可加 | ✅ | 为内容站设计；重交互相机应用收益趋零，不选 |
| Lit / Web Components | ~5KB | 手写 | ✅ | 无框架锁定；状态/模板体验一般 |
| 原生 JS + Vite + TS | 0 | 同上 | ✅ | 保留零框架换 TS/HMR/构建 |

不选 SvelteKit/Nuxt/Next（SSR 框架，纯 SPA 用不到）。

**GH Pages 适配要点**（与框架无关，全部已验证）：
1. 子路径 base：`base: '/REPO/'` 或 `'./'`，资源引用 `import.meta.env.BASE_URL`
2. 路由回退：本项目 4 tab 轻路由（`?tab=` 或 hash），从根上避开 404 问题；History API 路由才需 404.html 重定向 trick
3. SW：vite-plugin-pwa（Workbox），`globPatterns` 含 `wasm` 进 precache；默认 `navigateFallback: index.html` 恰好适用；`registerType: 'prompt'`（发现新版本只提示，用户在设置页确认后更新）
4. 流水线：actions/configure-pages → build → upload-pages-artifact(dist/) → deploy-pages
5. GH Pages 不能设 header：不用 SharedArrayBuffer/多线程 wasm（zxing-wasm 单线程无需求）；.wasm MIME 部署冒烟断言 + instantiateStreaming 降级 instantiateArrayBuffer

**体积预算不变** ≈1.5MB（zxing-wasm ~1MB 为大头，UI 框架影响甚微）。引擎层（§3 接口契约）与 UI 框架解耦，选型不影响核心代码。

---

## 11. 设计风格双方案 Demo（待用户选定）

两套可交互静态 Demo（纯 HTML/CSS/JS，含浅/深色切换与扫描线动效，零外部请求），4 个页面 × 同一布局规格（§9.2）：

- `design-demo/material.html` — **Material 3 Expressive**：浮动药丸底部导航（active 药丸指示器）、大圆角 28px tonal 卡片、胶囊按钮三级（fill/tonal/text）、M3 Switch、滤镜 chips、色板 swatch（6 色）、扫描线动画。
- `design-demo/swiftui.html` — **SwiftUI Liquid Glass**：backdrop-blur 玻璃拟态顶栏/TabBar、Inset Grouped 列表、iOS Switch/Segmented/搜索框、底部 Sheet 带 grabber、SF 风格线性图标、系统绿 accent。

两套均含：状态栏/灵动岛手机壳、4 页完整内容（扫码+结果卡、生成+QR 预览、历史列表、设置分组）、暗色模式令牌切换。选定其一（或说"混搭"指定哪页用哪套）后并入 §9 设计令牌，按 M1→M4 开工。

**已选定（用户拍板）：Material 3 Expressive（A 套，material.html）。**

### 11.1 Material UI 组件库选型（已选定：SMUI v8+）

| 框架 | 现状 | 结论 |
|---|---|---|
| **SMUI（Svelte Material UI）v8+** | 活跃维护（2026-10），v8 原生 Svelte 5 | **选定**：最成熟，Button/Chips/SegmentedButton/TextField/List/Menu/Dialog/Snackbar/Switch/TopAppBar 全覆盖，按需 import，SCSS 主题 + CSS 变量映射 M3 绿色令牌 |
| ktibow/m3-svelte | 活跃（2026-08），TS，正统 M3 含 motion（sharedAxisTransition/easeEmphasized） | 备选：观感最正统，但生态小（~450 stars）单维护者 |
| Material Web（Google 官方） | **维护模式**（官方 roadmap："no future work"；m3.material.io："Material 3 Expressive is not implemented on Web"） | 淘汰：维护模式 + 无 Expressive，同 zxing-js 逻辑 |
| MUI/Vuetify/Quasar | 锁死 React/Vue/Angular | 出局 |

落地：`pnpm add -D smui-theme sass` + 按需 `@smui/*`（预计 30-60KB gzip）；M3 Expressive 特色层（浮动药丸导航、tonal 大圆角布局、相机卡、扫描线动效、结果卡）= 自研 Svelte 组件，移植 material.html 的 CSS。UI 组件层与引擎层（§3）解耦，后续可平移 m3-svelte。

> **实现偏差（2026-11-19）**：最终实现**未引入 SMUI**，改为自研组件完整移植已批准的 material.html 视觉稿（.btn/.chip/.seg/.switch/.nav 等全部 M3 Expressive 控件已在 CSS 层实现）。原因：SMUI 基于 MDC，外观与已批准视觉稿有可见偏差，且 demo CSS 已覆盖全部所需控件；自研层保持零 UI 框架依赖、体积更小。@smui/* 依赖已移除。后续如需标准 M3 组件库可平移 m3-svelte（§11 备选）。

---

## 12. 多语言 i18n（中文 / English）

用户需求（m00170）："语言包也考虑一下，支持中英文"。范围：仅 UI 文案；用户数据（扫码内容、历史记录）不翻译。

**库选型**：svelte-i18n（选定；$t store + ICU 插值/复数，运行时 ~4KB gzip，字典打包离线）。备选 paraglide-js（编译期零运行时，但生态变动大，不选）；不手写轮子。

**语言包结构**：`src/lib/locales/zh-CN.ts` / `en.ts`，均 `as const` 导出；`type MessageKey = keyof typeof zhCN` 约束 en 键集——漏译键 = TS 编译错误。

**行为**：
1. 探测 `navigator.language`（zh* → zh-CN，否则 en），兜底 zh-CN；localStorage 持久化
2. 设置页"语言"行：跟随系统 / 中文 / English；切换即时生效（$locale store），同步 `<html lang>`
3. 格式化用 Intl.DateTimeFormat / RelativeTimeFormat / NumberFormat（"刚刚/yesterday"双语），不引日期库
4. PWA manifest 本地化：静态双 manifest 文件（`manifest.zh-CN.webmanifest` / `manifest.en.webmanifest`，相对 icons/ 路径 + start_url './' 兼容子路径部署），按语言切换 `link[rel=manifest]`；name "QR Helper" 不变，description/shortcuts 按语言（实现偏差：弃用运行时 Blob 生成——blob manifest 在部分浏览器安装流程有兼容风险）
5. 英文文案更长 → M1 起双语并排布局回归（按钮/chips/徽章不溢出），进 M4 验收
6. 幽灵文案检查：grep 组件硬编码串，保证 100% 走 $t('key')；M4 断言 zh-CN/en 键集 diff 为空

**里程碑**：M1 接 i18n 骨架（$t 第一天起用）→ M3 覆盖动作/历史/CSV 文案 → M4 双语校对 + 完整性断言。

---

## 13. 实现与验收记录（2026-11-19）

**已实现**（对应 §7 里程碑 M1–M4 全部完成）：

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 扫码 | ScanView：getUserMedia + rAF 120ms 节流取帧 → Worker 解码；闪光灯、图片识别（拖拽/粘贴/选择）、震动+提示音反馈、同码 2.5s 冷却 | ✅ |
| M2 生成 | GenerateView：8 payload × 13 码制、QR 纠错 L/M/Q/H、EAN/UPC 校验位自动补全、PNG/SVG 导出、复制 | ✅ |
| M3 动作+历史 | actions.ts 智能动作（url/tel/mailto/sms/vcard→.vcf/event→.ics/wifi/geo/otpauth）；历史 200 条 FIFO、搜索、多选删除、CSV 导出（BOM+公式注入防护） | ✅ |
| M4 PWA+部署 | vite-plugin-pwa 预缓存 14 项（含 wasm/worker/双 manifest，去重后）；deploy.yml（npm run check → npm test → PWA_BASE=/<repo>/ build → deploy-pages）；zh-CN/en 双语 + manifest 本地化 | ✅ |

**验收证据**：
- `npm test`：37/37 通过（payload 构建 ×12、校验位 ×3、bwip→zxing 往返 ×13 含中文 UTF-8/反色/WiFi 转义、detect 动作 ×11、parseWifi ×1）
- `npm run check`（svelte-check）：0 errors / 0 warnings
- 构建产物：index 158KB + css 17KB + bwip-js 916KB（生成页按需，async import）+ zxing_reader.wasm 947KB + worker 36KB；SW 预缓存 14 项（无重复 URL）≈ 2.1MB
- HTTP 冒烟：HTML/manifest/favicon/icons/worker 全 200；wasm `Content-type: application/wasm`（instantiateStreaming 可用）
- `PWA_BASE=/QR-helper/` 构建验证：资源路径带仓库前缀，workbox precache 为相对 URL（scope 自适应子路径）

**实现偏差汇总**：
1. §2 zxing-wasm 2.x → 实际 3.1.7（v3 API：`prepareZXingModule({overrides:{locateFile}})` 覆写默认 jsDelivr CDN，保证零网络）
2. §11.1 SMUI → 未引入，自研组件移植 material.html（详见 §11.1 偏差说明）
3. §12-4 manifest Blob 生成 → 静态双 manifest 文件 + link 切换（详见 §12-4）
4. 已知平台行为：UPC-A 经 zxing 解码可能以 EAN-13 前补 0 形式返回（往返测试已按两种合法形式断言）
5. 2026-11-20 code review 修复：生成页 EAN/UPC 口径统一为补全校验位后的最终文本（预览/下载/复制/存档一致）+ 渲染防抖 120ms 与竞态守卫；预填文本接口改为 `prefillText`/`prefillNonce`（消 prefill 幽灵复活）；pwa.ts 更新 interval 句柄化 + promptInstall 兜底；precache 去重（includeAssets 并入 globPatterns，21 → 14 项）；CI 增 `npm run check`；补 LICENSE（MIT）
