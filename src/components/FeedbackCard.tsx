import { memo } from 'react';
import type { Feedback, PronunciationTip } from '../types';

interface Props {
  feedback: Feedback;
}

function PronunciationTipList({
  tips,
  language,
}: {
  tips: PronunciationTip[];
  language: 'en' | 'ja';
}) {
  if (tips.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-[var(--border-light)] pt-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">发音小贴士</span>
      {tips.map((tip, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
        >
          <span className="font-medium text-[var(--text-primary)]">{tip.word}</span>
          {language === 'en' ? (
            <>
              {tip.ipa && (
                <span className="font-mono text-[var(--accent)]">/{tip.ipa}/</span>
              )}
              {tip.stress && (
                <span className="text-[var(--amber)]">重音: {tip.stress}</span>
              )}
            </>
          ) : (
            <>
              {tip.kana && (
                <span className="font-mono text-[var(--accent)]">{tip.kana}</span>
              )}
              {tip.pitch && (
                <span className="text-[var(--amber)]">音调: {tip.pitch}</span>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 反馈卡片:分区展示语义一致性、英语/日语反馈(含发音小贴士)、
 * 跨语言对照说明、易错词列表。
 *
 * 使用 React.memo 避免父组件(TrainingView)在 inputText 等本地 state
 * 变化时不必要地重渲染这张相对静态的卡片。
 */
export const FeedbackCard = memo(function FeedbackCard({ feedback }: Props) {
  return (
    <div className="space-y-3">
      {/* 语义一致性 */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${
          feedback.semanticConsistency
            ? 'border-[var(--emerald)] opacity-40 bg-[var(--emerald-light)] text-[var(--emerald)]'
            : 'border-[var(--rose)] opacity-40 bg-[var(--rose-light)] text-[var(--rose)]'
        }`}
      >
        <span className="text-xl leading-none">
          {feedback.semanticConsistency ? '✓' : '✗'}
        </span>
        <span className="text-sm font-medium">
          语义{feedback.semanticConsistency ? '一致' : '不一致'}
        </span>
      </div>

      {/* 英语反馈 */}
      <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
        <h4 className="mb-2 text-sm font-semibold text-[var(--accent)]">
          🇬🇧 英语反馈
        </h4>
        <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
          {feedback.englishFeedback}
        </p>
        <PronunciationTipList tips={feedback.englishTips} language="en" />
      </div>

      {/* 日语反馈 */}
      <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
        <h4 className="mb-2 text-sm font-semibold text-[var(--rose)]">
          🇯🇵 日语反馈
        </h4>
        <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
          {feedback.japaneseFeedback}
        </p>
        <PronunciationTipList tips={feedback.japaneseTips} language="ja" />
      </div>

      {/* 跨语言对照 */}
      {feedback.crossLanguageNotes && (
        <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
          <h4 className="mb-2 text-sm font-semibold text-[var(--amber)]">
            🔄 跨语言对照
          </h4>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {feedback.crossLanguageNotes}
          </p>
        </div>
      )}

      {/* 易错词 */}
      {feedback.errorWords.length > 0 && (
        <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
          <h4 className="mb-2 text-sm font-semibold text-[var(--amber)]">
            ⚠️ 易错词
          </h4>
          <div className="space-y-2">
            {feedback.errorWords.map((ew, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)]">{ew.word}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    ({ew.language === 'en' ? '英语' : '日语'})
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{ew.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
