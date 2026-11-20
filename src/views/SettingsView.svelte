<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Icon from '../lib/ui/Icon.svelte';
  import Switch from '../lib/ui/Switch.svelte';
  import { settings, type ThemePref, type AccentPreset } from '../lib/settings';
  import { switchLang, type LangPref } from '../lib/i18n';
  import { history, exportCsv } from '../lib/history';
  import { showToast } from '../lib/ui/toast';
  import {
    isStandalone,
    isIosSafari,
    promptInstall,
    updateAvailable,
    updateChecking,
    checkForUpdate,
    applyUpdate
  } from '../lib/pwa';

  let confirmOpen = $state(false);
  // 清空确认浮层 dialog 引用（打开后聚焦用）
  let confirmDialog = $state<HTMLDivElement | undefined>();

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

  const accents: { id: AccentPreset; color: string }[] = [
    { id: 'green', color: '#2E6B3E' },
    { id: 'blue', color: '#1D4ED8' },
    { id: 'violet', color: '#6D28D9' },
    { id: 'pink', color: '#BE185D' },
    { id: 'orange', color: '#C2410C' },
    { id: 'slate', color: '#475569' }
  ];

  function setTheme(theme: ThemePref) {
    settings.update((s) => ({ ...s, theme }));
  }
  function setLang(lang: LangPref) {
    settings.update((s) => ({ ...s, lang }));
    switchLang(lang);
  }
  function doExport() {
    exportCsv($history);
    showToast($_('toast.exported'));
  }

  const installed = isStandalone();

  async function doInstall() {
    if (isStandalone()) {
      showToast($_('set.installed'));
      return;
    }
    const r = await promptInstall();
    if (r === 'accepted') showToast($_('toast.installDone'));
    else if (r === 'dismissed') showToast($_('toast.installCancel'));
    else showToast(isIosSafari() ? $_('install.ios') : $_('toast.installNoPrompt'), 3600);
  }
</script>

<div class="two-col">
<div class="tc-left">

<div class="group-label">{$_('set.appearance')}</div>
<div class="group">
  <div class="g-row">
    <div class="gl">{$_('set.theme')}</div>
    <div class="gr" style="flex:0 0 auto">
      <div class="seg" style="width:220px;margin:0">
        <button class:on={$settings.theme === 'light'} onclick={() => setTheme('light')}>{$_('set.theme.light')}</button>
        <button class:on={$settings.theme === 'dark'} onclick={() => setTheme('dark')}>{$_('set.theme.dark')}</button>
        <button class:on={$settings.theme === 'system'} onclick={() => setTheme('system')}>{$_('set.theme.system')}</button>
      </div>
    </div>
  </div>
  <div class="g-row"><div class="gl">{$_('set.accent')}</div></div>
  <div class="swatch-row">
    {#each accents as a (a.id)}
      <button
        class="sw"
        class:on={$settings.accent === a.id}
        style="background:{a.color}"
        aria-label={a.id}
        onclick={() => settings.update((s) => ({ ...s, accent: a.id }))}
      ></button>
    {/each}
  </div>
</div>

<div class="group-label">{$_('set.feedback')}</div>
<div class="group">
  <div class="g-row">
    <div class="gl">{$_('set.sound')}</div>
    <div class="gr">
      <Switch on={$settings.sound} label={$_('set.sound')} onchange={(v) => settings.update((s) => ({ ...s, sound: v }))} />
    </div>
  </div>
  <div class="g-row">
    <div class="gl">{$_('set.vibrate')}</div>
    <div class="gr">
      <Switch on={$settings.vibrate} label={$_('set.vibrate')} onchange={(v) => settings.update((s) => ({ ...s, vibrate: v }))} />
    </div>
  </div>
  <div class="g-row">
    <div class="gl">{$_('set.autoCamera')}</div>
    <div class="gr">
      <Switch on={$settings.autoCamera} label={$_('set.autoCamera')} onchange={(v) => settings.update((s) => ({ ...s, autoCamera: v }))} />
    </div>
  </div>
</div>

<div class="group-label">{$_('set.language')}</div>
<div class="group">
  <div class="g-row">
    <div class="gl">{$_('set.language')}</div>
    <div class="gr" style="flex:0 0 auto">
      <div class="seg" style="width:250px;margin:0">
        <button class:on={$settings.lang === 'auto'} onclick={() => setLang('auto')}>{$_('set.lang.auto')}</button>
        <button class:on={$settings.lang === 'zh-CN'} onclick={() => setLang('zh-CN')}>中文</button>
        <button class:on={$settings.lang === 'en'} onclick={() => setLang('en')}>English</button>
      </div>
    </div>
  </div>
</div>

</div>

<div class="tc-right">

<div class="group-label">{$_('set.data')}</div>
<div class="group">
  <div class="g-row">
    <div class="gl">{$_('set.storage')}</div>
    <div class="gr">{$_('set.records', { values: { count: $history.length } })}</div>
  </div>
  <button class="g-row" onclick={doExport}>
    <div class="gl">{$_('hist.exportCsv')}</div>
    <div class="gr"><Icon name="download" cls="ic-sm" /></div>
  </button>
  <button class="g-row" onclick={() => (confirmOpen = true)}>
    <div class="gl" style="color:var(--danger)">{$_('hist.clear')}</div>
    <div class="gr" style="color:var(--danger)"><Icon name="trash" cls="ic-sm" /></div>
  </button>
</div>

<div class="group-label">{$_('set.about')}</div>
<div class="group">
  <button class="g-row" onclick={doInstall}>
    <div class="gl">{$_('set.installApp')}</div>
    <div class="gr">{#if installed}<span class="badge">{$_('set.installed')}</span>{:else}<Icon name="download" cls="ic-sm" />{/if}</div>
  </button>
  <div class="g-row"><div class="gl">{$_('set.version')}</div><div class="gr">v0.1.0</div></div>
  <div class="g-row">
    <div class="gl">{$_('set.update')}</div>
    <div class="gr">
      {#if $updateAvailable}
        <button class="btn btn-fill" style="height:34px;padding:0 16px" onclick={applyUpdate}>
          {$_('set.updateNow')}
        </button>
      {:else}
        <button
          class="btn btn-tonal"
          style="height:34px;padding:0 16px"
          disabled={$updateChecking}
          onclick={async () => {
            const found = await checkForUpdate();
            showToast(found ? $_('toast.updateFound') : $_('toast.upToDate'));
          }}
        >
          {$updateChecking ? $_('set.checking') : $_('set.updateCheck')}
        </button>
      {/if}
    </div>
  </div>
  <div class="g-row">
    <div class="gl">{$_('set.engine')}</div>
    <div class="gr">zxing-wasm 3.1.7 · bwip-js 4.11.4</div>
  </div>
  <div class="g-row">
    <div class="gl">{$_('set.privacy')}</div>
    <div class="gr"><span class="badge">{$_('set.privacyValue')}</span></div>
  </div>
  <div class="g-row"><div class="gl">{$_('set.license')}</div><div class="gr">MIT</div></div>
  <button
    class="g-row"
    onclick={() => window.open('https://github.com/ycyx1994/QR-helper', '_blank', 'noopener,noreferrer')}
  >
    <div class="gl">{$_('set.github')}</div>
    <div class="gr">ycyx1994/QR-helper <Icon name="external" cls="ic-sm" /></div>
  </button>
</div>
</div>
</div>

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
