import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

interface Props {
  onClose: () => void;
  onUnlocked: () => void;
}

/** 在首次调用 AI 前解锁本机 Stronghold 保险库。 */
export function VaultUnlockDialog({ onClose, onUnlocked }: Props) {
  const unlockSecrets = useSettingsStore((state) => state.unlockSecrets);
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError(null);
    try {
      await unlockSecrets(password);
      setPassword('');
      onUnlocked();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-unlock-title"
        className="w-full max-w-sm rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-xl"
      >
        <h2 id="vault-unlock-title" className="text-base font-semibold text-[var(--text-primary)]">
          解锁 API Key 保险库
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          本次启动需要先解锁本机保险库，才能读取 API Key 并开始训练。口令不会上传或保存。
        </p>
        <label className="mt-4 block">
          <span className="text-xs text-[var(--text-secondary)]">保险库口令</span>
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && password.length >= 12) {
                void handleUnlock();
              }
            }}
            className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            placeholder="至少 12 个字符"
          />
        </label>
        {error && (
          <p className="mt-3 rounded-md bg-[var(--rose-light)] p-2 text-xs text-[var(--rose)]">
            无法解锁：{error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isUnlocking}
            className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={isUnlocking || password.length < 12}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUnlocking ? '解锁中…' : '解锁并开始'}
          </button>
        </div>
      </div>
    </div>
  );
}
