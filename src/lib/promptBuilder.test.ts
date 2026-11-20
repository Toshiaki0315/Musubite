import { describe, expect, it } from 'vitest';
import type { ParsedDocument } from '../types';
import {
  buildContext,
  compressWhitespace,
  escapeXmlAttr,
  renderDocument,
} from './promptBuilder';

const pptx: ParsedDocument = {
  name: 'deck "A".pptx',
  path: '/tmp/deck.pptx',
  type: 'pptx',
  page_count: 2,
  sections: [
    { index: 1, heading: 'Slide 1: 概要', body: '- 項目', notes: '強調する', low_text: false },
    { index: 2, heading: 'Slide 2', body: '', notes: null, low_text: true },
  ],
  error: null,
};

const md: ParsedDocument = {
  name: 'memo.md',
  path: '/tmp/memo.md',
  type: 'md',
  page_count: null,
  sections: [{ index: 1, heading: null, body: '# メモ', notes: null, low_text: false }],
  error: null,
};

const broken: ParsedDocument = { ...md, name: 'broken.pdf', type: 'pdf', sections: [], error: 'x' };

const defaults = { excludeNotes: false, compressWhitespace: false };

describe('escapeXmlAttr', () => {
  it('escapes XML special characters', () => {
    expect(escapeXmlAttr(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });
});

describe('compressWhitespace', () => {
  it('collapses 3+ newlines into a single blank line', () => {
    expect(compressWhitespace('a\n\n\n\nb')).toBe('a\n\nb');
  });
  it('strips trailing spaces and collapses inner runs but keeps indentation', () => {
    expect(compressWhitespace('  - a    b　　c   \n')).toBe('  - a b c');
  });
  it('normalizes CRLF', () => {
    expect(compressWhitespace('a\r\n\r\n\r\nb')).toBe('a\n\nb');
  });
});

describe('renderDocument', () => {
  it('renders sections with headings, notes and escaped attributes', () => {
    const out = renderDocument(pptx, defaults);
    expect(out).toBe(
      [
        '<document name="deck &quot;A&quot;.pptx" type="pptx" pages="2">',
        '## Slide 1: 概要',
        '',
        '- 項目',
        '',
        '### Speaker Notes',
        '',
        '強調する',
        '',
        '## Slide 2',
        '</document>',
      ].join('\n'),
    );
  });

  it('omits speaker notes when excluded', () => {
    expect(renderDocument(pptx, { ...defaults, excludeNotes: true })).not.toContain('Speaker Notes');
  });

  it('omits pages attribute and heading for plain text documents', () => {
    expect(renderDocument(md, defaults)).toBe('<document name="memo.md" type="md">\n# メモ\n</document>');
  });

  it('applies whitespace compression to the body', () => {
    const doc = { ...md, sections: [{ ...md.sections[0]!, body: 'a\n\n\n\nb   c' }] };
    expect(renderDocument(doc, { ...defaults, compressWhitespace: true })).toContain('a\n\nb c');
  });
});

describe('buildContext', () => {
  it('assembles instruction, hearing notes and reference materials in order', () => {
    const out = buildContext({
      instruction: '  提案書を作成してください  ',
      hearingNotes: '課題: 手作業\n',
      documents: [pptx, md],
      options: defaults,
    });
    const iInstr = out.indexOf('提案書を作成してください');
    const iNotes = out.indexOf('<hearing_notes>\n課題: 手作業\n</hearing_notes>');
    const iRefs = out.indexOf('<reference_materials>');
    expect(iInstr).toBe(0);
    expect(iNotes).toBeGreaterThan(iInstr);
    expect(iRefs).toBeGreaterThan(iNotes);
    expect(out).toContain('</document>\n\n<document name="memo.md"');
    expect(out.endsWith('</reference_materials>')).toBe(true);
  });

  it('wraps the instruction in <instructions> when requested', () => {
    const out = buildContext({
      instruction: 'do it',
      hearingNotes: '',
      documents: [],
      options: defaults,
      wrapInstruction: true,
    });
    expect(out).toBe('<instructions>\ndo it\n</instructions>');
  });

  it('skips empty sections and documents with errors', () => {
    const out = buildContext({ instruction: ' ', hearingNotes: '\n', documents: [broken], options: defaults });
    expect(out).toBe('');
  });
});
