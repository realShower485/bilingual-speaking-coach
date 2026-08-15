import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TrainingView } from './components/TrainingView';
import { StatusBar } from './components/StatusBar';
import { SettingsPanel } from './components/SettingsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { VocabularyPanel } from './components/VocabularyPanel';
import { SyncNoticeDialog } from './components/SyncNoticeDialog';
import { useUiStore } from './store/uiStore';
import { useSessionStore } from './store/sessionStore';
import { useSettingsStore } from './store/settingsStore';
import { startNewTurn, endCurrentSession } from './services/training';
import { initDatabase, closeDatabase } from './services/db';
import { checkDbModified, recordDbTime } from './services/syncChecker';
import type { ContextType, EnglishDifficulty, JapaneseDifficulty } from './types';
import './App.css';

interface SyncNoticeState {
  currentTime: number | null;
  lastKnownTime: number | null;
}

function App() {
  // 选择状态(在开始会话前由用户在顶栏选择)
  const [contextType, setContextType] = useState<ContextType>('free_chat');
  const [englishDifficulty, setEnglishDifficulty] =
    useState<EnglishDifficulty>('auto');
  const [japaneseDifficulty, setJapaneseDifficulty] =
    useState<JapaneseDifficulty>('auto');
  const [scenarioId, setScenarioId] = useState('');
  const [topicId, setTopicId] = useState('');

  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const hasSession = useSessionStore((s) => !!s.currentSession);

  // 启动初始化:加载设置 → 初始化数据库 → 检测外部修改
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<SyncNoticeState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. 从 localStorage 加载设置到 zustand store
        useSettingsStore.getState().loadSettings();
        const { dbPath } = useSettingsStore.getState().settings;

        // 2. 用配置中的 dbPath 初始化数据库(若为空则用默认路径)
        await initDatabase(dbPath || undefined);

        // 3. 检测数据库是否被外部修改(可能是另一台电脑同步覆盖)
        const result = await checkDbModified();
        if (cancelled) return;

        if (result.isModified) {
          // 暂不弹窗,等用户处理后再 recordDbTime
          setSyncNotice({
            currentTime: result.currentTime,
            lastKnownTime: result.lastKnownTime,
          });
        } else {
          // 未检测到外部修改,记录当前时间作为新的已知时间
          await recordDbTime();
        }
      } catch (e) {
        if (!cancelled) setBootError((e as Error).message);
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** 用户选择"加载最新":关闭并重新初始化数据库连接。 */
  const handleLoadLatest = async () => {
    try {
      await closeDatabase();
      const { dbPath } = useSettingsStore.getState().settings;
      await initDatabase(dbPath || undefined);
      await recordDbTime();
    } catch (e) {
      setBootError((e as Error).message);
    } finally {
      setSyncNotice(null);
    }
  };

  /** 用户选择“暂不重新打开”:确认当前数据库状态并继续。 */
  const handleContinue = async () => {
    await recordDbTime();
    setSyncNotice(null);
  };

  const handleNextTurn = () => {
    void startNewTurn();
  };

  const handleEndSession = () => {
    void endCurrentSession();
  };

  if (isBooting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)]">
        <div className="text-sm">正在初始化…</div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)] p-6 text-[var(--text-primary)]">
        <div className="max-w-md rounded-lg border border-[var(--rose)]/40 bg-[var(--rose-bg)] p-4">
          <h2 className="mb-2 text-base font-semibold text-[var(--rose)]">
            初始化失败
          </h2>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">{bootError}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        contextType={contextType}
        englishDifficulty={englishDifficulty}
        japaneseDifficulty={japaneseDifficulty}
        scenarioId={scenarioId}
        topicId={topicId}
        disabled={hasSession}
        onContextTypeChange={setContextType}
        onEnglishDifficultyChange={setEnglishDifficulty}
        onJapaneseDifficultyChange={setJapaneseDifficulty}
        onScenarioChange={setScenarioId}
        onTopicChange={setTopicId}
        onOpenSettings={() => setActiveView('settings')}
        onEndSession={handleEndSession}
      />

      {activeView === 'settings' ? (
        <SettingsPanel onClose={() => setActiveView('training')} />
      ) : activeView === 'history' ? (
        <HistoryPanel onBack={() => setActiveView('training')} />
      ) : activeView === 'vocabulary' ? (
        <VocabularyPanel onBack={() => setActiveView('training')} />
      ) : (
        <TrainingView
          contextType={contextType}
          englishDifficulty={englishDifficulty}
          japaneseDifficulty={japaneseDifficulty}
          scenarioId={scenarioId}
          topicId={topicId}
        />
      )}

      <StatusBar onNextTurn={handleNextTurn} />

      {syncNotice && (
        <SyncNoticeDialog
          currentTime={syncNotice.currentTime}
          lastKnownTime={syncNotice.lastKnownTime}
          onLoadLatest={() => void handleLoadLatest()}
          onContinue={() => void handleContinue()}
        />
      )}
    </div>
  );
}

export default App;
