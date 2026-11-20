import type { TokenEstimate } from '../hooks/useTokenEstimator';
import { TOKEN_WARNING_THRESHOLD } from '../lib/tokenEstimator';

const BAR: Record<TokenEstimate['level'], string> = {
  ok: 'bg-emerald-500',
  caution: 'bg-amber-500',
  danger: 'bg-red-500',
};

const fmt = (n: number) => n.toLocaleString('ja-JP');

export function TokenMeter({ estimate }: { estimate: TokenEstimate }) {
  const ratio = Math.min(estimate.tokens / TOKEN_WARNING_THRESHOLD, 1);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-baseline gap-3 text-xs text-stone-500">
        <span>
          文字数 <strong className="text-stone-700 dark:text-stone-200">{fmt(estimate.chars)}</strong>
        </span>
        <span>
          推定トークン <strong className="text-stone-700 dark:text-stone-200">{fmt(estimate.tokens)}</strong>
          <span className="text-stone-400"> / {fmt(TOKEN_WARNING_THRESHOLD)}</span>
        </span>
        {estimate.level === 'danger' && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            上限超過の恐れ
          </span>
        )}
        {estimate.level === 'caution' && (
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            上限に接近
          </span>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
        role="meter"
        aria-label="推定トークン量"
        aria-valuemin={0}
        aria-valuemax={TOKEN_WARNING_THRESHOLD}
        aria-valuenow={estimate.tokens}
      >
        <div className={`h-full transition-all ${BAR[estimate.level]}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
