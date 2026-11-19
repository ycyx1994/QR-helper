import { writable } from 'svelte/store';

/**
 * 跨视图传递粘贴的图片文件（PC 全局 Ctrl+V → 扫码页识别）。
 * App 捕获后写入并跳转扫码页；ScanView 挂载时消费并清空。
 */
export const pendingImage = writable<File | null>(null);
