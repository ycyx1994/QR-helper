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

// ---- 校验位 ----
check('ean13 补校验位', autoCheckDigit('ean13', '590123412345').length, 13);
check('ean13 已满不动', autoCheckDigit('ean13', '5901234123457'), '5901234123457');
check('qrcode 不处理', autoCheckDigit('qrcode', 'abc'), 'abc');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
