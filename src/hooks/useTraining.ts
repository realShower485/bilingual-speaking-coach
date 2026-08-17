import { useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';
import type {
  ContextType,
  EnglishDifficulty,
  Feedback,
  JapaneseDifficulty,
  ReusableMaterial,
  Session,
  Turn,
  TurnPhase,
} from '../types';
import type { MetaDialogOutput } from '../services/prompts';
import {
  detectSafeWord,
  endCurrentSession,
  enterMetaDialog,
  evaluateCurrentTurn,
  exitMetaDialog,
  exitSafeMode,
  isResumePhrase,
  requestHint,
  startNewSession,
  startNewTurn,
  startPostFeedbackReview,
  createCurrentSessionMaterial,
  submitEnglishInput,
  submitJapaneseInput,
} from '../services/training';

export function useTraining() {
  const session = useSessionStore((s) => s.currentSession);
  const currentTurn = useSessionStore((s) => s.currentTurn);
  const currentFeedback = useSessionStore((s) => s.currentFeedback);
  const currentContext = useSessionStore((s) => s.currentContext);
  const isProcessing = useSessionStore((s) => s.isProcessing);
  const error = useSessionStore((s) => s.error);
  const isSafeMode = useSessionStore((s) => s.isSafeMode);

  /** 当前回合阶段(getter)。 */
  const turnPhase: TurnPhase | null = currentTurn?.phase ?? null;

  const startSession = useCallback(
    (params: {
      contextType: ContextType;
      englishDifficulty: EnglishDifficulty;
      japaneseDifficulty: JapaneseDifficulty;
      scenario?: string;
    }): Promise<Session> => startNewSession(params),
    [],
  );

  const startTurn = useCallback((): Promise<Turn> => startNewTurn(), []);

  const submitEnglish = useCallback(
    (text: string): Promise<void> => submitEnglishInput(text),
    [],
  );

  const submitJapanese = useCallback(
    (text: string): Promise<void> => submitJapaneseInput(text),
    [],
  );

  const evaluate = useCallback((): Promise<Feedback> => evaluateCurrentTurn(), []);

  const requestHintAction = useCallback((): Promise<string> => requestHint(), []);

  const enterMeta = useCallback(
    (userMessage: string): Promise<MetaDialogOutput> => enterMetaDialog(userMessage),
    [],
  );

  const exitMeta = useCallback((): void => exitMetaDialog(), []);

  const startPostFeedback = useCallback((): void => startPostFeedbackReview(), []);

  const createMaterial = useCallback((): Promise<ReusableMaterial> => createCurrentSessionMaterial(), []);

  const endSession = useCallback((): Promise<void> => endCurrentSession(), []);

  const checkSafeWord = useCallback(
    (input: string, safeWord: string): boolean => detectSafeWord(input, safeWord),
    [],
  );

  const checkResume = useCallback(
    (input: string): boolean => isResumePhrase(input),
    [],
  );

  const exitSafe = useCallback((): void => exitSafeMode(), []);

  return {
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
    evaluate,
    requestHint: requestHintAction,
    enterMetaDialog: enterMeta,
    exitMetaDialog: exitMeta,
    startPostFeedbackReview: startPostFeedback,
    createCurrentSessionMaterial: createMaterial,
    endSession,
    checkSafeWord,
    checkResume,
    exitSafeMode: exitSafe,
  };
}
