import type { ScanResult } from '../types';
import DecoderWorker from './decoder.worker?worker';

interface Pending {
  resolve: (r: ScanResult[]) => void;
  reject: (e: Error) => void;
}

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

  #ensure(): Promise<void> {
    if (this.#readyPromise) return this.#readyPromise;
    this.#readyPromise = new Promise<void>((resolve, reject) => {
      const worker = new DecoderWorker();
      this.#worker = worker;
      worker.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d.type === 'ready') {
          this.#ready = true;
          resolve();
        } else if (d.type === 'error') {
          reject(new Error(d.error));
        } else if (d.id !== undefined) {
          const p = this.#pending.get(d.id);
          if (!p) return;
          this.#pending.delete(d.id);
          if (d.ok) p.resolve(d.results as ScanResult[]);
          else p.reject(new Error(d.error));
        }
      };
      worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
    });
    return this.#readyPromise;
  }

  /** 解码一帧 ImageData */
  async decode(imageData: ImageData): Promise<ScanResult[]> {
    await this.#ensure();
    const id = this.#nextId++;
    return new Promise<ScanResult[]>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker!.postMessage({
        id,
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
      });
    });
  }

  terminate() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#ready = false;
    this.#readyPromise = null;
    this.#pending.clear();
  }
}

export const decoder = new Decoder();
