interface Props {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: Props) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
      </span>
    </label>
  );
}
