<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Icon from './lib/ui/Icon.svelte';
  import ScanView from './views/ScanView.svelte';
  import GenerateView from './views/GenerateView.svelte';
  import HistoryView from './views/HistoryView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import { toast, showToast } from './lib/ui/toast';
  import { settings } from './lib/settings';
  import { deferredPrompt, isStandalone, isIosSafari, promptInstall } from './lib/pwa';
  import { pendingImage } from './lib/paste';

  type Tab = 'scan' | 'generate' | 'history' | 'settings';

  function tabFromUrl(): Tab {
    const t = new URL(location.href).searchParams.get('tab');
    if (t === 'scan' || t === 'generate' || t === 'history' || t === 'settings') return t;
    return window.matchMedia('(min-width: 1024px)').matches ? 'generate' : 'scan';
  }

  let tab: Tab = $state(tabFromUrl());
  let genText = $state('');
  let installDismissed = $state(localStorage.getItem('qrhelper.installDismissed') === '1');

  const showInstallBanner = $derived(
    !installDismissed && !isStandalone() && ($deferredPrompt !== null || isIosSafari())
  );

  async function installApp() {
    if (isStandalone()) {
      showToast($_('set.installed'));
      return;
    }
    const r = await promptInstall();
    if (r === 'accepted') showToast($_('toast.installDone'));
    else if (r === 'dismissed') showToast($_('toast.installCancel'));
    else showToast(isIosSafari() ? $_('install.ios') : $_('toast.installNoPrompt'), 3600);
  }

  function dismissInstall() {
    installDismissed = true;
    localStorage.setItem('qrhelper.installDismissed', '1');
  }

  function navigate(t: Tab, prefill?: string) {
    tab = t;
    if (prefill !== undefined) genText = prefill;
    const url = new URL(location.href);
    url.searchParams.set('tab', t);
    history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  }

  $effect(() => {
    const onPop = () => (tab = tabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  // 任意页面粘贴图片 → 送扫码页识别
  $effect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (tab === 'scan') return;
      const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) {
        pendingImage.set(f);
        navigate('scan');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  function toggleTheme() {
    settings.update((s) => {
      const darkNow = document.documentElement.classList.contains('dark');
      return { ...s, theme: darkNow ? 'light' : 'dark' };
    });
  }

  const dark = $derived(document.documentElement.classList.contains('dark'));

  const tabDefs = [
    { id: 'scan', icon: 'camera', labelKey: 'tab.scan' },
    { id: 'generate', icon: 'qrGen', labelKey: 'tab.generate' },
    { id: 'history', icon: 'history', labelKey: 'tab.history' },
    { id: 'settings', icon: 'gear', labelKey: 'tab.settings' }
  ] as const;
  // 桌面侧边栏顺序：生成 / 扫码 / 历史 / 设置（1-4 快捷键随显示顺序）
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
  const tabs: (typeof tabDefs)[number][] = isDesktop
    ? [tabDefs[1], tabDefs[0], tabDefs[2], tabDefs[3]]
    : [...tabDefs];
</script>

<div class="app">
  <header class="appbar">
    <div class="brand">
      <div class="logo"><Icon name="qr" /></div>
      {$_('app.title')}
    </div>
    <button class="icon-btn" onclick={toggleTheme} aria-label={$_('set.theme')}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  </header>

  {#if showInstallBanner}
    <div class="install-banner">
      <div class="ib-icon"><Icon name="download" /></div>
      <div class="ib-text">
        <strong>{$_('install.title')}</strong>
        <span>{$deferredPrompt ? $_('install.desc') : $_('install.ios')}</span>
      </div>
      {#if $deferredPrompt}
        <button class="btn btn-fill ib-cta" onclick={installApp}>{$_('install.cta')}</button>
      {/if}
      <button class="ib-x" onclick={dismissInstall} aria-label={$_('install.dismiss')}>
        <Icon name="x" cls="ic-sm" />
      </button>
    </div>
  {/if}

  <main class="content">
    {#if tab === 'scan'}
      <ScanView ongenerate={(text) => navigate('generate', text)} />
    {:else if tab === 'generate'}
      <GenerateView initialText={genText} />
    {:else if tab === 'history'}
      <HistoryView ongenerate={(text) => navigate('generate', text)} />
    {:else}
      <SettingsView />
    {/if}
  </main>

  <nav class="nav">
    {#each tabs as t (t.id)}
      <button class="item" class:on={tab === t.id} onclick={() => navigate(t.id)}>
        <div class="pill"><Icon name={t.icon} /></div>
        <span class="lbl">{$_(t.labelKey)}</span>
      </button>
    {/each}
  </nav>

  {#if $toast}
    <div class="toast">{$toast}</div>
  {/if}
</div>
