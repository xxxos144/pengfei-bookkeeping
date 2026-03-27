// Global toast notification system

import type { ToastType } from '../types';

type ToastCallback = (message: string, type: ToastType, onConfirm?: () => void, onCancel?: () => void) => void;

let toastHandler: ToastCallback | null = null;

export function registerToastHandler(handler: ToastCallback): void {
  toastHandler = handler;
}

export function toast(message: string, type: ToastType = 'info'): void {
  toastHandler?.(message, type);
}

export function toastConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    toastHandler?.(
      message,
      'confirm',
      () => resolve(true),
      () => resolve(false)
    );
  });
}
