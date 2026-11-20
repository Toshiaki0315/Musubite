interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function HearingInput({ value, onChange }: Props) {
  return (
    <label className="flex min-h-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-stone-500">ヒアリングメモ</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="お客様の課題・要望・予算・スケジュールなどを入力またはペースト"
        className="min-h-32 flex-1 resize-none rounded-lg border border-stone-300 bg-white p-3 text-sm leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-stone-600 dark:bg-stone-800"
      />
    </label>
  );
}
