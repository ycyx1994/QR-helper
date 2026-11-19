<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Icon from '../lib/ui/Icon.svelte';
  import { history, exportCsv, download } from '../lib/history';
  import { detect } from '../lib/actions';
  import { showToast } from '../lib/ui/toast';
  import type { HistoryItem } from '../lib/types';

  let search = $state('');
  let selectMode = $state(false);
  let selected = $state(new Set<string>());
  let confirmOpen = $state(false);

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
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) confirmOpen = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') confirmOpen = false;
    }}
  >
    <div class="dialog" role="alertdialog" aria-modal="true" tabindex="-1">
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
