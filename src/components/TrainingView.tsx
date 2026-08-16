import { useEffect, useRef, useState } from 'react';
import type {
  ContextType,
  EnglishDifficulty,
  JapaneseDifficulty,
} from '../types';
import { useTraining } from '../hooks/useTraining';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { FeedbackCard } from './FeedbackCard';
import { DifficultyNotice } from './DifficultyNotice';
import { PhrasebookPanel } from './PhrasebookPanel';
import { streamMetaDialog } from '../services/llm';
import { VaultUnlockDialog } from './VaultUnlockDialog';
import { OptimalOutcomeArchive } from './OptimalOutcomeArchive';

interface Props {
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  scenarioId: string;
  topicId: string;
}

interface MetaMessage {
  role: 'user' | 'assistant';
  content: string;
  /** AI 回应中的中文注释,仅显示不朗读。 */
  noteZh?: string;
}

/**
 * 主训练区:根据当前回合阶段(phase)显示不同内容。
 * - idle:开始练习按钮 + 说明
 * - awaiting_english / awaiting_japanese:情境、输入框、提交与提示
 * - feedback:反馈卡片 → 复盘问答 → 最佳表达存档
 * - meta_dialog:复盘问答或安全词触发的临时求助
 */
export function TrainingView({
  contextType,
  englishDifficulty,
  japaneseDifficulty,
  scenarioId,
  topicId,
}: Props) {
  const {
    session,
    currentTurn,
    currentFeedback,
    currentContext,
    turnPhase,
    isProcessing,
    error,
    isSafeMode,
    startSession,
    startTurn,
    submitEnglish,
    submitJapanese,
    requestHint,
    enterMetaDialog,
    exitMetaDialog,
    startPostFeedbackReview,
    checkSafeWord,
    checkResume,
    exitSafeMode,
  } = useTraining();

  const languageOrder = useSettingsStore((s) => s.settings.targetLanguageOrder);
  const safeWord = useSettingsStore((s) => s.settings.safeWord);
  const llmApiKey = useSettingsStore((s) => s.settings.llmApiKey);
  const isSecretVaultInitialized = useSettingsStore(
    (s) => s.isSecretVaultInitialized,
  );
  const isSecretsUnlocked = useSettingsStore((s) => s.isSecretsUnlocked);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setError = useSessionStore((s) => s.setError);
  const togglePhrasebook = useUiStore((s) => s.togglePhrasebook);
  const setPhrasebookOpen = useUiStore((s) => s.setPhrasebookOpen);

  const {
    isVoiceMode,
    toggleVoiceMode,
    isRecording,
    isAiSpeaking,
    isInterruptible,
    volumeLevel,
    interimText,
    aiSpeakingText,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    speakStream,
    stopSpeaking,
  } = useVoiceMode();

  const [inputText, setInputText] = useState('');
  const [hintText, setHintText] = useState('');
  const [metaMessages, setMetaMessages] = useState<MetaMessage[]>([]);
  const [metaInput, setMetaInput] = useState('');
  /** 只在反馈之后打开的复盘问答。 */
  const [isPostFeedbackReview, setPostFeedbackReview] = useState(false);
  const [showOutcomeArchive, setShowOutcomeArchive] = useState(false);
  const [isVaultUnlockOpen, setVaultUnlockOpen] = useState(false);
  /** 语音模式:识别中状态(STT 进行时)。 */
  const [isTranscribing, setIsTranscribing] = useState(false);
  /** 已朗读过的 feedback id,避免重复朗读。 */
  const spokenFeedbackRef = useRef<string | null>(null);

  // Ctrl+P 唤起/收起常用句手册;Esc 关闭手册
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePhrasebook();
      } else if (e.key === 'Escape') {
        setPhrasebookOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePhrasebook, setPhrasebookOpen]);

  // 语音模式:进入反馈阶段时自动朗读 AI 反馈(每条 feedback 仅朗读一次)
  // 使用流式管线:按句分段送入 TTS,首句延迟更低
  useEffect(() => {
    if (!isVoiceMode) return;
    if (turnPhase !== 'feedback' || !currentFeedback || !currentTurn) return;
    if (spokenFeedbackRef.current === currentTurn.id) return;
    spokenFeedbackRef.current = currentTurn.id;

    const speakFeedback = async () => {
      // 每段完整朗读，避免逐句切碎造成的机械停顿；TTS 会按文字自动选择中/英/日声音。
      if (currentFeedback.englishFeedback) await speak(currentFeedback.englishFeedback, 'en');
      if (currentFeedback.japaneseFeedback) await speak(currentFeedback.japaneseFeedback, 'ja');
      if (currentFeedback.crossLanguageNotes) await speak(currentFeedback.crossLanguageNotes, 'zh');
    };
    void speakFeedback();
  }, [isVoiceMode, turnPhase, currentFeedback, currentTurn, speak]);

  // 语音模式:回合切换时重置 spoken 标记
  useEffect(() => {
    if (turnPhase !== 'feedback') {
      spokenFeedbackRef.current = null;
    }
  }, [turnPhase]);

  // ===== handlers =====

  const clearLocalState = () => {
    setInputText('');
    setHintText('');
    setMetaMessages([]);
    setMetaInput('');
    setPostFeedbackReview(false);
    setShowOutcomeArchive(false);
  };

  const startSessionNow = async () => {
    clearLocalState();
    setError(null);
    const scenario =
      contextType === 'roleplay'
        ? scenarioId
        : contextType === 'topic_discussion'
          ? topicId
          : undefined;
    try {
      await startSession({
        contextType,
        englishDifficulty,
        japaneseDifficulty,
        scenario,
      });
    } catch {
      /* error 已在 store 中 */
    }
  };

  const handleStart = () => {
    if (!isSecretsUnlocked) {
      if (isSecretVaultInitialized) {
        setVaultUnlockOpen(true);
      } else {
        setActiveView('settings');
      }
      return;
    }
    void startSessionNow();
  };

  const handleSubmitInput = async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text) return;
    if (overrideText === undefined) {
      setInputText('');
    }
    setHintText('');
    // 安全词检测:命中则进入元对话 + 安全模式,而非正常提交
    if (checkSafeWord(text, safeWord)) {
      setMetaMessages([{ role: 'user', content: text }]);
      try {
        const output = await enterMetaDialog(text);
        setMetaMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: output.response,
            noteZh: output.noteZh || undefined,
          },
        ]);
        // 语音模式:朗读 AI 元对话回应
        if (isVoiceMode) {
          const targetLang: 'en' | 'ja' =
            turnPhase === 'awaiting_japanese' ? 'ja' : 'en';
          await speak(output.response, targetLang);
        }
      } catch {
        /* error 已在 store 中 */
      }
      return;
    }
    try {
      if (turnPhase === 'awaiting_english') {
        await submitEnglish(text);
      } else if (turnPhase === 'awaiting_japanese') {
        await submitJapanese(text);
      }
    } catch {
      /* error 已在 store 中 */
    }
  };

  const handleRequestHint = async () => {
    try {
      const hint = await requestHint();
      setHintText(hint);
      // 语音模式:流式朗读提示(按句分段,首句延迟更低)
      if (isVoiceMode && hint) {
        const lang: 'en' | 'ja' =
          turnPhase === 'awaiting_japanese' ? 'ja' : 'en';
        await speakStream(textToStream(hint), lang);
      }
    } catch {
      /* error 已在 store 中 */
    }
  };

  /** 语音模式:录音按钮点击 — 切换录音 / 停止并识别 + 自动提交。 */
  const handleVoiceRecordClick = async () => {
    if (isTranscribing || isProcessing || isAiSpeaking) return;
    const lang: 'en' | 'ja' =
      turnPhase === 'awaiting_japanese' ? 'ja' : 'en';
    if (isRecording) {
      setIsTranscribing(true);
      try {
        const text = await stopRecording(lang);
        if (text.trim()) {
          await handleSubmitInput(text);
        }
      } finally {
        setIsTranscribing(false);
      }
    } else {
      await startRecording(lang);
    }
  };

  /** 语音模式:元对话中录音 — 停止后识别并发送为元对话消息。 */
  const handleMetaVoiceRecordClick = async () => {
    if (isTranscribing || isProcessing || isAiSpeaking) return;
    const prev = useSessionStore.getState().previousPhase;
    const lang: 'en' | 'ja' = prev === 'awaiting_japanese' ? 'ja' : 'en';
    if (isRecording) {
      setIsTranscribing(true);
      try {
        const text = await stopRecording(lang);
        if (text.trim()) {
          await handleSendMetaMessage(text);
        }
      } finally {
        setIsTranscribing(false);
      }
    } else {
      await startRecording(lang);
    }
  };

  /**
   * 流式元对话:LLM 流式生成 → TTS 管线并行播放。
   * 调用前需已将用户消息加入 metaMessages。
   * 内部完成状态管理(enterMetaDialog、setProcessing)与流式播放。
   */
  const streamMetaDialogResponse = async (msg: string): Promise<void> => {
    const store = useSessionStore.getState();
    const turn = store.currentTurn;
    if (!turn) return;

    // 依据进入元对话前的阶段推断目标语言
    const prevPhase =
      turn.phase === 'meta_dialog'
        ? (store.previousPhase ?? turn.phase)
        : turn.phase;
    const targetLang: 'en' | 'ja' =
      prevPhase === 'awaiting_japanese' ? 'ja' : 'en';

    // 状态管理(与 training.enterMetaDialog 对齐,但不调用 LLM)
    store.setError(null);
    store.setProcessing(true);
    store.enterMetaDialog();

    // 添加占位 assistant 消息,流式过程中逐步填充
    setMetaMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const stream = streamMetaDialog({
        userMessage: msg,
        targetLanguage: targetLang,
        recentTurn: turn,
      });

      await speakStream(stream, targetLang, {
        onTextChunk: (chunk) => {
          setMetaMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return next;
          });
        },
      });
    } catch (e) {
      store.setError((e as Error).message);
      // 流式失败:移除空的占位消息
      setMetaMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      store.setProcessing(false);
    }
  };

  const handleSendMetaMessage = async (overrideText?: string) => {
    const msg = (overrideText ?? metaInput).trim();
    if (!msg) return;
    if (overrideText === undefined) {
      setMetaInput('');
    }
    // 安全模式下检测"继续练习"恢复训练
    if (isSafeMode && checkResume(msg)) {
      exitSafeMode();
      setMetaMessages([]);
      return;
    }
    setMetaMessages((prev) => [...prev, { role: 'user', content: msg }]);

    const hitSafeWord = checkSafeWord(msg, safeWord);
    // 语音模式 + 非安全词 + 非安全模式:走流式管线
    if (isVoiceMode && !hitSafeWord && !isSafeMode) {
      await streamMetaDialogResponse(msg);
      return;
    }
    // 批量后备(安全词 / 安全模式 / 非语音模式)
    try {
      const output = await enterMetaDialog(msg);
      setMetaMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: output.response,
          noteZh: output.noteZh || undefined,
        },
      ]);
      // 语音模式:朗读 AI 元对话回应(中文响应不朗读)
      if (isVoiceMode) {
        const prev = useSessionStore.getState().previousPhase;
        const targetLang: 'en' | 'ja' =
          prev === 'awaiting_japanese' ? 'ja' : 'en';
        await speak(output.response, targetLang);
      }
    } catch {
      /* error 已在 store 中 */
    }
  };

  /** 从常用句手册选中一句话后,插入到当前活跃的输入框。 */
  const handlePickPhrase = (text: string) => {
    if (turnPhase === 'meta_dialog') {
      setMetaInput((prev) => (prev ? prev + ' ' + text : text));
    } else {
      setInputText((prev) => (prev ? prev + ' ' + text : text));
    }
    setPhrasebookOpen(false);
  };

  const handleStartPostFeedbackReview = () => {
    try {
      setMetaMessages([]);
      setMetaInput('');
      setShowOutcomeArchive(false);
      setPostFeedbackReview(true);
      startPostFeedbackReview();
    } catch {
      setPostFeedbackReview(false);
      /* error 已在 store 中 */
    }
  };

  const handleExitMeta = () => {
    const completedReview = isPostFeedbackReview;
    exitMetaDialog();
    setMetaMessages([]);
    setMetaInput('');
    setPostFeedbackReview(false);
    if (completedReview) setShowOutcomeArchive(true);
  };

  const handleNextTurn = async () => {
    clearLocalState();
    try {
      await startTurn();
    } catch {
      /* error 已在 store 中 */
    }
  };

  // ===== 通用错误横幅 =====

  const ErrorBanner = () =>
    error ? (
      <div className="mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-lg border border-[var(--rose)] opacity-40 bg-[var(--rose-light)] px-4 py-3 text-sm text-[var(--rose)]">
        <span className="leading-none">⚠</span>
        <p className="flex-1">{error}</p>
        <button
          onClick={() => setError(null)}
          className="shrink-0 text-[var(--rose)] transition hover:text-[var(--rose)]"
        >
          ✕
        </button>
      </div>
    ) : null;

  // ===== idle:无会话或无回合 =====

  if (!turnPhase) {
    const canStart =
      (contextType !== 'roleplay' || !!scenarioId) &&
      (contextType !== 'topic_discussion' || !!topicId);

    // 启动中:展示带 spinner 的加载状态,而非仅按钮文字变化
    if (isProcessing) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg-primary)] p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--border-light)] border-t-[var(--accent)]" />
              <div className="absolute inset-2 animate-pulse rounded-full bg-[var(--accent)] opacity-20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {session ? 'AI 正在生成新情境…' : 'AI 正在准备会话…'}
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                正在根据情境类型与难度生成第一个表达任务
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg-primary)] p-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            开始双语口语训练
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            AI 将给出情境和待表达的意思,你需要分别用英语和日语表达。
            提交后 AI 会给出语义一致性判断、语言反馈、发音小贴士和跨语言对照。
          </p>

          {error && (
            <div className="rounded-lg border border-[var(--rose)] opacity-40 bg-[var(--rose-light)] px-4 py-3 text-sm text-[var(--rose)]">
              ⚠ {error}
            </div>
          )}

          {contextType === 'roleplay' && !scenarioId && (
            <p className="text-xs text-[var(--amber)]">
              ⚠ 请先在顶栏选择一个场景
            </p>
          )}
          {contextType === 'topic_discussion' && !topicId && (
            <p className="text-xs text-[var(--amber)]">
              ⚠ 请先在顶栏选择一个主题
            </p>
          )}

          {session ? (
            <button
              onClick={handleNextTurn}
              disabled={isProcessing}
              className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? '加载中…' : '开始新回合'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isProcessing || !canStart}
              className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? '正在准备…' : '开始练习'}
            </button>
          )}

          {/* 模式切换:文字模式 / 语音模式 */}
          <div className="flex gap-0.5 rounded-lg bg-[var(--bg-tertiary)] p-1">
            <button
              onClick={() => isVoiceMode && toggleVoiceMode()}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                !isVoiceMode
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              ✏️ 文字模式
            </button>
            <button
              onClick={() => !isVoiceMode && toggleVoiceMode()}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isVoiceMode
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              🎙 语音模式
            </button>
          </div>

          {/* API Key / 保险库状态引导 */}
          {!isSecretsUnlocked && isSecretVaultInitialized ? (
            <div className="rounded-lg border border-[var(--amber)] opacity-40 bg-[var(--amber-bg)] px-4 py-3 text-xs text-[var(--amber)]">
              ⚠ API Key 保险库尚未解锁。点击“开始练习”即可输入本机口令。
            </div>
          ) : !llmApiKey.trim() ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-[var(--amber)] opacity-40 bg-[var(--amber-bg)] px-4 py-3 text-xs text-[var(--amber)]">
              <p className="flex items-center gap-1.5">
                <span>⚠</span>
                <span>请先在设置中创建保险库并填写 LLM API Key。</span>
              </p>
              <button
                onClick={() => setActiveView('settings')}
                className="rounded-lg border border-[var(--amber)] opacity-50 px-3 py-1 text-[var(--amber)] transition hover:bg-[var(--amber-light)]"
              >
                前往设置 →
              </button>
            </div>
          ) : null}
        </div>
        {isVaultUnlockOpen && (
          <VaultUnlockDialog
            onClose={() => setVaultUnlockOpen(false)}
            onUnlocked={() => {
              setVaultUnlockOpen(false);
              void startSessionNow();
            }}
          />
        )}
      </div>
    );
  }

  // ===== evaluating:AI 评估中 =====

  if (turnPhase === 'evaluating') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg-primary)] p-6">
        <ErrorBanner />
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-light)] border-t-[var(--accent)]" />
          <p className="text-sm text-[var(--text-secondary)]">AI 正在评估你的表达…</p>
        </div>
      </div>
    );
  }

  // ===== feedback:反馈阶段 =====

  if (turnPhase === 'feedback') {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-4">
        <ErrorBanner />
        <DifficultyNotice />
        <div className="mx-auto max-w-3xl space-y-4">
          {/* 用户表达回顾 */}
          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
              你的表达
            </h4>
            <div className="space-y-1 text-sm">
              {currentTurn?.englishInput && (
                <p className="text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)]">EN:</span>{' '}
                  {currentTurn.englishInput}
                </p>
              )}
              {currentTurn?.japaneseInput && (
                <p className="text-[var(--text-secondary)]">
                  <span className="text-[var(--rose)]">JA:</span>{' '}
                  {currentTurn.japaneseInput}
                </p>
              )}
            </div>
          </div>

          {/* 情境回顾 */}
          {currentContext && (
            <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
              <h4 className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">
                📋 情境
              </h4>
              <p className="whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
                {currentContext}
              </p>
            </div>
          )}

          {/* 反馈卡片 */}
          {currentFeedback && <FeedbackCard feedback={currentFeedback} />}

          {/* 固定流程：反馈后先复盘，再展示并保存最佳表达。 */}
          {showOutcomeArchive && currentFeedback ? (
            <>
              <OptimalOutcomeArchive feedback={currentFeedback} />
              <div className="flex flex-wrap gap-2">
                {currentFeedback.optimalEnglish && (
                  <button
                    onClick={() => void speak(currentFeedback.optimalEnglish!, 'en')}
                    className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm text-[var(--accent)] transition hover:bg-[var(--accent-bg)]"
                  >
                    🔊 听英语示范
                  </button>
                )}
                {currentFeedback.optimalJapanese && (
                  <button
                    onClick={() => void speak(currentFeedback.optimalJapanese!, 'ja')}
                    className="rounded-lg border border-[var(--rose)] px-3 py-2 text-sm text-[var(--rose)] transition hover:bg-[var(--rose-light)]"
                  >
                    🔊 听日语示范
                  </button>
                )}
              </div>
              <button
                onClick={handleNextTurn}
                disabled={isProcessing}
                className="w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {isProcessing ? '加载中…' : '下一回合 →'}
              </button>
            </>
          ) : (
            <button
              onClick={handleStartPostFeedbackReview}
              disabled={isProcessing || !currentFeedback}
              className="w-full rounded-lg bg-[var(--amber)] py-3 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
            >
              进入复盘问答 →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== meta_dialog:元对话 =====

  if (turnPhase === 'meta_dialog') {
    return (
      <div className="flex flex-1 flex-col bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-4 py-2">
          <h3 className="text-sm font-semibold text-[var(--amber)]">
{isPostFeedbackReview ? '💬 复盘问答（针对本回合反馈提问）' : '💬 临时求助'}
          </h3>
          <button
            onClick={handleExitMeta}
            className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)]"
          >
{isPostFeedbackReview ? '完成复盘，查看最佳表达 →' : '← 返回练习'}
          </button>
        </div>

        {isSafeMode && (
          <div className="flex items-center gap-2 border-b border-[var(--amber)] opacity-40 bg-[var(--amber-light)] px-4 py-2 text-xs text-[var(--amber)]">
            <span className="text-base leading-none">🛡</span>
            <p className="flex-1">
              <strong>安全模式</strong> — AI 已切换为中文讨论。说或输入
              <span className="mx-1 rounded bg-[var(--amber)] opacity-40 px-1 font-medium">
                继续练习
              </span>
              可恢复原训练语言。
            </p>
          </div>
        )}

        {/* AI 流式说话实时字幕 */}
        {isAiSpeaking && aiSpeakingText && (
          <div className="border-b border-[var(--accent)] opacity-30 bg-[var(--accent-bg)] px-4 py-2">
            <p className="mb-0.5 text-xs text-[var(--accent)] opacity-70">🎙 AI 正在说</p>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
              {aiSpeakingText}
            </p>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {metaMessages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.noteZh && (
                  <p className="mt-2 border-t border-[var(--border-default)] pt-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-medium text-[var(--amber)] opacity-80">
                      中文注释:
                    </span>{' '}
                    {m.noteZh}
                  </p>
                )}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                AI 正在回复…
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--border-light)] p-3">
          {isVoiceMode && (
            <button
              onClick={handleMetaVoiceRecordClick}
              disabled={isProcessing || isTranscribing || isAiSpeaking}
              className={`flex items-center justify-center rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50 ${
                isRecording
                  ? 'border-[var(--rose)] bg-[var(--rose-light)] text-[var(--rose)]'
                  : 'border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
              title={isRecording ? '停止录音并识别' : '语音输入'}
            >
              {isRecording ? '⏹' : '🎤'}
            </button>
          )}
          <input
            value={metaInput}
            onChange={(e) => setMetaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMetaMessage();
              }
            }}
            placeholder={
              isTranscribing
                ? '正在识别…'
                : isSafeMode
                  ? '安全模式:用中文讨论,或输入"继续练习"恢复…'
                  : isPostFeedbackReview
                    ? '请针对刚才的反馈追问：为什么这样说？还有更自然的说法吗？'
                    : '用中文询问语法、用词、表达方式…'
            }
            className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={togglePhrasebook}
            className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)]"
            title="打开常用句手册 (Ctrl+P)"
          >
            📖
          </button>
          <button
            onClick={() => handleSendMetaMessage()}
            disabled={isProcessing || !metaInput.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            发送
          </button>
        </div>

        <PhrasebookPanel onPickText={handlePickPhrase} />
      </div>
    );
  }

  // ===== awaiting_english / awaiting_japanese:输入阶段 =====

  const isAwaitingEnglish = turnPhase === 'awaiting_english';
  const isAwaitingJapanese = turnPhase === 'awaiting_japanese';
  const targetLang = isAwaitingEnglish ? '英语' : '日语';
  const targetLangNative = isAwaitingEnglish ? 'English' : '日本語';

  // 判断是否为第二语言输入(需要展示已提交的第一语言)
  const isFirstLang =
    (languageOrder === 'en-ja' && isAwaitingEnglish) ||
    (languageOrder === 'ja-en' && isAwaitingJapanese);

  const firstLangInput =
    isAwaitingJapanese && currentTurn?.englishInput
      ? { label: 'EN', text: currentTurn.englishInput }
      : isAwaitingEnglish && currentTurn?.japaneseInput
        ? { label: 'JA', text: currentTurn.japaneseInput }
        : null;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-4">
      <ErrorBanner />
      {/* 紧凑模式切换 */}
      <div className="flex gap-0.5 rounded-md bg-[var(--bg-tertiary)] p-0.5 w-fit">
        <button
          onClick={() => isVoiceMode && toggleVoiceMode()}
          className={`rounded px-3 py-1 text-xs transition-colors ${
            !isVoiceMode ? 'bg-[var(--bg-primary)] font-medium text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
          }`}
        >
          ✏️ 文字
        </button>
        <button
          onClick={() => !isVoiceMode && toggleVoiceMode()}
          className={`rounded px-3 py-1 text-xs transition-colors ${
            isVoiceMode ? 'bg-[var(--bg-primary)] font-medium text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
          }`}
        >
          🎙 语音
        </button>
      </div>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* 情境 */}
        {currentContext && (
          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--accent)]">
              📋 情境
            </h4>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
              {currentContext}
            </p>
          </div>
        )}

        {/* 已提交的第一语言表达 */}
        {firstLangInput && (
          <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-sm">
            <span
              className={
                firstLangInput.label === 'EN'
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--rose)]'
              }
            >
              {firstLangInput.label}:
            </span>{' '}
            <span className="text-[var(--text-secondary)]">{firstLangInput.text}</span>
          </div>
        )}

        {/* 提示 */}
        {hintText && (
          <div className="rounded-lg border border-[var(--amber)] opacity-40 bg-[var(--amber-light)] p-3 text-sm text-[var(--amber)]">
            <span className="font-medium">💡 提示:</span>
            <p className="mt-1 whitespace-pre-wrap">{hintText}</p>
            <p className="mt-1 text-xs text-[var(--amber)] opacity-70">
              注意:使用提示的回合不计入有效练习统计。
            </p>
          </div>
        )}

        {isVoiceMode ? (
          /* 语音输入模式 */
          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              请用{targetLang}表达{' '}
              <span className="text-[var(--text-tertiary)]">({targetLangNative})</span>
              {!isFirstLang && (
                <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                  · 第二语言
                </span>
              )}
            </label>

            {/* AI 说话中:声波动画 + 打断提示 */}
            {isAiSpeaking && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--accent)] opacity-40 bg-[var(--accent-bg)] px-4 py-3 text-sm text-[var(--accent)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-hover)]" />
                </span>
                <span>AI 正在说话…</span>
                {/* 声波均衡器动画 */}
                <div className="flex h-3 items-end gap-0.5" aria-hidden>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <span
                      key={i}
                      className="ai-sound-wave-bar w-0.5 rounded-full bg-[var(--accent)]"
                      style={{ height: '100%' }}
                    />
                  ))}
                </div>
                {isInterruptible && (
                  <span className="rounded bg-[var(--accent)] opacity-40 px-1.5 py-0.5 text-xs text-[var(--accent)]">
                    说话可打断
                  </span>
                )}
                <button
                  onClick={stopSpeaking}
                  className="ml-2 rounded border border-[var(--accent)] opacity-50 px-2 py-0.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent-bg)]"
                >
                  ⏹ 停止
                </button>
              </div>
            )}

            {/* AI 说话实时字幕(流式 TTS 管线更新) */}
            {isAiSpeaking && aiSpeakingText && (
              <div className="rounded-lg border border-[var(--accent)] opacity-30 bg-[var(--accent-bg)] px-4 py-2">
                <p className="mb-0.5 text-xs text-[var(--accent)] opacity-70">🎙 AI 正在说</p>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                  {aiSpeakingText}
                </p>
              </div>
            )}

            {/* 录音 / 识别状态 */}
            {!isAiSpeaking && (
              <div className="flex flex-col items-center gap-3 py-4">
                <button
                  onClick={handleVoiceRecordClick}
                  disabled={isProcessing || isTranscribing}
                  className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isRecording
                      ? 'bg-[var(--rose)] text-white shadow-lg shadow-rose-500/20 hover:bg-[var(--rose)]'
                      : isTranscribing
                        ? 'bg-[var(--border-strong)] text-[var(--text-secondary)]'
                        : 'bg-[var(--accent)] text-white shadow-lg shadow-indigo-500/20 hover:bg-[var(--accent-hover)]'
                  }`}
                  title={
                    isRecording
                      ? '点击停止录音并识别'
                      : isTranscribing
                        ? '识别中…'
                        : '点击开始录音'
                  }
                >
                  {isRecording ? (
                    <span className="relative flex h-6 w-6">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-white opacity-75" />
                      <span className="relative inline-flex h-6 w-6 rounded-sm bg-white" />
                    </span>
                  ) : isTranscribing ? (
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--text-tertiary)] border-t-[var(--text-primary)]" />
                  ) : (
                    '🎤'
                  )}
                </button>

                {/* 状态文字 */}
                <p className="text-sm text-[var(--text-secondary)]">
                  {isTranscribing
                    ? '正在识别…'
                    : isRecording
                      ? interimText
                        ? '正在识别… 点击停止'
                        : '录音中… 点击停止'
                      : isProcessing
                        ? '处理中…'
                        : '点击录音开始说话'}
                </p>

                {/* 流式识别实时文本(边说边显示) */}
                {isRecording && interimText && (
                  <div className="w-full max-w-lg rounded-lg border border-[var(--accent)] opacity-40 bg-[var(--accent-bg)] px-4 py-3">
                    <p className="mb-1 text-xs text-[var(--accent)] opacity-70">
                      实时识别
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                      {interimText}
                    </p>
                  </div>
                )}

                {/* 音量波形 */}
                {isRecording && (
                  <div className="flex h-8 items-center gap-1">
                    {Array.from({ length: 16 }).map((_, i) => {
                      const threshold = i / 16;
                      const active = volumeLevel > threshold;
                      return (
                        <span
                          key={i}
                          className={`w-1 rounded-full transition-all ${
                            active
                              ? i < 12
                                ? 'bg-[var(--emerald)]'
                                : 'bg-[var(--amber)]'
                              : 'bg-[var(--border-strong)]'
                          }`}
                          style={{
                            height: `${8 + (active ? (i / 16) * 24 : 4)}px`,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={handleRequestHint}
                disabled={isProcessing || isRecording || isAiSpeaking}
                className="rounded-lg border border-[var(--amber)] opacity-50 px-4 py-2 text-sm text-[var(--amber)] transition hover:bg-[var(--amber-light)] disabled:opacity-50"
              >
                💡 请求提示
              </button>
              <button
                onClick={togglePhrasebook}
                className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                title="打开常用句手册 (Ctrl+P)"
              >
                📖 手册
              </button>
              {isRecording && (
                <button
                  onClick={cancelRecording}
                  className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)]"
                >
                  取消录音
                </button>
              )}
            </div>
          </div>
        ) : (
          /* 常规语言输入 */
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              请用{targetLang}表达{' '}
              <span className="text-[var(--text-tertiary)]">({targetLangNative})</span>
              {!isFirstLang && (
                <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                  · 第二语言
                </span>
              )}
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmitInput();
                }
              }}
              placeholder={`在此输入${targetLang}…  (Ctrl+Enter 提交)`}
              rows={3}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSubmitInput()}
                disabled={isProcessing || !inputText.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {isProcessing ? '提交中…' : '提交'}
              </button>
              <button
                onClick={handleRequestHint}
                disabled={isProcessing}
                className="rounded-lg border border-[var(--amber)] opacity-50 px-4 py-2 text-sm text-[var(--amber)] transition hover:bg-[var(--amber-light)] disabled:opacity-50"
              >
                💡 请求提示
              </button>
              <button
                onClick={togglePhrasebook}
                className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                title="打开常用句手册 (Ctrl+P)"
              >
                📖 手册
              </button>
            </div>
          </div>
        )}
      </div>

      <PhrasebookPanel onPickText={handlePickPhrase} />
    </div>
  );
}
