<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onDestroy, onMount } from 'svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import { decoder } from '../lib/decoder';
  import { history, download } from '../lib/history';
  import { settings } from '../lib/settings';
  import { detect } from '../lib/actions';
  import { wrapIcs } from '../lib/payloads';
  import { showToast } from '../lib/ui/toast';
  import type { ScanResult } from '../lib/types';
  import { get } from 'svelte/store';
  import { pendingImage } from '../lib/paste';

  let { ongenerate }: { ongenerate: (text: string) => void } = $props();

  let videoEl: HTMLVideoElement | undefined = $state();
  let scanning = $state(false);
  let torchOn = $state(false);
  let torchCap = $state(false);
  let engineReady = $state(false);
  let camError = $state(false);
  let camErrKind = $state<'insecure' | 'denied' | 'missing' | null>(null);
  let result = $state<ScanResult | null>(null);
  let saved = $state(false);

  let stream: MediaStream | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let rafId = 0;
  let lastTick = 0;
  let busy = false;
  let starting = false;
  let lastText = '';
  let lastAt = 0;
  let audioCtx: AudioContext | null = null;
  let fileInput: HTMLInputElement | undefined = $state();
  // 组件存活标志：onDestroy 置 false，防止 await 期间销毁后仍持有相机流
  let alive = true;
  // 页面隐藏前是否处于扫描态（恢复可见时自动重开）
  let wasScanning = false;

  const detected = $derived(result ? detect(result.text) : null);

  decoder
    .warm()
    .then(() => (engineReady = true))
    .catch(() => (engineReady = true));

  // 打开页面时：相机权限已授权 → 自动开扫（未授权保持手动，避免突然弹出授权框）
  onMount(() => {
    // 页面隐藏时释放相机，恢复可见时按需重开
    document.addEventListener('visibilitychange', onVisibility);
    // 消费全局粘贴的图片（App 捕获后经 pendingImage 传递）
    const pasted = get(pendingImage);
    if (pasted) {
      pendingImage.set(null);
      void decodeFile(pasted);
    }
    void (async () => {
      if (!window.isSecureContext) return;
      if (!get(settings).autoCamera) return;
      try {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (status.state === 'granted') await start();
      } catch {
        /* 权限查询不可用（旧 Safari 等）：保持手动开启 */
      }
    })();
  });

  async function start() {
    if (starting || stream) return;
    starting = true;
    try {
      camError = false;
      camErrKind = null;
      if (!window.isSecureContext) {
        camError = true;
        camErrKind = 'insecure';
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false
        });
        // await 期间组件被销毁 / 页面隐藏：立即释放相机，绝不长期持有
        if (!alive || document.hidden) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (!videoEl) {
          stop();
          return;
        }
        videoEl.srcObject = stream;
        await videoEl.play();
        // play 期间组件被销毁：onDestroy(stop) 已释放，直接返回
        if (!alive) return;
        scanning = true;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        torchCap = !!caps.torch;
        rafId = requestAnimationFrame(tick);
      } catch (e) {
        if (!alive) return;
        const name = (e as DOMException)?.name ?? '';
        camErrKind = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'missing';
        camError = true;
        scanning = false;
      }
    } finally {
      starting = false;
    }
  }

  function stop() {
    scanning = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    torchOn = false;
    if (videoEl) videoEl.srcObject = null;
  }

  // 页面隐藏：停止扫描并释放相机省电；恢复可见时若原本在扫描则自动重开
  function onVisibility() {
    if (document.hidden) {
      wasScanning = scanning || starting;
      if (scanning) stop();
    } else if (wasScanning) {
      wasScanning = false;
      void start();
    }
  }

  async function toggleTorch() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] } as unknown as MediaTrackConstraints);
    } catch {
      torchOn = false;
    }
  }

  async function tick(t: number) {
    if (!scanning) return;
    rafId = requestAnimationFrame(tick);
    if (busy || t - lastTick < 120 || !videoEl || !videoEl.videoWidth) return;
    lastTick = t;
    busy = true;
    try {
      const data = grabFrame();
      if (data) {
        const rs = await decoder.decode(data);
        if (rs.length) onResult(rs[0]);
      }
    } catch {
      /* 单帧失败忽略 */
    } finally {
      busy = false;
    }
  }

  function grabFrame(): ImageData | null {
    const v = videoEl;
    if (!v || !v.videoWidth) return null;
    canvas ??= document.createElement('canvas');
    const w = Math.min(640, v.videoWidth);
    canvas.width = w;
    canvas.height = Math.round((v.videoHeight / v.videoWidth) * w);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function onResult(r: ScanResult) {
    const now = Date.now();
    if (r.text === lastText && now - lastAt < 2500) return;
    lastText = r.text;
    lastAt = now;
    result = r;
    saved = true;
    history.add(r.text, r.format, 'scan');
    feedback();
    // 识别到有效码后默认关闭相机，用户可手动"继续扫描"
    if (scanning) stop();
  }

  function feedback() {
    const s = get(settings);
    if (s.vibrate) navigator.vibrate?.(80);
    if (s.sound) {
      try {
        // 尽量复用单例 AudioContext
        audioCtx ??= new AudioContext();
        // autoplay 策略下可能 suspended，使用前恢复
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.06;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + 0.12);
      } catch {
        /* 无音频设备时忽略 */
      }
    }
  }

  /* ---- 图片识别（拖拽 / 粘贴 / 选择） ---- */
  async function decodeFile(file: File) {
    try {
      const bmp = await createImageBitmap(file);
      canvas ??= document.createElement('canvas');
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const rs = await decoder.decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (rs.length) onResult(rs[0]);
      else showToast($_('toast.imageFail'));
    } catch {
      showToast($_('toast.imageFail'));
    }
  }

  function onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) decodeFile(f);
    input.value = '';
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) decodeFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (f) decodeFile(f);
  }

  /* ---- 结果动作 ---- */
  function copy() {
    if (!result) return;
    navigator.clipboard?.writeText(result.text).then(() => showToast($_('toast.copied')));
  }

  function downloadVcf() {
    if (!result) return;
    download(new Blob([result.text], { type: 'text/vcf;charset=utf-8' }), 'contact.vcf');
    showToast($_('toast.saved'));
  }

  function downloadIcs() {
    if (!result) return;
    download(new Blob([wrapIcs(result.text)], { type: 'text/calendar;charset=utf-8' }), 'event.ics');
    showToast($_('toast.saved'));
  }

  onDestroy(() => {
    alive = false;
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    // 关闭提示音 AudioContext，释放音频资源
    void audioCtx?.close().catch(() => {});
    audioCtx = null;
  });
</script>

<svelte:window onpaste={onPaste} />

<div class="two-col">
<div class="tc-left">

<div
  class="cam"
  class:open={scanning}
  role="region"
  aria-label={$_('scan.title')}
  ondragover={(e) => e.preventDefault()}
  ondrop={onDrop}
>
  <div class="chip-live"><i class:on={scanning}></i>{scanning ? $_('scan.live') : $_('scan.paused')}</div>
  <video bind:this={videoEl} playsinline muted style:display={scanning ? 'block' : 'none'}></video>
  {#if scanning}
    <div class="reticle"><span></span><span></span><span></span><span></span></div>
  {:else}
    <div class="cam-idle">
      <Icon name="camera" />
      <div class="cam-idle-title">
        {#if camError}
          {camErrKind === 'insecure' ? $_('scan.needHttps') : camErrKind === 'denied' ? $_('scan.noPermission') : $_('scan.noCamera')}
        {:else if result}
          {$_('scan.paused')}
        {:else}
          {engineReady ? $_('scan.idleHint') : $_('scan.engineLoading')}
        {/if}
      </div>
      <div class="cam-idle-sub">{$_('scan.dropHint')}</div>
    </div>
  {/if}
  <div class="cam-bar">
    {#if scanning}
      <button class="btn btn-fill cam-cta" onclick={stop}>
        <Icon name="camera" cls="ic-sm" />
        {$_('scan.stop')}
      </button>
      {#if torchCap}
        <button class="btn btn-ghost btn-icon glass" class:btn-fill={torchOn} onclick={toggleTorch} aria-label={$_('scan.torch')}>
          <Icon name="bolt" />
        </button>
      {/if}
    {:else}
      <button class="btn btn-fill cam-cta" onclick={start}>
        <Icon name="camera" cls="ic-sm" />
        {result ? $_('scan.resume') : $_('scan.start')}
      </button>
    {/if}
    <button class="btn btn-ghost glass" onclick={() => fileInput?.click()}>
      <Icon name="image" cls="ic-sm" />
      {$_('scan.image')}
    </button>
    <input type="file" accept="image/*" hidden bind:this={fileInput} onchange={onPick} />
  </div>
</div>

</div>

<div class="tc-right tc-sticky">
{#if result && detected}
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <span class="badge">{result.format === 'Unknown' ? '—' : result.format.toUpperCase()}</span>
      <span class="badge alt">{saved ? $_('toast.saved') : ''}</span>
    </div>
    <div class="result-text">{result.text}</div>
    <div class="row wrap">
      {#if detected.category === 'url' && detected.url}
        <a class="btn btn-fill" href={detected.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" cls="ic-sm" />
          {$_('act.open')}
        </a>
      {/if}
      {#if detected.category === 'tel' && detected.url}
        <a class="btn btn-fill" href={detected.url}><Icon name="phone" cls="ic-sm" />{$_('act.call')}</a>
      {/if}
      {#if detected.category === 'email' && detected.url}
        <a class="btn btn-fill" href={detected.url}><Icon name="mail" cls="ic-sm" />{$_('act.mail')}</a>
      {/if}
      {#if detected.category === 'sms' && detected.url}
        <a class="btn btn-fill" href={detected.url}><Icon name="message" cls="ic-sm" />{$_('act.sms')}</a>
      {/if}
      {#if detected.category === 'vcard'}
        <button class="btn btn-fill" onclick={downloadVcf}>
          <Icon name="user" cls="ic-sm" />
          {$_('act.downloadVcf')}
        </button>
      {/if}
      {#if detected.category === 'event'}
        <button class="btn btn-fill" onclick={downloadIcs}>
          <Icon name="calendar" cls="ic-sm" />
          {$_('act.downloadIcs')}
        </button>
      {/if}
      <button class="btn btn-tonal" onclick={copy}>
        <Icon name="copy" cls="ic-sm" />
        {$_('act.copy')}
      </button>
      <button class="btn btn-text" onclick={() => ongenerate(result!.text)}>{$_('act.makeQr')}</button>
    </div>
    {#if detected.category === 'wifi'}
      <div class="hint"><Icon name="wifi" cls="ic-sm" />{$_('act.wifiHint')}</div>
    {/if}
    {#if detected.category === 'otpauth'}
      <div class="hint"><Icon name="shield" cls="ic-sm" />{$_('act.otpHint')}</div>
    {/if}
    <div class="hint"><Icon name="clock" cls="ic-sm" />{$_('scan.autoPaused')}</div>
  </div>
{:else}
  <div class="card" style="text-align:center;color:var(--muted)">
    <div class="result-text" style="color:var(--muted);font-family:inherit">{$_('scan.empty')}</div>
  </div>
{/if}
</div>
</div>
