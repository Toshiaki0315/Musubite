import { describe, expect, it } from 'vitest';
import type { FileEntry, ParsedDocument } from '../types';
import { basename, collectLowTextPages, fileListReducer, isSupportedFile } from './fileList';

const doc = (path: string, extra: Partial<ParsedDocument> = {}): ParsedDocument => ({
  name: basename(path),
  path,
  type: 'pdf',
  page_count: 1,
  sections: [],
  error: null,
  ...extra,
});

describe('helpers', () => {
  it('basename handles POSIX paths', () => {
    expect(basename('/Users/me/資料/deck.pptx')).toBe('deck.pptx');
    expect(basename('plain.txt')).toBe('plain.txt');
  });
  it('isSupportedFile checks extension case-insensitively', () => {
    expect(isSupportedFile('/a/B.PPTX')).toBe(true);
    expect(isSupportedFile('/a/b.markdown')).toBe(true);
    expect(isSupportedFile('/a/b.png')).toBe(false);
    expect(isSupportedFile('/a/noext')).toBe(false);
  });
});

describe('fileListReducer', () => {
  const start: FileEntry[] = [];

  it('adds supported files as pending and ignores duplicates/unsupported', () => {
    let s = fileListReducer(start, { type: 'add', paths: ['/x/a.pdf', '/x/b.png', '/x/a.pdf'] });
    s = fileListReducer(s, { type: 'add', paths: ['/x/a.pdf', '/x/c.md'] });
    expect(s.map((f) => [f.name, f.status])).toEqual([
      ['a.pdf', 'pending'],
      ['c.md', 'pending'],
    ]);
  });

  it('marks parsing, stores results and errors', () => {
    let s = fileListReducer(start, { type: 'add', paths: ['/a.pdf', '/b.pdf', '/c.pdf'] });
    s = fileListReducer(s, { type: 'parsing', paths: ['/a.pdf', '/b.pdf'] });
    expect(s.map((f) => f.status)).toEqual(['parsing', 'parsing', 'pending']);
    s = fileListReducer(s, {
      type: 'parsed',
      documents: [doc('/a.pdf'), doc('/b.pdf', { error: 'bad' }), doc('/zzz.pdf')],
    });
    expect(s[0]).toMatchObject({ status: 'ready', document: { path: '/a.pdf' } });
    expect(s[1]).toMatchObject({ status: 'error', error: 'bad' });
    s = fileListReducer(s, { type: 'failed', paths: ['/c.pdf'], error: 'sidecar down' });
    expect(s[2]).toMatchObject({ status: 'error', error: 'sidecar down' });
  });

  it('removes, moves and clears', () => {
    let s = fileListReducer(start, { type: 'add', paths: ['/a.md', '/b.md', '/c.md'] });
    s = fileListReducer(s, { type: 'move', path: '/c.md', offset: -2 });
    expect(s.map((f) => f.name)).toEqual(['c.md', 'a.md', 'b.md']);
    s = fileListReducer(s, { type: 'move', path: '/c.md', offset: -1 });
    expect(s.map((f) => f.name)).toEqual(['c.md', 'a.md', 'b.md']);
    s = fileListReducer(s, { type: 'move', path: '/missing', offset: 1 });
    expect(s.map((f) => f.name)).toEqual(['c.md', 'a.md', 'b.md']);
    s = fileListReducer(s, { type: 'remove', path: '/a.md' });
    expect(s.map((f) => f.name)).toEqual(['c.md', 'b.md']);
    expect(fileListReducer(s, { type: 'clear' })).toEqual([]);
  });
});

describe('collectLowTextPages', () => {
  it('lists low-text section indexes per document', () => {
    const d = doc('/d.pptx', {
      sections: [
        { index: 1, heading: 'S1', body: 'x', notes: null, low_text: false },
        { index: 2, heading: 'S2', body: '', notes: null, low_text: true },
        { index: 3, heading: 'S3', body: '', notes: null, low_text: true },
      ],
    });
    expect(collectLowTextPages([d, doc('/e.pdf')])).toEqual([{ name: 'd.pptx', pages: [2, 3] }]);
  });
});
