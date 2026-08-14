import { create } from 'zustand';
import type {
  ContextType,
  EnglishDifficulty,
  Feedback,
  JapaneseDifficulty,
  Session,
  Turn,
  TurnPhase,
} from '../types';

/** 难度调整提示信息,供 UI 显示后清除。 */
export interface DifficultyAdjustmentInfo {
  /** 被调整的语言 */
  language: 'en' | 'ja';
  oldDifficulty: string;
  newDifficulty: string;
  reason: string;
}

interface SessionState {
  currentSession: Session | null;
  currentTurn: Turn | null;
  currentFeedback: Feedback | null;
  currentContext: string;
  isProcessing: boolean;
  error: string | null;
  isRecording: boolean;
  isAiSpeaking: boolean;
  /** AI 说话时是否可被打断(语音模式开启后由 useVoiceMode 维护)。 */
  isInterruptible: boolean;
  /** 进入元对话前的回合阶段,用于退出元对话时恢复。 */
  previousPhase: TurnPhase | null;
  /** 使用过提示的回合 id 列表,这些回合不计入有效练习统计。 */
  hintedTurnIds: string[];
  /** 最近一次难度调整信息,供 UI 层提示用户;显示后应调用 clearDifficultyAdjustment 清除。 */
  lastDifficultyAdjustment: DifficultyAdjustmentInfo | null;
  /** 安全模式:命中安全词后切换为中文讨论,说"继续练习"恢复。 */
  isSafeMode: boolean;

  startSession: (
    contextType: ContextType,
    englishDifficulty: EnglishDifficulty,
    japaneseDifficulty: JapaneseDifficulty,
  ) => void;
  endSession: () => void;
  startTurn: () => void;
  updateTurn: (patch: Partial<Turn>) => void;
  setTurnPhase: (phase: TurnPhase) => void;
  setRecording: (value: boolean) => void;
  setAiSpeaking: (value: boolean) => void;
  setInterruptible: (value: boolean) => void;

  setSession: (session: Session | null) => void;
  setTurn: (turn: Turn | null) => void;
  setCurrentFeedback: (fb: Feedback | null) => void;
  setCurrentContext: (ctx: string) => void;
  setProcessing: (value: boolean) => void;
  setError: (err: string | null) => void;
  enterMetaDialog: () => void;
  exitMetaDialog: () => void;
  markCurrentTurnHinted: () => void;
  /** 设置难度调整提示信息(由 training.checkAutoDifficulty 调用)。 */
  setDifficultyAdjustment: (info: DifficultyAdjustmentInfo) => void;
  /** 清除难度调整提示信息(由 UI 层在显示后调用)。 */
  clearDifficultyAdjustment: () => void;
  /** 进入安全模式(命中安全词后由 training 层调用)。 */
  setSafeMode: (value: boolean) => void;
  reset: () => void;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSession: null,
  currentTurn: null,
  currentFeedback: null,
  currentContext: '',
  isProcessing: false,
  error: null,
  isRecording: false,
  isAiSpeaking: false,
  isInterruptible: false,
  previousPhase: null,
  hintedTurnIds: [],
  lastDifficultyAdjustment: null,
  isSafeMode: false,

  startSession: (contextType, englishDifficulty, japaneseDifficulty) => {
    const session: Session = {
      id: createId(),
      contextType,
      englishDifficulty,
      japaneseDifficulty,
      autoEnglishDifficulty: englishDifficulty === 'auto',
      autoJapaneseDifficulty: japaneseDifficulty === 'auto',
      turns: [],
      startedAt: Date.now(),
    };
    set({
      currentSession: session,
      currentTurn: null,
      currentFeedback: null,
      currentContext: '',
      error: null,
      previousPhase: null,
      hintedTurnIds: [],
      lastDifficultyAdjustment: null,
      isSafeMode: false,
    });
  },

  endSession: () => {
    const session = get().currentSession;
    if (!session) return;
    set({
      currentSession: { ...session, endedAt: Date.now() },
      currentTurn: null,
      currentFeedback: null,
      currentContext: '',
      isRecording: false,
      isAiSpeaking: false,
      isInterruptible: false,
      previousPhase: null,
      isSafeMode: false,
    });
  },

  startTurn: () => {
    const session = get().currentSession;
    if (!session) return;
    const turn: Turn = {
      id: createId(),
      sessionId: session.id,
      phase: 'awaiting_english',
      contextGiven: '',
      englishInput: '',
      japaneseInput: '',
      feedback: null,
      createdAt: Date.now(),
    };
    set({
      currentTurn: turn,
      currentFeedback: null,
      currentContext: '',
      previousPhase: null,
      currentSession: { ...session, turns: [...session.turns, turn] },
    });
  },

  updateTurn: (patch) => {
    const turn = get().currentTurn;
    const session = get().currentSession;
    if (!turn || !session) return;
    const nextTurn = { ...turn, ...patch };
    set({
      currentTurn: nextTurn,
      currentSession: {
        ...session,
        turns: session.turns.map((t) => (t.id === turn.id ? nextTurn : t)),
      },
    });
  },

  setTurnPhase: (phase) => {
    get().updateTurn({ phase });
  },

  setRecording: (value) => set({ isRecording: value }),

  setAiSpeaking: (value) => set({ isAiSpeaking: value }),

  setInterruptible: (value) => set({ isInterruptible: value }),

  setSession: (session) => set({ currentSession: session }),

  setTurn: (turn) => set({ currentTurn: turn, previousPhase: null }),

  setCurrentFeedback: (fb) => set({ currentFeedback: fb }),

  setCurrentContext: (ctx) => set({ currentContext: ctx }),

  setProcessing: (value) => set({ isProcessing: value }),

  setError: (err) => set({ error: err }),

  enterMetaDialog: () => {
    const turn = get().currentTurn;
    if (!turn) return;
    if (turn.phase === 'meta_dialog') return;
    set({ previousPhase: turn.phase });
    get().updateTurn({ phase: 'meta_dialog' });
  },

  exitMetaDialog: () => {
    const prev = get().previousPhase;
    if (!prev) return;
    get().updateTurn({ phase: prev });
    set({ previousPhase: null });
  },

  markCurrentTurnHinted: () => {
    const turn = get().currentTurn;
    if (!turn) return;
    if (get().hintedTurnIds.includes(turn.id)) return;
    set({ hintedTurnIds: [...get().hintedTurnIds, turn.id] });
  },

  setDifficultyAdjustment: (info) => set({ lastDifficultyAdjustment: info }),

  clearDifficultyAdjustment: () => set({ lastDifficultyAdjustment: null }),

  setSafeMode: (value) => set({ isSafeMode: value }),

  reset: () => {
    set({
      currentSession: null,
      currentTurn: null,
      currentFeedback: null,
      currentContext: '',
      isProcessing: false,
      error: null,
      isRecording: false,
      isAiSpeaking: false,
      isInterruptible: false,
      previousPhase: null,
      hintedTurnIds: [],
      lastDifficultyAdjustment: null,
      isSafeMode: false,
    });
  },
}));
