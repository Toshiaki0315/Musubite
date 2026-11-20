import { describe, expect, it } from 'vitest';
import { countChars, estimateTokens, getTokenLevel, TOKEN_WARNING_THRESHOLD } from './tokenEstimator';

describe('countChars', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(countChars('a😀あ')).toBe(3);
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
  it('estimates ~4 chars per token for ASCII', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
  it('estimates ~1 token per CJK character', () => {
    expect(estimateTokens('日本語のテキスト')).toBe(8);
  });
  it('combines CJK and other characters, rounding up', () => {
    expect(estimateTokens('日本 abc')).toBe(3);
  });
});

describe('getTokenLevel', () => {
  it('classifies token counts against the warning threshold', () => {
    expect(getTokenLevel(0)).toBe('ok');
    expect(getTokenLevel(TOKEN_WARNING_THRESHOLD * 0.8 - 1)).toBe('ok');
    expect(getTokenLevel(TOKEN_WARNING_THRESHOLD * 0.8)).toBe('caution');
    expect(getTokenLevel(TOKEN_WARNING_THRESHOLD)).toBe('caution');
    expect(getTokenLevel(TOKEN_WARNING_THRESHOLD + 1)).toBe('danger');
  });
});
