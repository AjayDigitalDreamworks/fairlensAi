import { useSyncExternalStore, type ReactNode } from "react";

type ToastItem = {
  id: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return { toasts };
}

export function toast(input: Omit<ToastItem, "id">) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
  const next: ToastItem = {
    ...input,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss(id);
    },
  };
  toasts = [next, ...toasts].slice(0, 5);
  emit();
  return { id, dismiss: () => dismiss(id) };
}

export function dismiss(id?: string) {
  toasts = id ? toasts.filter((item) => item.id !== id) : [];
  emit();
}

export function useToast() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
