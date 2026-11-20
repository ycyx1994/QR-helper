import type { PayloadType, Symbology } from './types';

/** WiFi 加密类型 */
export type WifiEnc = 'WPA' | 'WEP' | 'nopass';

export interface PayloadFields {
  text?: string;
  url?: string;
  // wifi
  ssid?: string;
  pass?: string;
  enc?: WifiEnc;
  hidden?: boolean;
  // vcard
  name?: string;
  org?: string;
  tel?: string;
  email?: string;
  vcardUrl?: string;
  // event
  summary?: string;
  start?: string; // datetime-local 值 2026-01-01T09:00
  end?: string;
  location?: string;
  desc?: string;
  // tel / sms / email
  number?: string;
  to?: string;
  subject?: string;
  body?: string;
  msg?: string;
}

function wifiEscape(v: string): string {
  return v.replace(/([\\;,:"])/g, '\\$1');
}

function dtLocal(v: string): string {
  // 日期时间 "2026-01-01T09:00" → "20260101T090000"；纯日期 "2026-01-01" → "20260101"
  const flat = v.replace(/[-:]/g, '');
  return v.includes('T') ? flat.padEnd(15, '0') : flat.slice(0, 8);
}

/** vCard 3.0 / iCal 文本值转义：`\` `;` `,` 与换行 */
function textEscape(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export function buildPayload(type: PayloadType, f: PayloadFields): string {
  switch (type) {
    case 'text':
      return f.text ?? '';
    case 'url':
      return f.url ?? '';
    case 'wifi': {
      const enc = f.enc ?? 'WPA';
      const parts = [
        `T:${enc}`,
        `S:${wifiEscape(f.ssid ?? '')}`,
        ...(enc !== 'nopass' ? [`P:${wifiEscape(f.pass ?? '')}`] : []),
        ...(f.hidden ? ['H:true'] : [])
      ];
      return `WIFI:${parts.join(';')};;`;
    }
    case 'vcard': {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (f.name) lines.push(`FN:${textEscape(f.name)}`);
      if (f.org) lines.push(`ORG:${textEscape(f.org)}`);
      if (f.tel) lines.push(`TEL;TYPE=CELL:${textEscape(f.tel)}`);
      if (f.email) lines.push(`EMAIL:${textEscape(f.email)}`);
      if (f.vcardUrl) lines.push(`URL:${textEscape(f.vcardUrl)}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'event':
      return buildVevent(f);
    case 'tel':
      return `tel:${f.number ?? ''}`;
    case 'email': {
      const q = new URLSearchParams();
      if (f.subject) q.set('subject', f.subject);
      if (f.body) q.set('body', f.body);
      const qs = q.toString();
      return `mailto:${f.to ?? ''}${qs ? '?' + qs : ''}`;
    }
    case 'sms':
      return `SMSTO:${f.number ?? ''}:${f.msg ?? ''}`;
  }
}

/** 日期时间属性：纯日期用 VALUE=DATE 形式，日期时间用本地浮动时间 */
function dtProp(prop: 'DTSTART' | 'DTEND', v: string): string {
  return v.includes('T') ? `${prop}:${dtLocal(v)}` : `${prop};VALUE=DATE:${dtLocal(v)}`;
}

function buildVevent(f: PayloadFields): string {
  const lines = ['BEGIN:VEVENT'];
  if (f.summary) lines.push(`SUMMARY:${textEscape(f.summary)}`);
  if (f.start) lines.push(dtProp('DTSTART', f.start));
  if (f.end) lines.push(dtProp('DTEND', f.end));
  if (f.location) lines.push(`LOCATION:${textEscape(f.location)}`);
  if (f.desc) lines.push(`DESCRIPTION:${textEscape(f.desc)}`);
  lines.push('END:VEVENT');
  return lines.join('\n');
}

/** 扫描到 VEVENT 片段时包成完整 .ics */
export function wrapIcs(veventText: string): string {
  const body = /BEGIN:VCALENDAR/i.test(veventText)
    ? veventText
    : `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//QR Helper//EN\n${veventText}\nEND:VCALENDAR`;
  return body;
}

/* ===== 渲染（bwip-js） ===== */

export interface RenderOpts {
  bcid: Symbology;
  text: string;
  scale?: number;
  padding?: number;
  eclevel?: 'L' | 'M' | 'Q' | 'H';
}

/** EAN/UPC 校验位自动补全（用户少输一位时） */
export function autoCheckDigit(bcid: Symbology, text: string): string {
  const target: Partial<Record<Symbology, number>> = { ean13: 13, ean8: 8, upca: 12, upce: 8 };
  const len = target[bcid];
  if (!len) return text;
  const digits = text.replace(/\D/g, '');
  if (digits.length === len - 1) {
    // UPC-E 校验位须按展开后的 11 位 UPC-A 计算，直接对 7 位加权会算错
    const data = bcid === 'upce' ? upceToUpca11(digits) : digits;
    return digits + checkDigit(data);
  }
  return digits;
}

/**
 * UPC-E（NS + 6 位 abcdef）展开为 11 位 UPC-A 数据位（不含校验位），
 * GS1 零压缩逆规则（与 BWIPP upce 一致）：按尾位 f 分四段
 */
function upceToUpca11(d: string): string {
  const f = d.charCodeAt(6) - 48;
  if (f <= 2) return d.slice(0, 3) + d[6] + '0000' + d.slice(3, 6);
  if (f === 3) return d.slice(0, 4) + '00000' + d.slice(4, 6);
  if (f === 4) return d.slice(0, 5) + '00000' + d.slice(5, 6);
  return d.slice(0, 6) + '0000' + d[6];
}

function checkDigit(digits: string): string {
  let sum = 0;
  // 从右向左，第一位权重 3
  const d = digits.split('').reverse().map(Number);
  for (let i = 0; i < d.length; i++) sum += d[i] * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

const IS_2D: Record<string, boolean> = {
  qrcode: true, datamatrix: true, pdf417: true, azteccode: true
};

function bwipOptions(opts: RenderOpts, dark = false) {
  const text = autoCheckDigit(opts.bcid, opts.text);
  return {
    bcid: opts.bcid,
    text,
    scale: opts.scale ?? 4,
    padding: opts.padding ?? 2,
    barcolor: dark ? '#FFFFFF' : '#141A16',
    backgroundcolor: 'FFFFFF',
    includetext: !IS_2D[opts.bcid],
    textsize: 10,
    textcolor: dark ? '#FFFFFF' : '#141A16',
    ...(opts.bcid === 'qrcode' && opts.eclevel ? { eclevel: opts.eclevel } : {})
  };
}

/** 渲染到 canvas；内容非法时返回 false */
export async function renderToCanvas(canvas: HTMLCanvasElement, opts: RenderOpts): Promise<boolean> {
  const { toCanvas } = await import('bwip-js');
  try {
    toCanvas(canvas, bwipOptions(opts) as never);
    return true;
  } catch {
    return false;
  }
}

/** 生成 SVG 字符串；内容非法时返回 null */
export async function renderToSvg(opts: RenderOpts): Promise<string | null> {
  const { toSVG } = await import('bwip-js');
  try {
    return toSVG(bwipOptions(opts) as never);
  } catch {
    return null;
  }
}

/** PNG Blob；内容非法时返回 null。size 为目标边长，产物边长 ≈ size（±5%） */
export async function renderToPngBlob(opts: RenderOpts, size = 1024): Promise<Blob | null> {
  // 两遍渲染：第一遍 scale=1 探测模块尺寸，第二遍按目标边长定 scale
  const probe = document.createElement('canvas');
  const probed = await renderToCanvas(probe, { ...opts, scale: 1 });
  if (!probed) return null;
  const unit = Math.max(probe.width, probe.height, 1);
  const scale = Math.max(2, Math.floor(size / unit));
  const canvas = document.createElement('canvas');
  const ok = await renderToCanvas(canvas, { ...opts, scale });
  return ok ? new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png')) : null;
}
