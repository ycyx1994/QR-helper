import type { ScanResult } from '../types';
import DecoderWorker from './decoder.worker?worker';

interface Pending {
  resolve: (r: ScanResult[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** decode 单次请求超时兜底（毫秒） */
const DECODE_TIMEOUT_MS = 10_000;

/** 解码器封装：主线程 ↔ Web Worker（zxing-wasm） */
export class Decoder {
  #worker: Worker | null = null;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #ready = false;
  #readyPromise: Promise<void> | null = null;

  get ready() {
    return this.#ready;
  }

  /** 预热 Worker + WASM */
  warm(): Promise<void> {
    return this.#ensure();
  }

  /** reject 全部在途请求并清空 */
  #rejectAll(reason: Error) {
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(reason);
    }
    this.#pending.clear();
  }

  /** 销毁 worker、reject 在途请求、重置 readyPromise（下次 ensure/decode 自动重建） */
  #teardown(reason: Error) {
    this.#rejectAll(reason);
    const w = this.#worker;
    this.#worker = null;
    this.#ready = false;
    this.#readyPromise = null;
    w?.terminate();
  }

  #ensure(): Promise<void> {
    if (this.#readyPromise) return this.#readyPromise;
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      // 初始化失败 / 运行期崩溃：统一销毁重建，让重试成为可能
      const fail = (msg: string) => {
        this.#teardown(new Error(msg));
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };
      let worker: Worker;
      try {
        worker = new DecoderWorker();
      } catch (e) {
        fail(String(e));
        return;
      }
      this.#worker = worker;
      worker.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === 'ready') {
          this.#ready = true;
          settled = true;
          resolve();
        } else if (d.type === 'error') {
          fail(String(d.error));
        } else if (d.id !== undefined) {
          const p = this.#pending.get(d.id);
          if (!p) return;
          this.#pending.delete(d.id);
          clearTimeout(p.timer);
          if (d.ok) p.resolve(d.results as ScanResult[]);
          else p.reject(new Error(d.error));
        }
      };
      worker.onerror = (e) => fail(e.message || 'worker error');
      worker.onmessageerror = () => fail('worker messageerror');
    });
    this.#readyPromise = promise;
    // 初始化失败不缓存 rejected promise（含同步抛错路径），下次 decode/ensure 可重建重试
    promise.catch(() => {
      if (this.#readyPromise === promise) this.#readyPromise = null;
    });
    return promise;
  }

  /** 解码一帧 ImageData */
  async decode(imageData: ImageData): Promise<ScanResult[]> {
    await this.#ensure();
    const id = this.#nextId++;
    return new Promise<ScanResult[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        // 超时兜底：从 pending 移除并 reject
        if (this.#pending.delete(id)) reject(new Error('decoder timeout'));
      }, DECODE_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      const w = this.#worker;
      if (!w) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new Error('decoder terminated'));
        return;
      }
      try {
        w.postMessage({
          id,
          width: imageData.width,
          height: imageData.height,
          data: new Uint8ClampedArray(imageData.data)
        });
      } catch (e) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  terminate() {
    // 先 reject 全部在途请求再销毁，保证 Promise 不会永久挂起；readyPromise 置空后可重建
    this.#teardown(new Error('decoder terminated'));
  }
}

export const decoder = new Decoder();
