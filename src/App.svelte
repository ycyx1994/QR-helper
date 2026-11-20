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
  // 生成页预填：文本 + 递增 nonce（消费方仅在 nonce 变化时覆盖编辑内容，避免清空后"复活"）
  let prefillText = $state('');
  let prefillNonce = $state(0);
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
    const sameTab = t === tab;
    tab = t;
    if (prefill !== undefined) {
      // 带文本跳转：更新预填并递增 nonce，GenerateView 仅在 nonce 变化时覆盖编辑内容
      prefillText = prefill;
      prefillNonce += 1;
    } else {
      // 普通跳转：清空预填，防止旧文本在组件重新挂载时"复活"
      prefillText = '';
    }
    const url = new URL(location.href);
    url.searchParams.set('tab', t);
    // 同 tab 重复进入用 replaceState 防重复条目；切 tab 用 pushState 建历史条目（后退可回到上一 tab）
    if (sameTab) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    window.scrollTo({ top: 0 });
  }

  // 初始进入：replaceState 建立基线 URL（补 ?tab=），之后 pushState 的条目才有可回退起点
  $effect(() => {
    const url = new URL(location.href);
    url.searchParams.set('tab', tabFromUrl());
    history.replaceState(null, '', url);
  });

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

  // 系统深色偏好：matchMedia 变化时更新（theme === 'system' 时参与明暗判定）
  let systemDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);

  $effect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => (systemDark = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  // 生效中的深浅主题：从 settings 真实数据源派生（DOM 的 dark class 只是 applyTheme 的副作用），主题切换后图标随动
  const dark = $derived($settings.theme === 'dark' || ($settings.theme === 'system' && systemDark));

  function toggleTheme() {
    // 以生效中的明暗为准翻转（当前 dark → light，否则 dark），不再读 DOM class
    settings.update((s) => ({ ...s, theme: dark ? 'light' : 'dark' }));
  }

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
    <button
      class="icon-btn"
      onclick={toggleTheme}
      aria-label={`${$_('set.theme')} · ${dark ? $_('set.theme.dark') : $_('set.theme.light')}`}
    >
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
      <GenerateView {prefillText} {prefillNonce} />
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

  <!-- 常驻 aria-live 区域：toast 文本变化会被读屏播报 -->
  <div class="toast-region" role="status" aria-live="polite">
    {#if $toast}
      <div class="toast">{$toast}</div>
    {/if}
  </div>
</div>
