import type { Feedback } from '../types';

interface Props {
  feedback: Feedback;
  compact?: boolean;
}

/** 本回合的可复述最佳表达；数据随 feedback 一起写入本地历史。 */
export function OptimalOutcomeArchive({ feedback, compact = false }: Props) {
  if (!feedback.optimalEnglish && !feedback.optimalJapanese && !feedback.outcomeSummaryZh) {
    return null;
  }

  return (
    <section className={compact
      ? 'mt-3 border-t border-[var(--border-light)] pt-3 text-xs'
      : 'rounded-lg border border-[var(--emerald)] bg-[var(--emerald-bg)] p-4'
    }>
      <h4 className={compact
        ? 'mb-2 font-semibold text-[var(--emerald)]'
        : 'mb-3 text-sm font-semibold text-[var(--emerald)]'
      }>
        ✓ 本回合最佳表达（已存档）
      </h4>
      <div className={compact ? 'space-y-1.5 text-[var(--text-secondary)]' : 'space-y-3 text-sm'}>
        {feedback.optimalEnglish && (
          <p className="text-[var(--text-primary)]">
            <span className="mr-2 font-medium text-[var(--accent)]">EN</span>
            {feedback.optimalEnglish}
          </p>
        )}
        {feedback.optimalJapanese && (
          <p className="text-[var(--text-primary)]">
            <span className="mr-2 font-medium text-[var(--rose)]">JA</span>
            {feedback.optimalJapanese}
          </p>
        )}
        {feedback.outcomeSummaryZh && (
          <p className={compact
            ? 'text-[var(--text-secondary)]'
            : 'border-t border-[var(--emerald)] pt-3 text-[var(--text-secondary)]'
          }>
            <span className="mr-1 font-medium text-[var(--emerald)]">要点：</span>
            {feedback.outcomeSummaryZh}
          </p>
        )}
      </div>
    </section>
  );
}
