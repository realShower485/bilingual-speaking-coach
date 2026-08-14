import { useSessionStore } from '../store/sessionStore';

/**
 * 难度调整提示条。
 * 当 sessionStore.lastDifficultyAdjustment 不为 null 时显示,
 * 用户可点击关闭按钮调用 clearDifficultyAdjustment 清除。
 */
export function DifficultyNotice() {
  const adjustment = useSessionStore((s) => s.lastDifficultyAdjustment);
  const clear = useSessionStore((s) => s.clearDifficultyAdjustment);

  if (!adjustment) return null;

  const langName = adjustment.language === 'en' ? '英语' : '日语';

  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-start gap-3 rounded-lg border border-[var(--amber)] opacity-40 bg-[var(--amber-light)] px-4 py-3 text-sm text-[var(--amber)]">
      <span className="text-lg leading-none">⚠</span>
      <div className="flex-1">
        <span className="font-medium">{langName}难度调整通知</span>
        <p className="mt-0.5 text-[var(--amber)] opacity-90">
          {langName}难度从{' '}
          <span className="font-mono font-semibold">{adjustment.oldDifficulty}</span>{' '}
          调整为{' '}
          <span className="font-mono font-semibold">{adjustment.newDifficulty}</span>
          :{adjustment.reason}
        </p>
      </div>
      <button
        onClick={clear}
        className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--amber)] transition hover:bg-[var(--amber-light)] hover:text-[var(--amber)]"
      >
        关闭
      </button>
    </div>
  );
}
