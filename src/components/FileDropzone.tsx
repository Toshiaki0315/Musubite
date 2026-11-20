import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useState } from 'react';

interface Props {
  onPaths: (paths: string[]) => void;
  onPick: () => void;
}

export function FileDropzone({ onPaths, onPick }: Props) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { payload } = event;
        if (payload.type === 'enter' || payload.type === 'over') setHover(true);
        else if (payload.type === 'leave') setHover(false);
        else if (payload.type === 'drop') {
          setHover(false);
          if (payload.paths.length) onPaths(payload.paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onPaths]);

  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
        hover
          ? 'border-accent bg-accent-soft text-accent dark:bg-accent/20'
          : 'border-stone-300 text-stone-500 hover:border-stone-400 hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800'
      }`}
    >
      <span className="text-sm font-semibold">ここにファイル・フォルダをドロップ</span>
      <span className="text-xs">またはクリックして選択（.pptx / .pdf / .md / .txt / .csv）</span>
    </button>
  );
}
