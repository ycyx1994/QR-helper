import { writable } from 'svelte/store';

export const toast = writable<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, ms = 2200) {
  toast.set(msg);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => toast.set(null), ms);
}
