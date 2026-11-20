// 端到端往返测试：payloads 构建 → bwip-js 渲染 PNG → zxing-wasm 解码 → 文本一致
// 运行：node tools/test-roundtrip.mjs（无需浏览器）
import bwip from 'bwip-js';
import { readBarcodes } from 'zxing-wasm/reader';
import { buildPayload, autoCheckDigit, wrapIcs } from '../src/lib/payloads.ts';
import { detect, parseWifi } from '../src/lib/actions.ts';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

async function roundTrip(name, bcid, text, expectText = text, acceptable = null) {
  try {
    const png = await bwip.toBuffer({ bcid, text, scale: 3, padding: 2, includetext: false, barcolor: '141A16', backgroundcolor: 'FFFFFF' });
    const results = await readBarcodes(new Uint8Array(png), { maxNumberOfSymbols: 1, tryHarder: true });
    const texts = results.map((r) => r.text);
    const exp = acceptable ?? [expectText];
    if (texts.length === 1 && exp.includes(texts[0])) pass++;
    else {
      fail++;
      console.error(`FAIL ${name} actual=${JSON.stringify(texts)} expected one of ${JSON.stringify(exp)}`);
    }
  } catch (e) {
    fail++;
    console.error(`FAIL ${name} (throw) ${e.message}`);
  }
}

// ---- payload 构建 ----
check('wifi 转义', buildPayload('wifi', { ssid: 'a;b:c,d"e', pass: 'p\\ass', enc: 'WPA' }), 'WIFI:T:WPA;S:a\\;b\\:c\\,d\\"e;P:p\\\\ass;;');
check('wifi nopass', buildPayload('wifi', { ssid: 'open', enc: 'nopass' }), 'WIFI:T:nopass;S:open;;');
check('wifi hidden', buildPayload('wifi', { ssid: 'h', pass: 'x', enc: 'WPA', hidden: true }), 'WIFI:T:WPA;S:h;P:x;H:true;;');
check('vcard', buildPayload('vcard', { name: '张三', tel: '13800138000', email: 'a@b.c' }), 'BEGIN:VCARD\nVERSION:3.0\nFN:张三\nTEL;TYPE=CELL:13800138000\nEMAIL:a@b.c\nEND:VCARD');
check('event dt', buildPayload('event', { summary: '会议', start: '2026-01-01T09:00' }), 'BEGIN:VEVENT\nSUMMARY:会议\nDTSTART:20260101T090000\nEND:VEVENT');
check('tel', buildPayload('tel', { number: '10086' }), 'tel:10086');
check('email', buildPayload('email', { to: 'a@b.c', subject: 'hi' }), 'mailto:a@b.c?subject=hi');
check('sms', buildPayload('sms', { number: '10086', msg: 'ye' }), 'SMSTO:10086:ye');
check('wrapIcs', wrapIcs('BEGIN:VEVENT\nEND:VEVENT').includes('VCALENDAR'), true);
check('vcard 转义', buildPayload('vcard', { name: '张;三,李\\四', org: 'A;B', tel: '123', email: 'a@b.c' }),
  'BEGIN:VCARD\nVERSION:3.0\nFN:张\\;三\\,李\\\\四\nORG:A\\;B\nTEL;TYPE=CELL:123\nEMAIL:a@b.c\nEND:VCARD');
check('event 转义', buildPayload('event', { summary: 'a;b,c', location: 'x\\y', desc: 'l1\nl2' }),
  'BEGIN:VEVENT\nSUMMARY:a\\;b\\,c\nLOCATION:x\\\\y\nDESCRIPTION:l1\\nl2\nEND:VEVENT');
check('event 纯日期', buildPayload('event', { summary: 'x', start: '2026-01-01' }),
  'BEGIN:VEVENT\nSUMMARY:x\nDTSTART;VALUE=DATE:20260101\nEND:VEVENT');

// ---- 校验位 ----
check('ean13 补校验位', autoCheckDigit('ean13', '590123412345').length, 13);
check('ean13 已满不动', autoCheckDigit('ean13', '5901234123457'), '5901234123457');
check('qrcode 不处理', autoCheckDigit('qrcode', 'abc'), 'abc');
check('ean13 校验位值', autoCheckDigit('ean13', '590123412345'), '5901234123457');
check('ean8 校验位值', autoCheckDigit('ean8', '9638507'), '96385074');
check('upca 校验位值', autoCheckDigit('upca', '03600029145'), '036000291452');
check('upce 已满不动', autoCheckDigit('upce', '01234505'), '01234505');

// ---- 往返（bwip 渲染 → zxing 解码） ----
await roundTrip('QR 中文 UTF-8', 'qrcode', '你好，QR Helper！测试 🎉');
await roundTrip('QR wifi', 'qrcode', buildPayload('wifi', { ssid: 'MyNet', pass: 's3cr;t', enc: 'WPA' }));
await roundTrip('QR vcard', 'qrcode', buildPayload('vcard', { name: '李四', org: 'ACME', tel: '123' }));
await roundTrip('QR 长文本', 'qrcode', 'x'.repeat(400));
await roundTrip('Code128', 'code128', 'QR-Helper-2026');
await roundTrip('Code39', 'code39', 'ABC-123');
await roundTrip('EAN-13', 'ean13', autoCheckDigit('ean13', '590123412345'));
await roundTrip('EAN-8', 'ean8', autoCheckDigit('ean8', '5901234'));
await roundTrip('UPC-A', 'upca', autoCheckDigit('upca', '12345678901'), '123456789012', ['123456789012', '0123456789012']);
await roundTrip('DataMatrix', 'datamatrix', 'DM-TEST-42');
await roundTrip('PDF417', 'pdf417', 'PDF417 payload');
await roundTrip('Aztec', 'azteccode', 'AZTEC payload');

// 反色二维码
{
  const png = await bwip.toBuffer({ bcid: 'qrcode', text: 'inverted', scale: 3, padding: 2, barcolor: 'FFFFFF', backgroundcolor: '000000' });
  const results = await readBarcodes(new Uint8Array(png), { maxNumberOfSymbols: 1, tryHarder: true });
  check('QR 反色', results.map((r) => r.text), ['inverted']);
}

// ---- UPC-E 校验位 20 组（bwip 7 位自算 vs autoCheckDigit 8 位） ----
for (const ns of ['0', '1']) {
  for (let f = 0; f <= 9; f++) {
    const t = ns + '12345' + f;
    const name = `upce 校验位 ns=${ns} f=${f}`;
    const mine = autoCheckDigit('upce', t);
    let expect;
    try {
      const png = await bwip.toBuffer({ bcid: 'upce', text: t, scale: 3, padding: 2, includetext: false, barcolor: '141A16', backgroundcolor: 'FFFFFF' });
      const rs = await readBarcodes(new Uint8Array(png), { maxNumberOfSymbols: 1, tryHarder: true });
      // zxing 返回 8 位 UPC-E 或展开的 12/13 位形式，末位即 bwip 自算的校验位
      expect = rs.length ? t + rs[0].text.slice(-1) : `(解码失败 ${JSON.stringify(rs)})`;
    } catch (e) {
      expect = `(渲染异常 ${e.message})`;
    }
    check(name, mine, expect);
    // 回灌 8 位（含校验位）给 bwip 二次校验：校验位错会抛 badCheckDigit
    let reflowOk = true;
    try {
      await bwip.toBuffer({ bcid: 'upce', text: mine, scale: 3, padding: 2, includetext: false, barcolor: '141A16', backgroundcolor: 'FFFFFF' });
    } catch {
      reflowOk = false;
    }
    check(`${name} 回灌`, reflowOk, true);
  }
}

// ---- 动作识别 ----
check('detect url', detect('https://example.com/a?b=1').category, 'url');
check('detect www', detect('www.example.com').category, 'url');
check('detect wifi', detect('WIFI:T:WPA;S:n;P:p;;').category, 'wifi');
check('detect vcard', detect('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD').category, 'vcard');
check('detect event', detect('BEGIN:VEVENT\nSUMMARY:x\nEND:VEVENT').category, 'event');
check('detect tel', detect('tel:+8613800138000').category, 'tel');
check('detect mailto', detect('mailto:a@b.c').category, 'email');
check('detect sms', detect('SMSTO:10086:hi').category, 'sms');
check('detect geo', detect('geo:39.9,116.4').category, 'geo');
check('detect otpauth', detect('otpauth://totp/x?secret=1').category, 'otpauth');
check('detect text', detect('随便一段文本').category, 'text');
check('parseWifi', parseWifi('WIFI:T:WPA;S:My\\;Net;P:p\\:w;;'), { enc: 'WPA', ssid: 'My;Net', pass: 'p:w' });
check('mailto body 含 ?', detect('mailto:a@b.c?subject=hi&body=what?ever').fields.body, 'what?ever');
check('mailto 地址解码', detect('mailto:a%40b.c?subject=s%20t').fields, { to: 'a@b.c', subject: 's t', body: '' });

// ---- 反序列化校验（localStorage 桩 + 动态导入 history/settings） ----
const backing = new Map([
  ['qrhelper.history', JSON.stringify([
    { id: 'ok1', ts: 1700000000000, format: 'QRCode', text: 'hello', source: 'scan' },
    { text: 42 },                                                    // text 非字符串 → 丢弃
    { id: 'b1', ts: 'bad', format: 'QRCode', text: 'bad-ts', source: 'scan' }, // ts 非法 → 丢弃
    { id: 'b2', ts: Infinity, format: 'QRCode', text: 'inf-ts', source: 'scan' }, // ts 非有限 → 丢弃
    { id: 'f1', ts: 1, format: 'Bogus', text: 'bad-fmt', source: 'scan' },   // format 回落 Unknown
    { id: 'f2', ts: 2, format: 'QRCode', text: 'bad-src', source: 'hack' },  // source 回落 scan
    { id: '', ts: 3, format: 'QRCode', text: 'gen-id', source: 'scan' },     // id 回落生成
    { id: 'e1', ts: 4, format: 'QRCode', text: '', source: 'scan' }          // 空文本 → 丢弃
  ])],
  ['qrhelper.settings', JSON.stringify({ theme: 999, accent: 'xxx', sound: 1, vibrate: 'yes', autoCamera: 0, lang: 'klingon', is2d: 5 })],
  ['qrhelper.settings.v', '2']
]);
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k)
};
const { csvEsc, history } = await import('../src/lib/history.ts');
const { settings } = await import('../src/lib/settings.ts');
const { get } = await import('svelte/store');

check('history 白名单校验', get(history).map((x) => [x.text, x.ts, x.format, x.source]), [
  ['hello', 1700000000000, 'QRCode', 'scan'],
  ['bad-fmt', 1, 'Unknown', 'scan'],
  ['bad-src', 2, 'QRCode', 'scan'],
  ['gen-id', 3, 'QRCode', 'scan']
]);
check('history id 回落生成', get(history).every((x) => typeof x.id === 'string' && x.id.length > 0), true);
check('settings 白名单校验', get(settings), { theme: 'system', accent: 'slate', sound: true, vibrate: true, autoCamera: true, lang: 'auto' });

// ---- CSV 公式注入转义 ----
check('csv esc @ 前缀', csvEsc('@SUM(A1)'), '"\'@SUM(A1)"');
check('csv esc = 前缀', csvEsc('=1+1'), '"\'=1+1"');
check('csv esc 空白前缀', csvEsc('\tcmd'), '"\'\tcmd"');
check('csv esc 普通值', csvEsc('ok, "q"'), '"ok, ""q"""');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
