import { useSessionStore } from '../store/sessionStore';
import { useVoiceMode } from '../hooks/useVoiceMode';
import type { TurnPhase, ContextType } from '../types';

interface Props {
  onNextTurn: () => void;
}

const PHASE_LABELS: Record<TurnPhase, string> = {
  awaiting_english: '等待英语输入',
  awaiting_japanese: '等待日语输入',
  evaluating: 'AI 评估中…',
  feedback: '反馈就绪',
  meta_dialog: '元对话中',
};

const CONTEXT_LABELS: Record<ContextType, string> = {
  free_chat: '自由聊天',
  roleplay: '角色扮演',
  topic_discussion: '主题讨论',
};

function VolumeBar({ level }: { level: number }) {
  const bars = 5;
  const active = Math.round(level * bars);
  return (
    <div className="flex items-end gap-0.5" aria-label={`音量 ${Math.round(level * 100)}%`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-sm transition-all ${
            i < active
              ? i < bars - 1 ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'
              : 'bg-[var(--border-strong)]'
          }`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </div>
  );
}

function AiSoundWave() {
  return (
    <div className="flex h-3 items-end gap-0.5" aria-label="AI 正在说话" role="status">
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className="ai-sound-wave-bar w-0.5 rounded-full bg-[var(--accent)]"
          style={{ height: '100%' }}
        />
      ))}
    </div>
  );
}

/**
 * 底栏:状态指示 + 会话信息 + 录音/停止按钮。
 * 语音模式开关已移至 TrainingView 的分段控件。
 */
export function StatusBar({ onNextTurn }: Props) {
  const session = useSessionStore((s) => s.currentSession);
  const currentTurn = useSessionStore((s) => s.currentTurn);
  const isProcessing = useSessionStore((s) => s.isProcessing);
  const error = useSessionStore((s) => s.error);
  const isSafeMode = useSessionStore((s) => s.isSafeMode);
  const phase = currentTurn?.phase ?? null;

  const {
    isVoiceMode,
    isRecording,
    isAiSpeaking,
    isInterruptible,
    volumeLevel,
    startRecording,
    cancelRecording,
    stopSpeaking,
  } = useVoiceMode();

  const canRecord =
    isVoiceMode && !isProcessing && !isAiSpeaking &&
    (phase === 'awaiting_english' || phase === 'awaiting_japanese' || phase === 'meta_dialog');

  const handleRecordClick = () => {
    if (isRecording) {
      cancelRecording();
    } else if (canRecord) {
      void startRecording();
    }
  };

  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-1.5 text-sm">
      {/* 状态指示灯 */}
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <span
          className={`h-2 w-2 rounded-full ${
            isProcessing ? 'animate-pulse bg-[var(--amber)]'
            : isRecording ? 'bg-[var(--rose)] rec-pulse-dot'
            : isAiSpeaking ? 'animate-pulse bg-[var(--accent)]'
            : phase ? 'bg-[var(--emerald)]'
            : 'bg-[var(--border-strong)]'
          }`}
        />
        <span className="text-xs">
          {isProcessing ? '处理中…'
          : isRecording ? '录音中…'
          : isAiSpeaking ? (isInterruptible ? 'AI 说话中(说话可打断)' : 'AI 说话中…')
          : phase ? PHASE_LABELS[phase]
          : '空闲'}
        </span>
        {isAiSpeaking && <AiSoundWave />}
        {isRecording && <VolumeBar level={volumeLevel} />}
      </div>

      {/* 会话信息 */}
      {session && (
        <div className="text-xs text-[var(--text-tertiary)]">
          {CONTEXT_LABELS[session.contextType]} · EN: {session.englishDifficulty} | JA: {session.japaneseDifficulty}
        </div>
      )}

      {/* 安全模式 */}
      {isSafeMode && (
        <div className="rounded border border-[var(--amber)]/30 bg-[var(--amber-bg)] px-2 py-0.5 text-xs text-[var(--amber)]">
          安全模式(说「继续练习」恢复)
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="truncate text-xs text-[var(--rose)]" title={error}>
          {error}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* AI 停止朗读 */}
        {isAiSpeaking && (
          <button
            onClick={stopSpeaking}
            className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-bg)] px-2.5 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]"
          >
            停止朗读
          </button>
        )}

        {/* 录音按钮(仅语音模式) */}
        {isVoiceMode && (
          <button
            onClick={handleRecordClick}
            disabled={!canRecord && !isRecording}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isRecording
                ? 'border-[var(--rose)]/40 bg-[var(--rose-light)] text-[var(--rose)]'
                : 'border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--rose)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--rose)]" />
                </span>
                <span>停止</span>
                <VolumeBar level={volumeLevel} />
              </>
            ) : (
              <>
                <span className="text-sm">●</span>
                <span>录音</span>
              </>
            )}
          </button>
        )}

        {/* 下一回合 */}
        {phase === 'feedback' && (
          <button
            onClick={onNextTurn}
            disabled={isProcessing}
            className="rounded-md bg-[var(--accent)] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            下一回合
          </button>
        )}
      </div>
    </footer>
  );
}
