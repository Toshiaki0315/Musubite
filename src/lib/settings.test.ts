import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from './settings';

describe('parseSettings', () => {
  it('returns defaults for missing, invalid or non-object JSON', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and drops malformed ones', () => {
    const parsed = parseSettings(
      JSON.stringify({
        templateId: 'custom',
        templateOverrides: { custom: '指示', bad: 3 },
        options: { excludeNotes: true, compressWhitespace: 'yes' },
        autoPaste: true,
        recursiveFolders: 'no',
      }),
    );
    expect(parsed).toEqual({
      templateId: 'custom',
      templateOverrides: { custom: '指示' },
      options: { excludeNotes: true, compressWhitespace: false },
      autoPaste: true,
      recursiveFolders: true,
    });
  });

  it('tolerates wrong-typed nested objects', () => {
    const parsed = parseSettings(JSON.stringify({ templateId: 1, templateOverrides: 'x', options: null }));
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });
});

describe('load/save', () => {
  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const s = { ...DEFAULT_SETTINGS, autoPaste: true };
    saveSettings(s, storage);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('never throws when storage is unavailable', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, throwing)).not.toThrow();
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
