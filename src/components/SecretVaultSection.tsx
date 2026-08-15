import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';

export function SecretVaultSection() {
  const {
    isSecretVaultInitialized,
    isSecretsUnlocked,
    hasLegacySecrets,
    unlockSecrets,
  } = useSettings();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isFirstSetup = !isSecretVaultInitialized;

  const handleUnlock = async () => {
    if (isFirstSetup && password !== confirmation) {
      setMessage('两次输入的保险库口令不一致');
      return;
    }

    setIsUnlocking(true);
    setMessage(null);
    try {
      await unlockSecrets(password);
      setPassword('');
      setConfirmation('');
      setMessage(
        hasLegacySecrets
          ? '已解锁。点击“保存设置”后，旧版 localStorage 中的 API Key 会被迁移并清除。'
          : '本次运行已解锁。关闭应用后需要再次输入保险库口令。',
      );
    } catch (error) {
      setMessage(`无法解锁保险库：${(error as Error).message}`);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <section className="rounded-lg border border-[var(--emerald)]/30 bg-[var(--emerald-bg)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
        API Key 安全
      </h3>
      {isSecretsUnlocked ? (
        <p className="mt-2 text-xs text-[var(--emerald)]">
          ✓ 本次运行已解锁。API Key 将加密保存到本机 Stronghold 保险库，localStorage 不再保存密钥。
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {isFirstSetup
              ? '首次使用：请创建仅保存在本机记忆中的保险库口令。遗忘后无法恢复其中的 API Key。'
              : '请输入本机保险库口令，以读取并保存 API Key。口令不会上传或写入 localStorage。'}
          </p>
          <label className="mt-3 block">
            <span className="text-xs text-[var(--text-secondary)]">保险库口令</span>
            <input
              type="password"
              autoComplete={isFirstSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              placeholder="至少 12 个字符"
            />
          </label>
          {isFirstSetup && (
            <label className="mt-3 block">
              <span className="text-xs text-[var(--text-secondary)]">再次确认口令</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={isUnlocking || password.length < 12}
            className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUnlocking
              ? '处理中…'
              : isFirstSetup
                ? '创建并解锁保险库'
                : '解锁保险库'}
          </button>
        </>
      )}
      {message && (
        <p className="mt-3 rounded-md bg-[var(--bg-primary)] p-2 text-xs text-[var(--text-secondary)]">
          {message}
        </p>
      )}
      {hasLegacySecrets && !isSecretsUnlocked && (
        <p className="mt-3 text-xs text-[var(--amber)]">
          ⚠ 检测到旧版 localStorage API Key。解锁并保存后将自动迁移。
        </p>
      )}
    </section>
  );
}
