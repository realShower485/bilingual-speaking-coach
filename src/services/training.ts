import type {
  ContextType,
  EnglishDifficulty,
  Feedback,
  JapaneseDifficulty,
  Session,
  Turn,
  TurnPhase,
} from '../types';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import * as db from './db';
import {
  adjustDifficulty,
  evaluateTurn,
  generateContext,
  metaDialog,
} from './llm';
import type { MetaDialogOutput } from './prompts';

// =====================================================================
// 内部工具
// =====================================================================

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStore() {
  return useSessionStore.getState();
}

function getSettings() {
  return useSettingsStore.getState().settings;
}

/** 当前期望的第一语言输入阶段(依据设置中的双语顺序)。 */
function firstInputPhase(): TurnPhase {
  return getSettings().targetLanguageOrder === 'ja-en'
    ? 'awaiting_japanese'
    : 'awaiting_english';
}

/** 将当前 turn 同步写入数据库(失败不阻塞流程)。 */
async function persistTurn(turn: Turn): Promise<void> {
  try {
    await db.updateTurn(turn);
  } catch (e) {
    console.error('[training] turn 持久化失败(不阻塞):', e);
  }
}

function requireCurrentTurn(): Turn {
  const turn = getStore().currentTurn;
  if (!turn) {
    throw new Error('当前没有进行中的回合,请先开始新回合。');
  }
  return turn;
}

function requireCurrentSession(): Session {
  const session = getStore().currentSession;
  if (!session) {
    throw new Error('当前没有进行中的会话,请先开始新会话。');
  }
  return session;
}

function assertPhase(turn: Turn, expected: TurnPhase, action: string): void {
  if (turn.phase !== expected) {
    throw new Error(
      `非法状态转换:${action}需要阶段「${expected}」,当前为「${turn.phase}」。`,
    );
  }
}

/** 将对话伙伴输出拼合为持久化的 contextGiven 文本。 */
function buildContextGiven(output: {
  context: string;
  targetMeaning: { en: string; ja: string };
}): string {
  return `${output.context}\n\n待表达意思:\nEN: ${output.targetMeaning.en}\nJA: ${output.targetMeaning.ja}`;
}

// =====================================================================
// 安全词机制
// =====================================================================

/** 用户说出下列任一短语即视为请求恢复练习(退出安全模式)。 */
const RESUME_PHRASES = ['继续练习', '继续練習', '恢复练习', 'resume practice'];

/**
 * 在用户输入(文字或 STT 结果)中检测安全词。
 * 命中返回 true,调用方应进入安全模式而非正常提交流程。
 */
export function detectSafeWord(input: string, safeWord: string): boolean {
  if (!safeWord.trim() || !input) return false;
  return input.includes(safeWord.trim());
}

/** 检测用户是否请求恢复练习(说出"继续练习"等)。 */
export function isResumePhrase(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return RESUME_PHRASES.some((p) => trimmed.includes(p));
}

/** 退出安全模式:清除安全模式标记并退出元对话,恢复原训练阶段。 */
export function exitSafeMode(): void {
  const store = getStore();
  store.setSafeMode(false);
  store.exitMetaDialog();
}

// =====================================================================
// 启动新会话
// =====================================================================

export async function startNewSession(params: {
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  scenario?: string;
}): Promise<Session> {
  const store = getStore();
  store.setError(null);
  store.setProcessing(true);
  try {
    const session: Session = {
      id: createId(),
      contextType: params.contextType,
      englishDifficulty: params.englishDifficulty,
      japaneseDifficulty: params.japaneseDifficulty,
      autoEnglishDifficulty: params.englishDifficulty === 'auto',
      autoJapaneseDifficulty: params.japaneseDifficulty === 'auto',
      scenario: params.scenario,
      turns: [],
      startedAt: Date.now(),
    };

    // 写入 SQLite(失败不阻塞)
    try {
      await db.createSession(session);
    } catch (e) {
      console.error('[training] 会话写入数据库失败(不阻塞):', e);
    }

    // 更新 sessionStore
    store.setSession(session);
    store.setTurn(null);
    store.setCurrentFeedback(null);
    store.setCurrentContext('');
    store.setError(null);

    // 自动开始第一回合
    await startNewTurn();

    return session;
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 开始新回合(AI 给情境)
// =====================================================================

export async function startNewTurn(): Promise<Turn> {
  const store = getStore();
  const session = requireCurrentSession();

  // 状态校验:无当前回合、当前回合已完成(feedback)或处于元对话(放弃当前回合)
  const current = store.currentTurn;
  if (
    current &&
    current.phase !== 'feedback' &&
    current.phase !== 'meta_dialog'
  ) {
    throw new Error(
      `当前回合尚未完成(阶段:${current.phase}),无法开始新回合。`,
    );
  }

  store.setError(null);
  store.setProcessing(true);
  try {
    // 调用 LLM 获取情境
    const output = await generateContext({
      contextType: session.contextType,
      englishDifficulty: session.englishDifficulty,
      japaneseDifficulty: session.japaneseDifficulty,
      scenario: session.scenario,
      previousTurns: session.turns,
    });

    const contextText = buildContextGiven(output);
    const firstPhase = firstInputPhase();

    const turn: Turn = {
      id: createId(),
      sessionId: session.id,
      phase: firstPhase,
      contextGiven: contextText,
      englishInput: '',
      japaneseInput: '',
      feedback: null,
      createdAt: Date.now(),
    };

    // 写入 SQLite(失败不阻塞)
    try {
      await db.createTurn(turn);
    } catch (e) {
      console.error('[training] 回合写入数据库失败(不阻塞):', e);
    }

    // 更新 sessionStore
    const updatedSession: Session = {
      ...session,
      turns: [...session.turns, turn],
    };
    store.setSession(updatedSession);
    store.setTurn(turn);
    store.setCurrentContext(contextText);
    store.setCurrentFeedback(null);

    return turn;
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 提交英语表达
// =====================================================================

export async function submitEnglishInput(text: string): Promise<void> {
  const store = getStore();
  const turn = requireCurrentTurn();
  assertPhase(turn, 'awaiting_english', '提交英语表达');

  store.setError(null);
  store.setProcessing(true);
  try {
    const order = getSettings().targetLanguageOrder;
    // en-ja:英语是第一语言,提交后等待日语;ja-en:英语是第二语言,提交后进入评估
    const nextPhase: TurnPhase =
      order === 'en-ja' ? 'awaiting_japanese' : 'evaluating';

    store.updateTurn({ englishInput: text, phase: nextPhase });
    const updatedTurn = getStore().currentTurn!;
    await persistTurn(updatedTurn);

    if (nextPhase === 'evaluating') {
      await evaluateCurrentTurn();
    }
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 提交日语表达
// =====================================================================

export async function submitJapaneseInput(text: string): Promise<void> {
  const store = getStore();
  const turn = requireCurrentTurn();
  assertPhase(turn, 'awaiting_japanese', '提交日语表达');

  store.setError(null);
  store.setProcessing(true);
  try {
    const order = getSettings().targetLanguageOrder;
    // en-ja:日语是第二语言,提交后进入评估;ja-en:日语是第一语言,提交后等待英语
    const nextPhase: TurnPhase =
      order === 'en-ja' ? 'evaluating' : 'awaiting_english';

    store.updateTurn({ japaneseInput: text, phase: nextPhase });
    const updatedTurn = getStore().currentTurn!;
    await persistTurn(updatedTurn);

    if (nextPhase === 'evaluating') {
      await evaluateCurrentTurn();
    }
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 评估当前回合
// =====================================================================

export async function evaluateCurrentTurn(): Promise<Feedback> {
  const store = getStore();
  const turn = requireCurrentTurn();
  if (turn.phase !== 'evaluating') {
    throw new Error(
      `非法状态转换:评估需要阶段「evaluating」,当前为「${turn.phase}」。`,
    );
  }

  store.setError(null);
  store.setProcessing(true);
  try {
    const session = requireCurrentSession();
    const feedback = await evaluateTurn({
      context: turn.contextGiven,
      englishInput: turn.englishInput,
      japaneseInput: turn.japaneseInput,
      englishDifficulty: session.englishDifficulty,
      japaneseDifficulty: session.japaneseDifficulty,
    });

    // 更新 turn.feedback,phase 转为 feedback
    store.updateTurn({ feedback, phase: 'feedback' });
    store.setCurrentFeedback(feedback);
    const updatedTurn = getStore().currentTurn!;
    await persistTurn(updatedTurn);

    // 写入 error_words 表(失败不阻塞)
    for (const ew of feedback.errorWords) {
      try {
        await db.addErrorWord(ew.word, ew.language, ew.explanation);
      } catch (e) {
        console.error('[training] 易错词写入失败(不阻塞):', e);
      }
    }

    // 英日各自独立的自动难度调整:任一语言启用 auto 则触发对应检查
    if (session.autoEnglishDifficulty || session.autoJapaneseDifficulty) {
      try {
        await checkAutoDifficulty();
      } catch (e) {
        console.error('[training] 自动难度调整失败(不阻塞):', e);
      }
    }

    return feedback;
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 请求提示(hint)
// =====================================================================

export async function requestHint(): Promise<string> {
  const store = getStore();
  const turn = requireCurrentTurn();

  // 仅在输入阶段或元对话中可请求提示
  if (
    turn.phase !== 'awaiting_english' &&
    turn.phase !== 'awaiting_japanese' &&
    turn.phase !== 'meta_dialog'
  ) {
    throw new Error(`当前阶段(${turn.phase})无法请求提示。`);
  }

  store.setError(null);
  store.setProcessing(true);
  try {
    // 标记该回合不计入有效练习
    store.markCurrentTurnHinted();

    // 依据进入元对话前的阶段决定提示的目标语言
    const refPhase = store.previousPhase ?? turn.phase;
    const targetLanguage: 'en' | 'ja' =
      refPhase === 'awaiting_japanese' ? 'ja' : 'en';

    // 复用元对话角色请求当前情境下的表达示例
    const output = await metaDialog({
      userMessage: `我在这个情境下不知道用${
        targetLanguage === 'en' ? '英语' : '日语'
      }怎么说,请给我一个表达示例作为提示。情境:${turn.contextGiven}`,
      targetLanguage,
      recentTurn: turn,
    });

    return output.response;
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 反馈后的复盘问答入口
// =====================================================================

/** 只能在本回合反馈生成后进入复盘，确保流程是“反馈 → 问答 → 最佳表达”。 */
export function startPostFeedbackReview(): void {
  const store = getStore();
  const turn = requireCurrentTurn();
  if (turn.phase !== 'feedback') {
    throw new Error('请先完成本回合的双语表达并查看反馈，再进入复盘问答。');
  }
  store.enterMetaDialog();
}

// =====================================================================
// 进入元对话
// =====================================================================

export async function enterMetaDialog(
  userMessage: string,
): Promise<MetaDialogOutput> {
  const store = getStore();
  const turn = requireCurrentTurn();

  store.setError(null);
  store.setProcessing(true);
  try {
    // 记录进入元对话前的阶段(用于推断目标语言及退出时恢复)
    const originalPhase =
      turn.phase === 'meta_dialog'
        ? (store.previousPhase ?? turn.phase)
        : turn.phase;

    // 进入元对话模式(已处于 meta_dialog 时为幂等操作)
    store.enterMetaDialog();

    // 安全模式下用中文讨论;否则依据进入元对话前的阶段推断目标语言
    const targetLanguage: 'en' | 'ja' =
      store.isSafeMode || originalPhase === 'awaiting_japanese' ? 'ja' : 'en';

    const output = await metaDialog({
      userMessage,
      targetLanguage,
      recentTurn: turn,
    });

    // 若 LLM 因安全词切换中文,同步进入安全模式
    if (output.switchedToZh) {
      store.setSafeMode(true);
    }

    return output;
  } catch (e) {
    // 若刚进入元对话后 LLM 失败,回退到原阶段
    store.exitMetaDialog();
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 退出元对话(回到原阶段)
// =====================================================================

export function exitMetaDialog(): void {
  getStore().exitMetaDialog();
}

// =====================================================================
// 结束会话
// =====================================================================

export async function endCurrentSession(): Promise<void> {
  const store = getStore();
  const session = store.currentSession;
  if (!session) return;

  store.setError(null);
  store.setProcessing(true);
  try {
    const endedSession: Session = { ...session, endedAt: Date.now() };

    // 写入 SQLite(失败不阻塞)
    try {
      await db.updateSession(endedSession);
    } catch (e) {
      console.error('[training] 会话结束写入数据库失败(不阻塞):', e);
    }

    // 清空 sessionStore
    store.reset();
  } catch (e) {
    store.setError((e as Error).message);
    throw e;
  } finally {
    store.setProcessing(false);
  }
}

// =====================================================================
// 自动难度调整检查(英日各自独立)
// =====================================================================

export async function checkAutoDifficulty(): Promise<void> {
  const store = getStore();
  const session = store.currentSession;
  if (!session) return;
  if (!session.autoEnglishDifficulty && !session.autoJapaneseDifficulty) return;

  // 获取近 5 回合(排除使用提示的回合,且必须有反馈)
  const validTurns = session.turns.filter(
    (t) => !store.hintedTurnIds.includes(t.id) && t.feedback !== null,
  );
  const recentTurns = validTurns.slice(-5);

  if (recentTurns.length === 0) return;

  store.setError(null);

  // 英语自动调整
  if (session.autoEnglishDifficulty) {
    try {
      await adjustLanguageDifficulty(session, recentTurns, 'en', store);
    } catch (e) {
      console.error('[training] 英语自动难度调整失败:', e);
      store.setError((e as Error).message);
    }
  }

  // 日语自动调整(独立于英语)
  // 重新读取 session,以拿到英语调整后的最新状态
  const latestSession = store.currentSession ?? session;
  if (latestSession.autoJapaneseDifficulty) {
    try {
      await adjustLanguageDifficulty(latestSession, recentTurns, 'ja', store);
    } catch (e) {
      console.error('[training] 日语自动难度调整失败:', e);
      store.setError((e as Error).message);
    }
  }
}

/**
 * 针对单一语言执行自动难度调整。
 * language='en' 调整英语难度;language='ja' 调整日语难度。两者互不影响。
 */
async function adjustLanguageDifficulty(
  session: Session,
  recentTurns: Turn[],
  language: 'en' | 'ja',
  store: ReturnType<typeof getStore>,
): Promise<void> {
  const currentDifficulty =
    language === 'en'
      ? session.englishDifficulty
      : session.japaneseDifficulty;

  const output = await adjustDifficulty({
    language,
    currentDifficulty,
    recentTurns,
  });

  if (!output.shouldAdjust || output.newDifficulty === currentDifficulty) {
    return;
  }

  const oldDifficulty = currentDifficulty;
  const newDifficulty = output.newDifficulty;

  const updatedSession: Session =
    language === 'en'
      ? { ...session, englishDifficulty: newDifficulty as EnglishDifficulty }
      : { ...session, japaneseDifficulty: newDifficulty as JapaneseDifficulty };

  // 更新数据库(失败不阻塞)
  try {
    await db.updateSession(updatedSession);
  } catch (e) {
    console.error('[training] 难度更新写入数据库失败(不阻塞):', e);
  }

  // 记录到 difficulty_history 表
  try {
    await db.addDifficultyHistory(
      session.id,
      oldDifficulty,
      newDifficulty,
      output.reason,
    );
  } catch (e) {
    console.error('[training] 难度历史写入失败(不阻塞):', e);
  }

  // 更新 sessionStore:同步难度并设置供 UI 显示的调整提示信息
  store.setSession(updatedSession);
  store.setDifficultyAdjustment({
    language,
    oldDifficulty,
    newDifficulty,
    reason: output.reason,
  });
}
