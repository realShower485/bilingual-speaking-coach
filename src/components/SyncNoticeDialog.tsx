import { useEffect } from 'react';

interface Props {
  /** 数据库当前记录的修改时间戳(毫秒);未知时为 null。 */
  currentTime: number | null;
  /** 本地缓存的已知修改时间戳(毫秒);首次启动时为 null。 */
  lastKnownTime: number | null;
  /** 用户选择"加载最新":重新初始化数据库连接以读取最新数据。 */
  onLoadLatest: () => void;
  /** 用户选择"使用本地缓存":忽略外部修改,继续使用当前内存数据。 */
  onUseCache: () => void;
}

function formatTime(ts: number | null): string {
  if (ts === null) return '未知';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/**
 * 同步通知对话框:应用启动时若检测到数据库在外部被更新
 * (可能是另一台电脑的同步覆盖),向用户提示并让用户选择如何处理。
 */
export function SyncNoticeDialog({
  currentTime,
  lastKnownTime,
  onLoadLatest,
  onUseCache,
}: Props) {
  // ESC 键等同于"使用本地缓存"
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onUseCache();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUseCache]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-notice-title"
    >
      <div className="w-full max-w-md rounded-xl border-[var(--border-light)] bg-[var(--bg-secondary)] p-6 shadow-2xl">
        <h2
          id="sync-notice-title"
          className="mb-3 flex items-center gap-2 text-lg font-bold text-[var(--amber)]"
        >
          <span aria-hidden>🔄</span>
          检测到外部更新
        </h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          数据库在外部被更新,可能是另一台电脑通过同步盘(WebDAV / iCloud /
          OneDrive)写入了新数据。是否加载最新数据?
        </p>
        <dl className="mb-5 space-y-1 rounded-lg bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-secondary)]">
          <div className="flex justify-between gap-2">
            <dt>本地已知时间:</dt>
            <dd className="font-mono text-[var(--text-secondary)]">
              {formatTime(lastKnownTime)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>数据库最新时间:</dt>
            <dd className="font-mono text-[var(--text-secondary)]">
              {formatTime(currentTime)}
            </dd>
          </div>
        </dl>
        <div className="flex justify-end gap-3">
          <button
            onClick={onUseCache}
            className="rounded-lg border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            使用本地缓存
          </button>
          <button
            onClick={onLoadLatest}
            autoFocus
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
          >
            加载最新
          </button>
        </div>
      </div>
    </div>
  );
}
