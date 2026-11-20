import type { FileEntry } from '../types';

interface Props {
  files: FileEntry[];
  onRemove: (path: string) => void;
  onMove: (path: string, offset: number) => void;
  onClear: () => void;
}

const STATUS_LABEL: Record<FileEntry['status'], string> = {
  pending: '待機中',
  parsing: '解析中…',
  ready: '完了',
  error: 'エラー',
};

const STATUS_CLASS: Record<FileEntry['status'], string> = {
  pending: 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  parsing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
};

function detail(file: FileEntry): string {
  if (file.status === 'error') return file.error ?? '';
  const doc = file.document;
  if (!doc) return '';
  const unit = doc.type === 'pptx' ? 'スライド' : 'ページ';
  return doc.page_count !== null ? `${doc.page_count} ${unit}` : doc.type.toUpperCase();
}

const iconBtn =
  'rounded px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-stone-700';

export function FileList({ files, onRemove, onMove, onClear }: Props) {
  if (files.length === 0) {
    return <p className="py-4 text-center text-xs text-stone-400">資料はまだ登録されていません</p>;
  }
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{files.length} 件の資料</span>
        <button type="button" onClick={onClear} className="hover:text-accent">
          すべてクリア
        </button>
      </div>
      <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {files.map((file, i) => (
          <li
            key={file.path}
            className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-stone-800"
            title={file.path}
          >
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[file.status]}`}
            >
              {STATUS_LABEL[file.status]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{file.name}</p>
              <p
                className={`truncate text-[11px] ${file.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}
              >
                {detail(file)}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                aria-label={`${file.name} を上へ`}
                className={iconBtn}
                disabled={i === 0}
                onClick={() => onMove(file.path, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`${file.name} を下へ`}
                className={iconBtn}
                disabled={i === files.length - 1}
                onClick={() => onMove(file.path, 1)}
              >
                ▼
              </button>
              <button
                type="button"
                aria-label={`${file.name} を削除`}
                className={`${iconBtn} hover:text-red-600`}
                onClick={() => onRemove(file.path)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
