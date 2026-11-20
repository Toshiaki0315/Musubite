import type { LowTextSummary } from '../lib/fileList';

export function LowTextAlert({ items }: { items: LowTextSummary[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold">画像主体のページがあります</p>
      <p className="mt-0.5">テキストがほとんど抽出できませんでした。Claude Desktop へ元ファイルや画像を直接ドロップすることをおすすめします。</p>
      <ul className="mt-1.5 list-disc pl-4">
        {items.map((item) => (
          <li key={item.name}>
            {item.name}: {item.pages.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
