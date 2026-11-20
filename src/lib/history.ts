import { writable, get } from 'svelte/store';
import type { HistoryItem, ScanFormat, HistorySource } from './types';

const KEY = 'qrhelper.history';
const MAX = 200;

/** 反序列化白名单：合法 ScanFormat / HistorySource 取值 */
const FORMATS: ReadonlySet<string> = new Set([
  'QRCode', 'DataMatrix', 'PDF417', 'Aztec', 'EAN13', 'EAN8', 'UPCA', 'UPCE',
  'Code128', 'Code39', 'Code93', 'Codabar', 'ITF', 'Unknown'
]);
const SOURCES: ReadonlySet<string> = new Set(['scan', 'generate']);

/** 校验并归一化单条历史记录；非法返回 null */
function sanitizeItem(x: unknown): HistoryItem | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.text !== 'string' || o.text.length === 0) return null;
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return null;
  const format =
    typeof o.format === 'string' && FORMATS.has(o.format) ? (o.format as ScanFormat) : 'Unknown';
  const source =
    typeof o.source === 'string' && SOURCES.has(o.source) ? (o.source as HistorySource) : 'scan';
  const id =
    typeof o.id === 'string' && o.id.length > 0
      ? o.id
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, ts: o.ts, format, text: o.text, source };
}

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr
          .map(sanitizeItem)
          .filter((x): x is HistoryItem => x !== null)
          .slice(0, MAX);
      }
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

/** CSV 字段转义（导出供测试）：危险前缀防公式注入 + 双引号包裹 */
export function csvEsc(v: string): string {
  const s = /^[=+\-@\t\r\n ]/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 时间戳转 ISO；非法或超出 Date 范围时输出空串（防御 RangeError） */
function isoTime(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  try {
    return new Date(ts).toISOString();
  } catch {
    return '';
  }
}

/** 导出 CSV（带 BOM，Excel 友好；危险前缀前置 ' 防公式注入） */
export function exportCsv(items: HistoryItem[], filename = 'qr-helper-history.csv') {
  const rows = [
    ['time', 'type', 'format', 'source', 'content'],
    ...items.map((i) => [isoTime(i.ts), 'text', i.format, i.source, i.text])
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map(csvEsc).join(',')).join('\r\n');
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
