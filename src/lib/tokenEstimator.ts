/**
 * Heuristic token estimation. Claude's tokenizer is not available offline, so we use
 * empirically reasonable ratios: ~1 token per CJK character, ~4 characters per token otherwise.
 */
export const TOKEN_WARNING_THRESHOLD = 100_000;
const CAUTION_RATIO = 0.8;
const CHARS_PER_TOKEN_LATIN = 4;

const CJK_PATTERN = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/gu;

export type TokenLevel = 'ok' | 'caution' | 'danger';

export function countChars(text: string): number {
  return Array.from(text).length;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = text.match(CJK_PATTERN)?.length ?? 0;
  const other = countChars(text) - cjk;
  return cjk + Math.ceil(other / CHARS_PER_TOKEN_LATIN);
}

export function getTokenLevel(tokens: number): TokenLevel {
  if (tokens > TOKEN_WARNING_THRESHOLD) return 'danger';
  if (tokens >= TOKEN_WARNING_THRESHOLD * CAUTION_RATIO) return 'caution';
  return 'ok';
}
