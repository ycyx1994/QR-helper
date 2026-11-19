<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { untrack } from 'svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import { buildPayload, renderToCanvas, renderToSvg, renderToPngBlob, autoCheckDigit } from '../lib/payloads';
  import type { PayloadFields } from '../lib/payloads';
  import { history, download } from '../lib/history';
  import { showToast } from '../lib/ui/toast';
  import type { PayloadType, Symbology, ScanFormat } from '../lib/types';

  let { initialText = '' }: { initialText?: string } = $props();

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
  let fields: PayloadFields = $state({ text: untrack(() => initialText) });
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let valid = $state(true);

  const is2d = $derived(['qrcode', 'datamatrix', 'pdf417', 'azteccode'].includes(symbology));
  const payloadText = $derived(buildPayload(type, fields));

  $effect(() => {
    if (initialText && !fields.text) fields.text = initialText;
  });

  $effect(() => {
    const text = payloadText;
    const bcid = symbology;
    const ec = ecLevel;
    const cv = canvasEl;
    if (!cv) return;
    if (!text.trim()) {
      const ctx = cv.getContext('2d');
      ctx?.clearRect(0, 0, cv.width, cv.height);
      valid = true;
      return;
    }
    renderToCanvas(cv, { bcid, text, eclevel: ec, scale: 4, padding: 2 }).then((ok) => (valid = ok));
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
    if (!payloadText.trim()) return;
    history.add(autoCheckDigit(symbology, payloadText), fmtOf(symbology), 'generate');
  }

  async function downloadPng() {
    const blob = await renderToPngBlob({ bcid: symbology, text: payloadText, eclevel: ecLevel });
    if (!blob) return;
    saveHistory();
    download(blob, `qr-helper-${symbology}.png`);
    showToast($_('toast.saved'));
  }

  async function downloadSvg() {
    const svg = await renderToSvg({ bcid: symbology, text: payloadText, eclevel: ecLevel, scale: 4 });
    if (!svg) return;
    saveHistory();
    download(new Blob([svg], { type: 'image/svg+xml' }), `qr-helper-${symbology}.svg`);
    showToast($_('toast.saved'));
  }

  function copyText() {
    if (!payloadText.trim()) return;
    saveHistory();
    navigator.clipboard?.writeText(payloadText).then(() => showToast($_('toast.copied')));
  }
</script>

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

{#if payloadText.trim()}
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
  <button class="btn btn-fill" style="flex:1" disabled={!valid || !payloadText.trim()} onclick={downloadPng}>
    <Icon name="download" cls="ic-sm" />
    {$_('gen.downloadPng')}
  </button>
  <button class="btn btn-tonal" style="flex:1" disabled={!valid || !payloadText.trim()} onclick={downloadSvg}>
    {$_('gen.downloadSvg')}
  </button>
  <button class="btn btn-tonal btn-icon" disabled={!payloadText.trim()} onclick={copyText} aria-label={$_('gen.copyText')}>
    <Icon name="copy" cls="ic-sm" />
  </button>
</div>
