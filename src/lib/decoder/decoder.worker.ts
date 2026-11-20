import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { ScanFormat } from '../types';

export interface DecodeReq {
  id: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DecodeRes {
  id: number;
  ok: boolean;
  results?: { text: string; format: ScanFormat }[];
  error?: string;
}

/**
 * ScanFormat 白名单：zxing-wasm 返回 canonical enum（"QRCode"/"Code128"/"EAN13" 等），
 * 与 types.ts 的 ScanFormat 联合一一对应，不做连字符映射。
 * MicroQRCode/DataBar 等联合外的值不透传，统一归一为 'Unknown'。
 * 注：UPC-A 实际解码为 format="EAN13" + 13 位补零文本；'UPCA' 仅供生成端存档使用。
 */
const KNOWN_FORMATS: ReadonlySet<string> = new Set<ScanFormat>([
  'QRCode',
  'DataMatrix',
  'PDF417',
  'Aztec',
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'Code128',
  'Code39',
  'Code93',
  'Codabar',
  'ITF',
  'Unknown'
]);

function normalizeFormat(format: string): ScanFormat {
  return KNOWN_FORMATS.has(format) ? (format as ScanFormat) : 'Unknown';
}

// 零网络约束：WASM 走本地打包 URL，覆盖默认的 jsDelivr CDN locateFile
prepareZXingModule({
  overrides: { locateFile: () => wasmUrl },
  fireImmediately: true
})
  .then(() => postMessage({ type: 'ready' }))
  .catch((e) => postMessage({ type: 'error', error: String(e) }));

onmessage = async (e: MessageEvent<DecodeReq>) => {
  const { id, width, height, data } = e.data;
  try {
    const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
    const results = await readBarcodes(imageData, {
      maxNumberOfSymbols: 1,
      tryHarder: true
    });
    const res: DecodeRes = {
      id,
      ok: true,
      results: results.map((r) => ({ text: r.text, format: normalizeFormat(r.format) }))
    };
    postMessage(res);
  } catch (err) {
    const res: DecodeRes = { id, ok: false, error: String(err) };
    postMessage(res);
  }
};
