import { writable, get } from 'svelte/store';
import type { HistoryItem, ScanFormat, HistorySource } from './types';

const KEY = 'qrhelper.history';
const MAX = 200;

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => x && typeof x.text === 'string');
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return [];
}

function createHistory() {
  const { subscribe, update, set } = writable<HistoryItem[]>(load());

  subscribe((list) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* 存储满则忽略 */
    }
  });

  return {
    subscribe,
    add(text: string, format: ScanFormat, source: HistorySource) {
      update((list) => {
        // 与最近一条相同则只刷新时间戳，不重复入列
        if (list[0] && list[0].text === text && list[0].source === source) {
          return [{ ...list[0], ts: Date.now() }, ...list.slice(1)];
        }
        const item: HistoryItem = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          format,
          text,
          source
        };
        return [item, ...list].slice(0, MAX);
      });
    },
    remove(ids: string[]) {
      const idSet = new Set(ids);
      update((list) => list.filter((x) => !idSet.has(x.id)));
    },
    clear: () => set([]),
    count: () => get({ subscribe }).length
  };
}

export const history = createHistory();

/** 导出 CSV（带 BOM，Excel 友好；\t 前缀防公式注入） */
export function exportCsv(items: HistoryItem[], filename = 'qr-helper-history.csv') {
  const esc = (v: string) => {
    const s = v.startsWith('=') || v.startsWith('+') || v.startsWith('-') ? '\t' + v : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['time', 'type', 'format', 'source', 'content'],
    ...items.map((i) => [
      new Date(i.ts).toISOString(),
      'text',
      i.format,
      i.source,
      i.text
    ])
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
