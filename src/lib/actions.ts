export type ActionCategory =
  | 'url'
  | 'wifi'
  | 'vcard'
  | 'event'
  | 'tel'
  | 'email'
  | 'sms'
  | 'geo'
  | 'otpauth'
  | 'text';

export interface Detected {
  category: ActionCategory;
  url?: string; // 可直接打开的 href
  fields: Record<string, string>;
}

/** 智能动作映射：识别文本类型 → 结构化结果（对齐 Atharok 动作集） */
export function detect(text: string): Detected {
  const t = text.trim();

  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) {
    return { category: 'url', url: /^https?:\/\//i.test(t) ? t : `https://${t}`, fields: {} };
  }
  if (/^WIFI:/i.test(t)) return { category: 'wifi', fields: parseWifi(t) };
  if (/^BEGIN:VCARD/i.test(t)) return { category: 'vcard', fields: parsePropBlock(t) };
  if (/^BEGIN:VEVENT/i.test(t) || /^BEGIN:VCALENDAR/i.test(t)) {
    return { category: 'event', fields: parsePropBlock(t) };
  }
  if (/^tel:/i.test(t)) return { category: 'tel', url: t, fields: { number: t.slice(4) } };
  if (/^mailto:/i.test(t)) {
    const m = t.slice(7);
    const [addr, query] = m.split('?');
    const q = new URLSearchParams(query ?? '');
    return {
      category: 'email',
      url: t,
      fields: { to: addr, subject: q.get('subject') ?? '', body: q.get('body') ?? '' }
    };
  }
  if (/^(sms|smsto):/i.test(t)) {
    const body = t.replace(/^(sms|smsto):/i, '');
    const [num, msg] = body.split(/:(.*)/s);
    return {
      category: 'sms',
      url: `sms:${num ?? ''}${msg ? '?body=' + encodeURIComponent(msg) : ''}`,
      fields: { number: num ?? '', msg: msg ?? '' }
    };
  }
  if (/^geo:/i.test(t)) return { category: 'geo', url: t, fields: {} };
  if (/^otpauth:\/\//i.test(t)) return { category: 'otpauth', fields: { raw: t } };
  return { category: 'text', fields: { raw: t } };
}

export function parseWifi(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  // 解析 T:..;S:..;P:..;H:..;; （值内 \; , \\ 转义）
  const body = text.replace(/^WIFI:/i, '');
  const re = /([TSPH]):((?:\\.|[^;\\])*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const key = m[1].toUpperCase();
    const val = m[2].replace(/\\(.)/g, '$1');
    if (key === 'T') out.enc = val;
    if (key === 'S') out.ssid = val;
    if (key === 'P') out.pass = val;
    if (key === 'H') out.hidden = val;
  }
  return out;
}

/** 解析 vCard / VEVENT 行块为字段表 */
function parsePropBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(';')[0].toUpperCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'FN' || key === 'SUMMARY') out.name = val;
    if (key === 'SUMMARY') out.summary = val;
    if (key === 'ORG') out.org = val;
    if (key === 'TEL') out.tel = val;
    if (key === 'EMAIL') out.email = val;
    if (key === 'URL') out.url = val;
    if (key === 'DTSTART') out.start = val;
    if (key === 'DTEND') out.end = val;
    if (key === 'LOCATION') out.location = val;
    if (key === 'DESCRIPTION') out.desc = val.replace(/\\n/g, '\n');
  }
  return out;
}
