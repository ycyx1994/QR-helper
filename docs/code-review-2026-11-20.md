# QR-helper 代码审查报告（2026-11-20，main @ 0b8dc25）

三路并行审查：核心逻辑层（review-core）、视图/UI 层（review-views）、构建与工具链（review-build）。
验证基线：`npm run check` 0 错误；`npm run build` 通过；`npm test` 37/37 通过；`npm audit` 2 moderate（esbuild dev server）。

---

## 🔴 严重（6 项）

| # | 位置 | 问题 | 修法要点 |
|---|------|------|----------|
| 1 | `src/lib/decoder/index.ts:46,66-72` | `terminate()` 只清 pending 不 reject；worker 运行期崩溃后 `#ready` 仍为 true，在途与后续 decode Promise 永久挂起；初始化失败后 `#readyPromise` 保持 rejected 无法恢复 | terminate 时逐条 reject 并置空 `#readyPromise`；onerror 统一走"reject 全部 + 重置"；失败分支允许重试 |
| 2 | `src/views/ScanView.svelte:76-82` | getUserMedia await 期间组件销毁 → 相机 track 永久泄漏（指示灯常亮），且 `stream` 非 null 挡住后续 start | resolve 后先判 `!videoEl`，是则立即 stop tracks 并置空 |
| 3 | `src/App.svelte:82` | `$derived` 读 `document.documentElement.classList` —— 非响应式源，只求值一次，主题切换图标永不更新；`:77 toggleTheme` 同样读 DOM | 改从 `$settings` store 派生 |
| 4 | `src/views/HistoryView.svelte:160-201`、`src/views/SettingsView.svelte:190-218` | Esc 监听挂在 `.overlay` 但焦点在 overlay 之外 → Esc 实际失效；dialog 从未 focus，无焦点陷阱/inert | 改用 `<svelte:window onkeydown>` + 打开时 `dialogEl.focus()` + `role="alertdialog" aria-modal="true"` |
| 5 | `src/lib/types.ts` + `src/lib/decoder/decoder.worker.ts:37` | zxing-wasm 返回 `'EAN-13'/'QRCode'/'Code128'` 等字符串，与 `ScanFormat` 声明的 `'EAN13'...` 永远不匹配，运行时类型说谎 | worker 内加 `FORMAT_MAP` 归一化 |
| 6 | `src/lib/payloads.ts:115-130` | UPC-E 套用 EAN 权重算校验位（正确做法是扩展成 UPC-A 11 位再算），自动补位产出错误条码 | UPC-E 走专门 expand→check，或交 bwip-js 自处理 |

## 🟡 建议（摘要）

**资源与生命周期**
- ScanView 页面隐藏不释放相机（加 visibilitychange 处理）；`audioCtx` 从不 `close()`
- AudioContext 在识别回调里创建，自动播放策略下 suspended 无声 → 创建后 `resume()`
- `src/lib/pwa.ts:61` setInterval 无句柄，HMR/重复注册叠加轮询；`promptInstall` 未兜 `ev.prompt()` 抛错

**性能**
- GenerateView 每次按键全量重渲染 bwip-js，无 debounce、无竞态守卫 → 150ms 防抖 + cancelled 标志
- decoder 每帧双拷贝且不用 transferable（720p 每帧 ~7MB 临时对象）→ postMessage 带 transfer list
- ScanView `grabFrame` 每帧重设 `canvas.width`（清空+重置 context）→ 加尺寸守卫
- HistoryView 每条历史每次渲染 `new Intl.RelativeTimeFormat` → 模块级缓存实例

**状态一致性**
- GenerateView：预览/下载用原始输入、存档用 `autoCheckDigit` 三分叉 → 派生统一 `renderText`
- `genText` prefill 消费后不清，陈旧文本幽灵复活 → 消费一次即清
- App `replaceState` 永不产生历史 → popstate 监听形同虚设，二选一（pushState 或删监听）
- index.html 双 `theme-color` meta，applyTheme 只更新第一个

**数据校验**
- settings 反序列化不校验字段值（`{"theme":"banana"}` 原样生效并固化）→ 白名单逐项校验
- history `load()` 条目级校验缺失：缺 id 的条目 remove 误删、`exportCsv` 遇坏 ts 抛 RangeError、加载不截断 MAX
- vCard/VEVENT 字段未按 RFC 转义（`\` `,` `;` 换行），name 含换行可注入伪造属性行 → 统一 `vEscape`
- `parsePropBlock` 不支持 vCard 折行（folding），长字段被截断
- mailto 解析 `split('?')` 截断含 `?` 的 body，addr 未 decodeURIComponent
- PNG 导出固定 scale 16 到 1024² 画布，长内容二维码静默失败/裁切 → 先取自然尺寸再反推 scale
- CSV 防公式注入漏 `@` 与前导空白

**构建与配置**
- vite.config `includeAssets` 与 `globPatterns` 重叠，预缓存 21 条中 7 条重复 → 删 includeAssets
- CI 缺 `npm run check` 步骤，类型错误可绿到部署
- README 链接的 LICENSE 文件不存在（package.json 声明 MIT）
- index.html favicon 带 `?v=2`，与预缓存键不匹配，离线图标请求落空 → 去查询串或配 `ignoreURLParametersMatching`
- npm audit：svelte-i18n 传递依赖 esbuild ≤0.24.2（2 moderate，仅影响 dev server；**不要** `audit fix --force`，会降级 svelte-i18n 到 3.7.1 breaking）

## 🔵 细节（摘要）

- `dtLocal` 对纯日期输入生成缺 `T` 的非法 iCal 串
- ScanView 引擎加载失败也标 ready，用户开扫后静默失败 → 独立 `engineError` 态
- "选图"入口 label+hidden input 键盘不可达 → `.sr-only` 替代 hidden
- Toast 缺 `role="status" aria-live="polite"`
- viewport `user-scalable=no` + 手势拦截禁用缩放（WCAG 1.4.4），至少去掉 user-scalable=no
- app.css：`--cam-grad`/`.brand .logo` 深色渐变不随 accent 联动；`.btn-ghost` hover 死规则；nav 注释"232px"与实际 156px 不符
- `is2d` 死代码；`hist.qr*` 四个 i18n key 错插在 `set.*` 段中间
- PLAN.md 与实现漂移（"零构建"、`autoUpdate` vs 实际 `prompt`）；README `HTTPS=1 npm run build` 是无效命令
- design-demo/ 的 icon-preview.png 是脚本生成产物，建议入 .gitignore；lan-qr.png 本地遗留可删
- package.json 未声明 engines（test 依赖 Node ≥22.18 type stripping）；TS 6.0.3 版本很新注意回归
- `checkForUpdate` 只看 waiting，skipWaiting 场景提示与实际不符（极低频）

## 安全面结论（两路一致）

- `actions.ts detect()` 仅白名单 scheme（http(s)/tel/mailto/sms/geo）产出 url，`javascript:`/`data:` 落 text 分支，无危险 scheme 注入面
- 唯一 `{@html}` 在 Icon.svelte:35，数据源为静态 SVG 字典，安全
- 扫描结果全程文本插值（Svelte 自动转义），无 innerHTML 面
- ⚠️ 这是一条隐式安全边界：未来给 detect 加协议分支必须保持白名单思路

## 建议修复顺序

1. **批次 A（资源生命周期）**：🔴1 decoder 挂起、🔴2 相机泄漏、🟡 visibilitychange/audioCtx
2. **批次 B（响应式语义）**：🔴3 主题 derived、🔴4 浮层 Esc/焦点、🟡 genText 陈旧回填
3. **批次 C（数据正确性）**：🔴5 format 归一化、🔴6 UPC-E 校验位、🟡 vCard 转义 / EAN 三分叉 / PNG 尺寸
4. **批次 D（健壮性）**：settings/history 反序列化白名单校验、mailto/folding 解析
5. **批次 E（工程化）**：CI 补 check、预缓存去重、补 LICENSE、favicon 查询串、PLAN.md 更新

## 总体评价

工程质量在同类纯本地 PWA 工具中属中上：工具链选型克制自洽，类型检查零错误、37 项往返测试全绿，双 WASM/JS 引擎分工清晰（解码进 Worker、生成动态分包），PWA prompt 更新模式与配套确认流完整，GH Pages 子路径部署实测可用。无架构性缺陷，主要风险集中在"异步边界上的资源管理"（decoder/camera）和"少量 runes 语义误用"，按上述批次修复即可达到批准合入级别。
