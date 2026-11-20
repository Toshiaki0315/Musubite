import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'info' | 'error';
  text: string;
}

const KIND_CLASS: Record<ToastMessage['kind'], string> = {
  success: 'bg-emerald-600',
  info: 'bg-stone-700',
  error: 'bg-red-600',
};

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.kind === 'error' ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className={`fixed right-4 bottom-24 left-4 z-50 mx-auto max-w-lg rounded-lg px-4 py-3 text-sm text-white shadow-lg ${KIND_CLASS[toast.kind]}`}
      onClick={onDismiss}
    >
      {toast.text}
    </div>
  );
}
