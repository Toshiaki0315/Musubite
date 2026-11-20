import { DEFAULT_TEMPLATES, findTemplate } from '../prompts/templates';

interface Props {
  templateId: string;
  instruction: string;
  modified: boolean;
  onSelect: (id: string) => void;
  onChange: (instruction: string) => void;
  onReset: () => void;
}

export function TemplateSelector({ templateId, instruction, modified, onSelect, onChange, onReset }: Props) {
  const template = findTemplate(templateId);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-stone-500">プロンプトテンプレート</span>
        {modified && (
          <button type="button" onClick={onReset} className="text-xs text-stone-500 hover:text-accent">
            既定に戻す
          </button>
        )}
      </div>
      <select
        value={template.id}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="プロンプトテンプレート"
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent dark:border-stone-600 dark:bg-stone-800"
      >
        {DEFAULT_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-stone-400">{template.description}</p>
      <textarea
        value={instruction}
        onChange={(e) => onChange(e.target.value)}
        aria-label="指示文"
        placeholder="Claude への指示を自由に記述してください"
        rows={7}
        className="resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-stone-600 dark:bg-stone-800"
      />
    </div>
  );
}
