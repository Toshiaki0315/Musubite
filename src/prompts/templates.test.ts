import { describe, expect, it } from 'vitest';
import { CUSTOM_TEMPLATE_ID, DEFAULT_TEMPLATES, findTemplate, resolveInstruction } from './templates';

describe('templates', () => {
  it('have unique ids and include a custom template', () => {
    const ids = DEFAULT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(CUSTOM_TEMPLATE_ID);
  });

  it('reference the XML tags used by the prompt builder', () => {
    for (const t of DEFAULT_TEMPLATES.filter((t) => t.id !== CUSTOM_TEMPLATE_ID)) {
      expect(t.systemInstruction).toContain('<hearing_notes>');
      expect(t.systemInstruction).toContain('<reference_materials>');
    }
  });

  it('findTemplate falls back to the first template', () => {
    expect(findTemplate('requirements-summary').id).toBe('requirements-summary');
    expect(findTemplate('unknown').id).toBe(DEFAULT_TEMPLATES[0]?.id);
  });

  it('resolveInstruction prefers overrides, including empty strings', () => {
    expect(resolveInstruction('proposal-draft', {})).toContain('ソリューションアーキテクト');
    expect(resolveInstruction('proposal-draft', { 'proposal-draft': '独自' })).toBe('独自');
    expect(resolveInstruction('proposal-draft', { 'proposal-draft': '' })).toBe('');
  });
});
