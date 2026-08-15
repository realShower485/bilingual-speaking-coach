import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { selectDatabaseFile } from '../services/fileDialog';
import * as db from '../services/db';
import { SecretVaultSection } from './SecretVaultSection';
import { CustomContextManager } from './CustomContextManager';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

type SaveState = 'idle' | 'saving' | 'saved';

interface Props {
  onClose: () => void;
}

const LLM_MODEL_OPTIONS = [
  'glm-4-plus',
  'glm-4-flash',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
  'claude-3-5-sonnet',
];

const STT_LANGUAGE_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'zh', label: '中文' },
];

const OPENAI_VOICE_OPTIONS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/**
 * 设置面板:
 *  - LLM 配置(API Key / 模型 / Base URL 高级选项)
 *  - STT 配置(Provider / API Key / 语言偏好)
 *  - TTS 配置(Provider / API Key / 音色 / 语速)
 *  - 训练设置(安全词 / 语言顺序)
 *  - 数据设置(数据库路径,可迁移到同步盘目录)
 */
export function SettingsPanel({ onClose }: Props) {
  const {
    settings,
    updateSettings,
    saveSettings,
    testLLMConnection,
    isTestingConnection,
    testConnectionMessage,
  } = useSettings();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showSttKey, setShowSttKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const handleSelectDbPath = async () => {
    const selected = await selectDatabaseFile();
    if (selected === null) return;
    updateSettings({ dbPath: selected });
  };

  const handleMigrateDb = async () => {
    const newPath = settings.dbPath.trim();
    if (!newPath) {
      setMigrationError('请先填写或选择新的数据库路径');
      setMigrationMessage(null);
      return;
    }
    if (newPath === db.getCurrentDbPath()) {
      setMigrationError('新路径与当前路径相同,无需迁移');
      setMigrationMessage(null);
      return;
    }

    setIsMigrating(true);
    setMigrationError(null);
    setMigrationMessage(null);
    try {
      await db.migrateDbPath(newPath);
      setMigrationMessage(`✓ 数据已成功迁移到:${newPath}`);
    } catch (e) {
      setMigrationError(`迁移失败:${(e as Error).message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleShowInFileManager = async () => {
    const path = db.getCurrentDbPath() ?? settings.dbPath.trim();
    if (!path) {
      setMigrationError('当前没有可显示的数据库路径');
      return;
    }

    try {
      await revealItemInDir(path);
    } catch (error) {
      setMigrationError(`无法在文件管理器中显示：${(error as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (saveState === 'saving') return;
    setSaveState('saving');
    try {
      await saveSettings();
    } catch (error) {
      setSaveState('idle');
      alert(`保存失败：${(error as Error).message}`);
      return;
    }
    // 短暂展示"已保存"反馈,然后关闭面板
    setSaveState('saved');
    window.setTimeout(() => {
      onClose();
    }, 600);
  };

  const inputClass =
    'mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
  const labelClass = 'text-xs text-[var(--text-secondary)]';
  const sectionClass =
    'space-y-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4';
  const headingClass = 'text-sm font-semibold text-[var(--text-primary)]';

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">设置</h2>
          <button
            onClick={onClose}
            className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            ✕ 关闭
          </button>
        </div>

        <SecretVaultSection />

        {/* 硅基流动推荐提示 */}
        <div className="rounded-lg border border-[var(--emerald)]/30 bg-[var(--emerald-bg)] p-3 text-xs text-[var(--emerald)]">
          💡 推荐使用硅基流动:一个 API Key 同时支持 LLM、STT、TTS。STT 免费,
          TTS 仅 ¥0.05/千字符。注册:
          <a
            href="https://cloud.siliconflow.cn/"
            target="_blank"
            rel="noreferrer"
            className="underline transition hover:text-[var(--emerald)]"
          >
            https://cloud.siliconflow.cn/
          </a>
        </div>

        {/* LLM 设置 */}
        <section className={sectionClass}>
          <h3 className={headingClass}>LLM 大语言模型</h3>
          <label className="block">
            <span className={labelClass}>API Key</span>
            <div className="mt-1 flex gap-2">
              <input
                type={showLlmKey ? 'text' : 'password'}
                value={settings.llmApiKey}
                onChange={(e) => updateSettings({ llmApiKey: e.target.value })}
                className={inputClass}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowLlmKey((v) => !v)}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {showLlmKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>
          <label className="block">
            <span className={labelClass}>模型名称</span>
            <input
              type="text"
              value={settings.llmModel}
              onChange={(e) => updateSettings({ llmModel: e.target.value })}
              className={inputClass}
              placeholder="从下拉选择或自定义输入"
              list="llm-model-list"
            />
            <datalist id="llm-model-list">
              {LLM_MODEL_OPTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-[var(--text-secondary)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
            >
              {showAdvanced ? '▾ 收起高级选项' : '▸ 高级选项(Base URL)'}
            </button>
            <button
              type="button"
              onClick={() => void testLLMConnection()}
              disabled={isTestingConnection}
              className="rounded-lg border border-[var(--accent)] opacity-50 px-3 py-1 text-xs text-[var(--accent)] transition hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTestingConnection ? '测试中…' : '测试连接'}
            </button>
          </div>

          {showAdvanced && (
            <label className="block">
              <span className={labelClass}>
                Base URL(留空则按模型名自动推断)
              </span>
              <input
                type="text"
                value={settings.llmBaseUrl ?? ''}
                onChange={(e) => updateSettings({ llmBaseUrl: e.target.value })}
                className={inputClass}
                placeholder="https://api.openai.com/v1"
              />
            </label>
          )}

          {testConnectionMessage && (
            <p
              className={`rounded-lg p-2 text-xs ${
                testConnectionMessage.startsWith('✓')
                  ? 'bg-[var(--emerald-light)] text-[var(--emerald)]'
                  : 'bg-[var(--rose-light)] text-[var(--rose)]'
              }`}
            >
              {testConnectionMessage}
            </p>
          )}
        </section>

        {/* STT 设置 */}
        <section className={sectionClass}>
          <h3 className={headingClass}>语音识别(STT)</h3>
          <label className="block">
            <span className={labelClass}>Provider</span>
            <select
              value={settings.sttProvider}
              onChange={(e) =>
                updateSettings({
                  sttProvider: e.target.value as 'whisper' | 'siliconflow',
                })
              }
              className={inputClass}
            >
              <option value="whisper">Whisper(OpenAI 兼容)</option>
              <option value="siliconflow">硅基流动 SiliconFlow</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>API Key(可与 LLM 共用)</span>
            <div className="mt-1 flex gap-2">
              <input
                type={showSttKey ? 'text' : 'password'}
                value={settings.sttApiKey}
                onChange={(e) => updateSettings({ sttApiKey: e.target.value })}
                className={inputClass}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowSttKey((v) => !v)}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {showSttKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          {settings.sttProvider === 'siliconflow' && (
            <>
              <p className="rounded-lg bg-[var(--emerald-bg)] p-2 text-xs text-[var(--emerald)]">
                💡 SenseVoiceSmall 为免费模型;API Key 可与 LLM 共用。
              </p>
              <label className="block">
                <span className={labelClass}>
                  Base URL(留空用默认硅基流动端点)
                </span>
                <input
                  type="text"
                  value={settings.sttBaseUrl ?? ''}
                  onChange={(e) => updateSettings({ sttBaseUrl: e.target.value })}
                  className={inputClass}
                  placeholder="https://api.siliconflow.cn/v1/audio/transcriptions"
                />
              </label>
              <label className="block">
                <span className={labelClass}>模型名(留空用默认)</span>
                <input
                  type="text"
                  value={settings.sttModel ?? ''}
                  onChange={(e) => updateSettings({ sttModel: e.target.value })}
                  className={inputClass}
                  placeholder="FunAudioLLM/SenseVoiceSmall"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className={labelClass}>语言偏好(可选)</span>
            <select
              value={settings.sttLanguage ?? 'auto'}
              onChange={(e) => updateSettings({ sttLanguage: e.target.value })}
              className={inputClass}
            >
              {STT_LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* TTS 设置 */}
        <section className={sectionClass}>
          <h3 className={headingClass}>语音合成(TTS)</h3>
          <label className="block">
            <span className={labelClass}>Provider</span>
            <select
              value={settings.ttsProvider}
              onChange={(e) =>
                updateSettings({
                  ttsProvider: e.target.value as 'openai' | 'siliconflow',
                })
              }
              className={inputClass}
            >
              <option value="openai">OpenAI TTS</option>
              <option value="siliconflow">硅基流动 SiliconFlow</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>API Key(可与 LLM 共用)</span>
            <div className="mt-1 flex gap-2">
              <input
                type={showTtsKey ? 'text' : 'password'}
                value={settings.ttsApiKey}
                onChange={(e) => updateSettings({ ttsApiKey: e.target.value })}
                className={inputClass}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowTtsKey((v) => !v)}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {showTtsKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>
          {settings.ttsProvider === 'openai' && (
            <label className="block">
              <span className={labelClass}>
                语音音色(OpenAI)
              </span>
              <select
                value={settings.ttsVoice ?? 'alloy'}
                onChange={(e) => updateSettings({ ttsVoice: e.target.value })}
                className={inputClass}
              >
                {OPENAI_VOICE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          {settings.ttsProvider === 'siliconflow' && (
            <>
              <p className="rounded-lg bg-[var(--emerald-bg)] p-2 text-xs text-[var(--emerald)]">
                💡 CosyVoice2:¥0.05/千字符;API Key 可与 LLM 共用。
              </p>
              <label className="block">
                <span className={labelClass}>
                  Base URL(留空用默认硅基流动端点)
                </span>
                <input
                  type="text"
                  value={settings.ttsBaseUrl ?? ''}
                  onChange={(e) => updateSettings({ ttsBaseUrl: e.target.value })}
                  className={inputClass}
                  placeholder="https://api.siliconflow.cn/v1/audio/speech"
                />
              </label>
              <label className="block">
                <span className={labelClass}>模型名(留空用默认)</span>
                <input
                  type="text"
                  value={settings.ttsModel ?? ''}
                  onChange={(e) => updateSettings({ ttsModel: e.target.value })}
                  className={inputClass}
                  placeholder="FunAudioLLM/CosyVoice2-0.5B"
                />
              </label>
              <label className="block">
                <span className={labelClass}>
                  音色 ID(可留空;如 FunAudioLLM/CosyVoice2-0.5B:alex)
                </span>
                <input
                  type="text"
                  value={settings.ttsVoice ?? ''}
                  onChange={(e) => updateSettings({ ttsVoice: e.target.value })}
                  className={inputClass}
                  placeholder="留空使用默认音色"
                />
              </label>
            </>
          )}
          <label className="block">
            <span className={labelClass}>
              语速:{(settings.ttsRate ?? 1).toFixed(2)}x
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.ttsRate ?? 1}
              onChange={(e) =>
                updateSettings({ ttsRate: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[var(--accent)]"
            />
          </label>
        </section>

        {/* 训练设置 */}
        <section className={sectionClass}>
          <h3 className={headingClass}>训练设置</h3>
          <label className="block">
            <span className={labelClass}>安全词(遇到困难时使用)</span>
            <input
              type="text"
              value={settings.safeWord}
              onChange={(e) => updateSettings({ safeWord: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>双语表达顺序</span>
            <select
              value={settings.targetLanguageOrder}
              onChange={(e) =>
                updateSettings({
                  targetLanguageOrder: e.target.value as 'en-ja' | 'ja-en',
                })
              }
              className={inputClass}
            >
              <option value="en-ja">英语 → 日语</option>
              <option value="ja-en">日语 → 英语</option>
            </select>
          </label>
        </section>

        <CustomContextManager />

        {/* 数据设置 */}
        <section className={sectionClass}>
          <h3 className={headingClass}>数据 / 跨电脑同步</h3>
          <label className="block">
            <span className={labelClass}>
              数据库路径(留空使用默认路径)
            </span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={settings.dbPath}
                onChange={(e) => updateSettings({ dbPath: e.target.value })}
                className={inputClass}
                placeholder="例如:/path/to/bilingual-speaking-coach.db"
              />
              <button
                type="button"
                onClick={() => void handleSelectDbPath()}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-3 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                更改路径
              </button>
            </div>
          </label>

          <p className="text-xs text-[var(--text-tertiary)]">
            💡 将数据库文件放置在 WebDAV / iCloud / OneDrive 等同步目录中,
            即可在多台电脑间共享训练数据。首次更改路径后请点击「迁移数据」按钮。
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleMigrateDb()}
              disabled={isMigrating || !settings.dbPath.trim()}
              className="rounded-lg border border-[var(--accent)] opacity-50 px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMigrating ? '迁移中…' : '迁移数据到新路径'}
            </button>
            <button
              type="button"
              onClick={() => void handleShowInFileManager()}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              title="在系统文件管理器中定位当前数据库"
            >
              在文件管理器中显示
            </button>
          </div>

          {migrationMessage && (
            <p className="rounded-lg bg-[var(--emerald-light)] p-2 text-xs text-[var(--emerald)]">
              {migrationMessage}
            </p>
          )}
          {migrationError && (
            <p className="rounded-lg bg-[var(--rose-light)] p-2 text-xs text-[var(--rose)]">
              {migrationError}
            </p>
          )}

          <div className="rounded-lg bg-[var(--bg-primary)] p-2 text-xs">
            <div className="text-[var(--text-tertiary)]">当前连接的数据库:</div>
            <div className="mt-1 break-all font-mono text-[var(--text-secondary)]">
              {db.getCurrentDbPath() ?? '(尚未初始化)'}
            </div>
          </div>
        </section>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saveState === 'saving'}
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saveState !== 'idle'}
            className={`flex min-w-[88px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed ${
              saveState === 'saved'
                ? 'bg-[var(--emerald)] hover:bg-[var(--emerald)]'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-70'
            }`}
          >
            {saveState === 'saving' && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {saveState === 'saving'
              ? '保存中…'
              : saveState === 'saved'
                ? '✓ 已保存'
                : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
