import type { BuildOptions, ParsedDocument, Section } from '../types';

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Collapse runs of blank lines / spaces while preserving leading indentation (bullet levels). */
export function compressWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      return indent + line.slice(indent.length).replace(/[ \t　]+/g, ' ').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

function renderSection(section: Section, options: BuildOptions): string {
  const parts: string[] = [];
  if (section.heading) parts.push(`## ${section.heading}`);
  if (section.body.trim()) parts.push(section.body.trim());
  if (section.notes && !options.excludeNotes) {
    parts.push('### Speaker Notes', section.notes.trim());
  }
  return parts.join('\n\n');
}

export function renderDocument(doc: ParsedDocument, options: BuildOptions): string {
  const attrs = [`name="${escapeXmlAttr(doc.name)}"`, `type="${escapeXmlAttr(doc.type)}"`];
  if (doc.page_count !== null) attrs.push(`pages="${doc.page_count}"`);

  let body = doc.sections
    .map((s) => renderSection(s, options))
    .filter((s) => s.length > 0)
    .join('\n\n');
  if (options.compressWhitespace) body = compressWhitespace(body);

  return `<document ${attrs.join(' ')}>\n${body}\n</document>`;
}

export interface BuildContextInput {
  instruction: string;
  hearingNotes: string;
  documents: ParsedDocument[];
  options: BuildOptions;
  /** Wrap the template text in <instructions> tags. */
  wrapInstruction?: boolean;
}

/** Combine template, hearing notes and parsed documents into the clipboard payload. */
export function buildContext({
  instruction,
  hearingNotes,
  documents,
  options,
  wrapInstruction = false,
}: BuildContextInput): string {
  const blocks: string[] = [];

  const instr = instruction.trim();
  if (instr) blocks.push(wrapInstruction ? `<instructions>\n${instr}\n</instructions>` : instr);

  const notes = hearingNotes.trim();
  if (notes) blocks.push(`<hearing_notes>\n${notes}\n</hearing_notes>`);

  const rendered = documents.filter((d) => d.error === null).map((d) => renderDocument(d, options));
  if (rendered.length > 0) {
    blocks.push(`<reference_materials>\n${rendered.join('\n\n')}\n</reference_materials>`);
  }

  return blocks.join('\n\n');
}
