import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface DecodeReq {
  id: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DecodeRes {
  id: number;
  ok: boolean;
  results?: { text: string; format: string }[];
  error?: string;
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
      results: results.map((r) => ({ text: r.text, format: r.format }))
    };
    postMessage(res);
  } catch (err) {
    const res: DecodeRes = { id, ok: false, error: String(err) };
    postMessage(res);
  }
};
