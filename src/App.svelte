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

  type Tab = 'scan' | 'generate' | 'history' | 'settings';

  function tabFromUrl(): Tab {
    const t = new URL(location.href).searchParams.get('tab');
    return t === 'generate' || t === 'history' || t === 'settings' ? t : 'scan';
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

  function toggleTheme() {
    settings.update((s) => {
      const darkNow = document.documentElement.classList.contains('dark');
      return { ...s, theme: darkNow ? 'light' : 'dark' };
    });
  }

  const dark = $derived(document.documentElement.classList.contains('dark'));

  const tabs: { id: Tab; icon: string; labelKey: string }[] = [
    { id: 'scan', icon: 'camera', labelKey: 'tab.scan' },
    { id: 'generate', icon: 'qrGen', labelKey: 'tab.generate' },
    { id: 'history', icon: 'history', labelKey: 'tab.history' },
    { id: 'settings', icon: 'gear', labelKey: 'tab.settings' }
  ];
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
      <HistoryView />
    {:else}
      <SettingsView />
    {/if}
  </main>

  <nav class="nav">
    {#each tabs as t (t.id)}
      <button class="item" class:on={tab === t.id} onclick={() => navigate(t.id)}>
        <div class="pill"><Icon name={t.icon} /></div>
        {$_(t.labelKey)}
      </button>
    {/each}
  </nav>

  {#if $toast}
    <div class="toast">{$toast}</div>
  {/if}
</div>
