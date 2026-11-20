import { useDeferredValue, useMemo } from 'react';
import { countChars, estimateTokens, getTokenLevel, type TokenLevel } from '../lib/tokenEstimator';

export interface TokenEstimate {
  chars: number;
  tokens: number;
  level: TokenLevel;
}

/** Estimate size of the payload; deferred so typing in large text areas stays responsive. */
export function useTokenEstimator(text: string): TokenEstimate {
  const deferred = useDeferredValue(text);
  return useMemo(() => {
    const tokens = estimateTokens(deferred);
    return { chars: countChars(deferred), tokens, level: getTokenLevel(tokens) };
  }, [deferred]);
}
