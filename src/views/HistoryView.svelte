<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Icon from '../lib/ui/Icon.svelte';
  import { history, exportCsv, download } from '../lib/history';
  import { renderToCanvas, renderToPngBlob, renderToSvg } from '../lib/payloads';
  import { detect } from '../lib/actions';
  import { showToast } from '../lib/ui/toast';
  import type { HistoryItem } from '../lib/types';

  let { ongenerate }: { ongenerate: (text: string) => void } = $props();

  let search = $state('');
  let selectMode = $state(false);
  let selected = $state(new Set<string>());
  let confirmOpen = $state(false);
  let qrItem = $state<HistoryItem | null>(null);
  let qrCanvas = $state<HTMLCanvasElement | undefined>();
  // 浮层 dialog 元素引用（打开后聚焦用）
  let confirmDialog = $state<HTMLDivElement | undefined>();
  let qrDialog = $state<HTMLDivElement | undefined>();

  // 清空确认浮层：打开时聚焦 dialog、Esc 关闭（window 级监听，焦点不在浮层内也能关）、关闭后焦点还给触发按钮
  $effect(() => {
    if (!confirmOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmDialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') confirmOpen = false;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  });

  // 二维码浮层：同上（打开聚焦 / Esc 关闭 / 焦点还给触发按钮）
  $effect(() => {
    if (!qrItem) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    qrDialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') qrItem = null;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  });

  // 浮层打开时渲染该项二维码
  $effect(() => {
    const item = qrItem;
    const canvas = qrCanvas;
    if (item && canvas) void renderToCanvas(canvas, { bcid: 'qrcode', text: item.text, eclevel: 'M' });
  });

  async function downloadQrPng() {
    if (!qrItem) return;
    const blob = await renderToPngBlob({ bcid: 'qrcode', text: qrItem.text, eclevel: 'M' });
    if (blob) download(blob, 'qr-helper-qrcode.png');
  }

  async function downloadQrSvg() {
    if (!qrItem) return;
    const svg = await renderToSvg({ bcid: 'qrcode', text: qrItem.text, eclevel: 'M', scale: 4 });
    if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-helper-qrcode.svg');
  }

  const filtered = $derived(
    $history.filter((h) => !search.trim() || h.text.toLowerCase().includes(search.trim().toLowerCase()))
  );

  function relTime(ts: number): string {
    const diff = Date.now() - ts;
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const min = Math.round(diff / 60000);
    if (min < 1) return rtf.format(0, 'minute');
    if (min < 60) return rtf.format(-min, 'minute');
    const h = Math.round(min / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    return rtf.format(-Math.round(h / 24), 'day');
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function copy(item: HistoryItem) {
    navigator.clipboard?.writeText(item.text).then(() => showToast($_('toast.copied')));
  }

  function del(ids: string[]) {
    history.remove(ids);
    selected = new Set();
    showToast($_('toast.deleted'));
  }

  function doExport() {
    exportCsv(filtered);
    showToast($_('toast.exported'));
  }

  function openItem(item: HistoryItem) {
    const d = detect(item.text);
    if (d.url) window.open(d.url, '_blank', 'noopener,noreferrer');
    else copy(item);
  }
</script>

<div class="appbar" style="position:static;background:none;backdrop-filter:none;padding-left:16px;padding-right:8px">
  <div class="search" style="flex:1;margin:0">
    <Icon name="search" cls="ic-sm" />
    <input type="search" placeholder={$_('hist.search')} bind:value={search} />
  </div>
  <button class="btn btn-text" onclick={() => { selectMode = !selectMode; selected = new Set(); }}>
    {selectMode ? $_('hist.done') : $_('hist.selectMode')}
  </button>
</div>

{#if $history.length === 0}
  <div class="empty-box">
    <div class="big"><Icon name="history" /></div>
    <div>{$_('hist.empty')}</div>
    <div style="margin-top:6px;font-size:12px">{$_('hist.emptyHint')}</div>
  </div>
{:else}
  {#if selectMode}
    <div class="row" style="padding:12px 16px 0;justify-content:space-between">
      <span style="font-size:13px;color:var(--muted)">{$_('hist.selected', { values: { count: selected.size } })}</span>
      <div class="row">
        <button class="btn btn-text" onclick={doExport}>{$_('hist.exportCsv')}</button>
        <button class="btn btn-danger-text" disabled={selected.size === 0} onclick={() => del([...selected])}>
          {$_('hist.deleteSelected')}
        </button>
      </div>
    </div>
  {:else}
    <div class="row" style="padding:12px 16px 0;justify-content:flex-end">
      <button class="btn btn-text" onclick={doExport}>{$_('hist.exportCsv')}</button>
      <button class="btn btn-danger-text" onclick={() => (confirmOpen = true)}>{$_('hist.clear')}</button>
    </div>
  {/if}

  {#each filtered as item (item.id)}
    <div class="hist" class:selected={selected.has(item.id)}>
      {#if selectMode}
        <button
          class="act-btn"
          style="color:{selected.has(item.id) ? 'var(--primary)' : 'var(--muted)'}"
          onclick={() => toggleSelect(item.id)}
          aria-label={$_('hist.selectMode')}
        >
          <Icon name={selected.has(item.id) ? 'check' : 'dots'} cls="ic-sm" />
        </button>
      {/if}
      <div class="info">
        <div class="row" style="gap:8px">
          <span class="badge" class:alt={item.source !== 'scan'}>{item.format.toUpperCase()}</span>
          <span class="badge alt">{$_(item.source === 'scan' ? 'hist.source.scan' : 'hist.source.generate')}</span>
        </div>
        <div class="t1" style="margin-top:7px">{item.text}</div>
        <div class="t2">{relTime(item.ts)}</div>
      </div>
      {#if !selectMode}
        <div class="acts">
          <button class="act-btn" onclick={() => (qrItem = item)} aria-label={$_('act.makeQr')}>
            <Icon name="qrGen" cls="ic-sm" />
          </button>
          <button class="act-btn" onclick={() => copy(item)} aria-label={$_('act.copy')}>
            <Icon name="copy" cls="ic-sm" />
          </button>
          <button class="act-btn" onclick={() => openItem(item)} aria-label={$_('act.open')}>
            <Icon name="external" cls="ic-sm" />
          </button>
          <button class="act-btn" onclick={() => del([item.id])} aria-label={$_('hist.deleteSelected')}>
            <Icon name="trash" cls="ic-sm" />
          </button>
        </div>
      {/if}
    </div>
  {/each}

  {#if filtered.length === 0}
    <div class="empty-box">{$_('hist.empty')}</div>
  {/if}
{/if}

{#if confirmOpen}
  <!-- Esc 已由 window 级监听统一处理（打开时焦点在 dialog 内） -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) confirmOpen = false;
    }}
  >
    <div class="dialog" role="alertdialog" aria-modal="true" tabindex="-1" bind:this={confirmDialog}>
      <h3>{$_('hist.clear')}</h3>
      <p>{$_('hist.confirmClear', { values: { count: $history.length } })}</p>
      <div class="row">
        <button class="btn btn-text" onclick={() => (confirmOpen = false)}>{$_('hist.cancel')}</button>
        <button
          class="btn btn-solid-danger"
          onclick={() => {
            history.clear();
            confirmOpen = false;
            showToast($_('toast.deleted'));
          }}
        >
          {$_('hist.confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if qrItem}
  <!-- Esc 已由 window 级监听统一处理（打开时焦点在 dialog 内） -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) qrItem = null;
    }}
  >
    <div class="dialog qr-dialog" role="dialog" aria-modal="true" tabindex="-1" bind:this={qrDialog}>
      <h3>{$_('hist.qrTitle')}</h3>
      <div class="qr-dialog-body">
        <canvas bind:this={qrCanvas} width="220" height="220"></canvas>
      </div>
      <div class="row">
        <button class="btn btn-tonal" style="flex:1" onclick={downloadQrPng}>{$_('hist.qrDownloadPng')}</button>
        <button class="btn btn-tonal" style="flex:1" onclick={downloadQrSvg}>{$_('hist.qrDownloadSvg')}</button>
        <button
          class="btn btn-fill"
          style="flex:1"
          onclick={() => {
            const text = qrItem!.text;
            qrItem = null;
            ongenerate(text);
          }}
        >
          {$_('hist.qrEdit')}
        </button>
      </div>
    </div>
  </div>
{/if}
