<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { untrack } from 'svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import { buildPayload, renderToCanvas, renderToSvg, renderToPngBlob, autoCheckDigit } from '../lib/payloads';
  import type { PayloadFields } from '../lib/payloads';
  import { history, download } from '../lib/history';
  import { showToast } from '../lib/ui/toast';
  import type { PayloadType, Symbology, ScanFormat } from '../lib/types';

  // prefillText/prefillNonce：扫码页带文本跳转时由 App 传入；nonce 为递增计数
  let { prefillText = '', prefillNonce = 0 }: { prefillText?: string; prefillNonce?: number } = $props();

  const payloadTypes: { id: PayloadType; icon: string }[] = [
    { id: 'text', icon: 'text' },
    { id: 'url', icon: 'globe' },
    { id: 'wifi', icon: 'wifi' },
    { id: 'vcard', icon: 'user' },
    { id: 'event', icon: 'calendar' },
    { id: 'tel', icon: 'phone' },
    { id: 'email', icon: 'mail' },
    { id: 'sms', icon: 'message' }
  ];

  const symbologies: { id: Symbology; label: string }[] = [
    { id: 'qrcode', label: 'QR Code' },
    { id: 'datamatrix', label: 'Data Matrix' },
    { id: 'pdf417', label: 'PDF417' },
    { id: 'azteccode', label: 'Aztec' },
    { id: 'ean13', label: 'EAN-13' },
    { id: 'ean8', label: 'EAN-8' },
    { id: 'upca', label: 'UPC-A' },
    { id: 'upce', label: 'UPC-E' },
    { id: 'code128', label: 'Code 128' },
    { id: 'code39', label: 'Code 39' },
    { id: 'code93', label: 'Code 93' },
    { id: 'rationalizedCodabar', label: 'Codabar' },
    { id: 'interleaved2of5', label: 'ITF' }
  ];

  let type: PayloadType = $state('text');
  let symbology: Symbology = $state('qrcode');
  let ecLevel: 'L' | 'M' | 'Q' | 'H' = $state('M');
  // 挂载时捕获一次预填文本（扫码页跳转带入），后续不随 prop 变化覆盖用户编辑
  let fields: PayloadFields = $state({ text: untrack(() => prefillText) });
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let valid = $state(true);

  const payloadText = $derived(buildPayload(type, fields));
  // 统一口径：预览、下载、复制、存档全部用补全校验位后的最终文本（所见即所得）
  const finalText = $derived(autoCheckDigit(symbology, payloadText));

  // prefillNonce 变化（扫码页跳转）才套用预填文本；nonce 初值 0 不覆盖用户输入
  $effect(() => {
    const nonce = prefillNonce;
    if (nonce === 0) return;
    const text = untrack(() => prefillText);
    untrack(() => {
      fields.text = text;
    });
  });

  // 渲染：防抖 120ms + 递增序号竞态守卫（慢请求返回时不覆盖新结果）
  let renderSeq = 0;

  $effect(() => {
    const text = finalText;
    const bcid = symbology;
    const ec = ecLevel;
    const cv = canvasEl;
    if (!cv) return;
    const seq = ++renderSeq;
    const timer = setTimeout(() => {
      if (!text.trim()) {
        cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
        if (seq === renderSeq) valid = true;
        return;
      }
      // 渲染到离屏 canvas，resolve 时序号仍是最新才上屏（canvas 结果同样受竞态守卫）
      const off = document.createElement('canvas');
      renderToCanvas(off, { bcid, text, eclevel: ec, scale: 4, padding: 2 }).then((ok) => {
        if (seq !== renderSeq) return; // 过期请求丢弃
        if (ok) {
          cv.width = off.width;
          cv.height = off.height;
          cv.getContext('2d')?.drawImage(off, 0, 0);
        }
        valid = ok;
      });
    }, 120);
    return () => clearTimeout(timer); // 重新渲染或组件销毁时清定时器
  });

  function setType(t: PayloadType) {
    type = t;
    fields = {};
  }

  function fmtOf(bcid: Symbology): ScanFormat {
    const map: Partial<Record<Symbology, ScanFormat>> = {
      qrcode: 'QRCode',
      datamatrix: 'DataMatrix',
      pdf417: 'PDF417',
      azteccode: 'Aztec',
      ean13: 'EAN13',
      ean8: 'EAN8',
      upca: 'UPCA',
      upce: 'UPCE',
      code128: 'Code128',
      code39: 'Code39',
      code93: 'Code93',
      rationalizedCodabar: 'Codabar',
      interleaved2of5: 'ITF'
    };
    return map[bcid] ?? 'Unknown';
  }

  function saveHistory() {
    if (!finalText.trim()) return;
    history.add(finalText, fmtOf(symbology), 'generate');
  }

  async function downloadPng() {
    const blob = await renderToPngBlob({ bcid: symbology, text: finalText, eclevel: ecLevel });
    if (!blob) return;
    saveHistory();
    download(blob, `qr-helper-${symbology}.png`);
    showToast($_('toast.saved'));
  }

  async function downloadSvg() {
    const svg = await renderToSvg({ bcid: symbology, text: finalText, eclevel: ecLevel, scale: 4 });
    if (!svg) return;
    saveHistory();
    download(new Blob([svg], { type: 'image/svg+xml' }), `qr-helper-${symbology}.svg`);
    showToast($_('toast.saved'));
  }

  function copyText() {
    if (!finalText.trim()) return;
    saveHistory();
    navigator.clipboard?.writeText(finalText).then(() => showToast($_('toast.copied')));
  }
</script>

<div class="two-col">
<div class="tc-left">

<div class="chips">
  {#each payloadTypes as pt (pt.id)}
    <button class="chip" class:on={type === pt.id} onclick={() => setType(pt.id)}>
      <Icon name={pt.icon} cls="ic-sm" />
      {$_(`type.${pt.id}`)}
    </button>
  {/each}
</div>

{#if type === 'text'}
  <div class="field">
    <label for="f-text">{$_('gen.text')}</label>
    <textarea id="f-text" rows="3" bind:value={fields.text}></textarea>
  </div>
{:else if type === 'url'}
  <div class="field">
    <label for="f-url">{$_('gen.url')}</label>
    <input id="f-url" type="url" bind:value={fields.url} placeholder="https://" />
  </div>
{:else if type === 'wifi'}
  <div class="field">
    <label for="f-ssid">{$_('gen.wifiSsid')}</label>
    <input id="f-ssid" type="text" bind:value={fields.ssid} />
  </div>
  <div class="field">
    <label for="f-pass">{$_('gen.wifiPass')}</label>
    <input id="f-pass" type="password" bind:value={fields.pass} />
  </div>
  <div class="field">
    <label for="f-enc">{$_('gen.wifiEnc')}</label>
    <select id="f-enc" bind:value={fields.enc}>
      <option value="WPA">WPA/WPA2/WPA3</option>
      <option value="WEP">WEP</option>
      <option value="nopass">nopass</option>
    </select>
  </div>
{:else if type === 'vcard'}
  <div class="field">
    <label for="f-name">{$_('gen.vcardName')}</label>
    <input id="f-name" type="text" bind:value={fields.name} />
  </div>
  <div class="field">
    <label for="f-org">{$_('gen.vcardOrg')}</label>
    <input id="f-org" type="text" bind:value={fields.org} />
  </div>
  <div class="field">
    <label for="f-tel">{$_('gen.vcardTel')}</label>
    <input id="f-tel" type="tel" bind:value={fields.tel} />
  </div>
  <div class="field">
    <label for="f-email">{$_('gen.vcardEmail')}</label>
    <input id="f-email" type="email" bind:value={fields.email} />
  </div>
  <div class="field">
    <label for="f-vurl">{$_('gen.vcardUrl')}</label>
    <input id="f-vurl" type="url" bind:value={fields.vcardUrl} />
  </div>
{:else if type === 'event'}
  <div class="field">
    <label for="f-sum">{$_('gen.eventSummary')}</label>
    <input id="f-sum" type="text" bind:value={fields.summary} />
  </div>
  <div class="field">
    <label for="f-start">{$_('gen.eventStart')}</label>
    <input id="f-start" type="datetime-local" bind:value={fields.start} />
  </div>
  <div class="field">
    <label for="f-end">{$_('gen.eventEnd')}</label>
    <input id="f-end" type="datetime-local" bind:value={fields.end} />
  </div>
  <div class="field">
    <label for="f-loc">{$_('gen.eventLocation')}</label>
    <input id="f-loc" type="text" bind:value={fields.location} />
  </div>
  <div class="field">
    <label for="f-desc">{$_('gen.eventDesc')}</label>
    <textarea id="f-desc" rows="2" bind:value={fields.desc}></textarea>
  </div>
{:else if type === 'tel'}
  <div class="field">
    <label for="f-num">{$_('gen.telNumber')}</label>
    <input id="f-num" type="tel" bind:value={fields.number} />
  </div>
{:else if type === 'email'}
  <div class="field">
    <label for="f-to">{$_('gen.emailTo')}</label>
    <input id="f-to" type="email" bind:value={fields.to} />
  </div>
  <div class="field">
    <label for="f-sub">{$_('gen.emailSubject')}</label>
    <input id="f-sub" type="text" bind:value={fields.subject} />
  </div>
  <div class="field">
    <label for="f-body">{$_('gen.emailBody')}</label>
    <textarea id="f-body" rows="3" bind:value={fields.body}></textarea>
  </div>
{:else if type === 'sms'}
  <div class="field">
    <label for="f-smsnum">{$_('gen.smsNumber')}</label>
    <input id="f-smsnum" type="tel" bind:value={fields.number} />
  </div>
  <div class="field">
    <label for="f-smsbody">{$_('gen.smsBody')}</label>
    <textarea id="f-smsbody" rows="3" bind:value={fields.msg}></textarea>
  </div>
{/if}

<div class="chips" style="margin-top:12px">
  {#each symbologies as sym (sym.id)}
    <button class="chip" class:on={symbology === sym.id} onclick={() => (symbology = sym.id)}>
      {sym.label}
    </button>
  {/each}
</div>

{#if symbology === 'qrcode'}
  <div class="field">
    <span class="lbl">{$_('gen.ec')}</span>
    <div class="seg">
      {#each ['L', 'M', 'Q', 'H'] as lv (lv)}
        <button class:on={ecLevel === lv} onclick={() => (ecLevel = lv as typeof ecLevel)}>{lv}</button>
      {/each}
    </div>
  </div>
{/if}

</div>

<div class="tc-right tc-sticky">

{#if finalText.trim()}
  <div class="qr-card">
    <canvas bind:this={canvasEl} width="336" height="336"></canvas>
    <div class="cap">
      {valid ? `${symbologies.find((s) => s.id === symbology)?.label} · ${$_('gen.preview')}` : $_('gen.invalid')}
    </div>
  </div>
{:else}
  <div class="preview-hint">{$_('gen.previewHint')}</div>
{/if}

<div class="row" style="padding:14px 16px 0">
  <button class="btn btn-fill" style="flex:1" disabled={!valid || !finalText.trim()} onclick={downloadPng}>
    <Icon name="download" cls="ic-sm" />
    {$_('gen.downloadPng')}
  </button>
  <button class="btn btn-tonal" style="flex:1" disabled={!valid || !finalText.trim()} onclick={downloadSvg}>
    {$_('gen.downloadSvg')}
  </button>
  <button class="btn btn-tonal btn-icon" disabled={!finalText.trim()} onclick={copyText} aria-label={$_('gen.copyText')}>
    <Icon name="copy" cls="ic-sm" />
  </button>
</div>
</div>
</div>
