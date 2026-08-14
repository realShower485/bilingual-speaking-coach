import type {
  DifficultyHistory,
  EnglishDifficulty,
  EnglishLevel,
  JapaneseDifficulty,
  JapaneseLevel,
} from '../types';
import * as db from './db';

// =====================================================================
// 难度等级判定
// =====================================================================

const ENGLISH_LEVELS: readonly EnglishLevel[] = ['A2', 'B1', 'B2', 'C1'];
const JAPANESE_LEVELS: readonly JapaneseLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

/** 判断是否为英语等级。 */
export function isEnglishLevel(
  level: EnglishDifficulty | string,
): level is EnglishLevel {
  return (ENGLISH_LEVELS as readonly string[]).includes(level);
}

/** 判断是否为日语等级。 */
export function isJapaneseLevel(
  level: JapaneseDifficulty | string,
): level is JapaneseLevel {
  return (JAPANESE_LEVELS as readonly string[]).includes(level);
}

// =====================================================================
// 难度等级列表与描述
// =====================================================================

export interface DifficultyOption {
  value: string;
  label: string;
  language: 'en' | 'ja' | 'auto';
}

/** 获取英语难度选项(auto + CEFR)。 */
export function getEnglishDifficulties(): DifficultyOption[] {
  return [
    { value: 'auto', label: '自动调整', language: 'auto' },
    { value: 'A2', label: 'A2 初级', language: 'en' },
    { value: 'B1', label: 'B1 中级', language: 'en' },
    { value: 'B2', label: 'B2 中高级', language: 'en' },
    { value: 'C1', label: 'C1 高级', language: 'en' },
  ];
}

/** 获取日语难度选项(auto + JLPT)。 */
export function getJapaneseDifficulties(): DifficultyOption[] {
  return [
    { value: 'auto', label: '自动调整', language: 'auto' },
    { value: 'N5', label: 'N5 入门', language: 'ja' },
    { value: 'N4', label: 'N4 初级', language: 'ja' },
    { value: 'N3', label: 'N3 中级', language: 'ja' },
    { value: 'N2', label: 'N2 中高级', language: 'ja' },
    { value: 'N1', label: 'N1 高级', language: 'ja' },
  ];
}

const ENGLISH_DIFFICULTY_DESCRIPTIONS: Record<EnglishDifficulty, string> = {
  auto: '根据近期英语表现自动调整难度(CEFR)。',
  A2: 'CEFR A2 初级:日常简单表达,词汇基础,句式简短。',
  B1: 'CEFR B1 中级:能应对旅行、工作等常见话题,叙述经历与观点。',
  B2: 'CEFR B2 中高级:能与母语者较流畅交流,能讨论抽象话题。',
  C1: 'CEFR C1 高级:能灵活高效地使用英语,适合复杂学术与专业场景。',
};

const JAPANESE_DIFFICULTY_DESCRIPTIONS: Record<JapaneseDifficulty, string> = {
  auto: '根据近期日语表现自动调整难度(JLPT)。',
  N5: 'JLPT N5 入门:能听懂基础日常日语,掌握基本句型与汉字。',
  N4: 'JLPT N4 初级:能应对日常生活的基础日语对话。',
  N3: 'JLPT N3 中级:能听懂日常场景中较为自然的日语。',
  N2: 'JLPT N2 中高级:能理解各类日常与部分抽象话题的日语。',
  N1: 'JLPT N1 高级:能理解广泛、复杂场景下的高难度日语。',
};

/** 获取某英语难度的描述。 */
export function getEnglishDifficultyDescription(
  level: EnglishDifficulty,
): string {
  return ENGLISH_DIFFICULTY_DESCRIPTIONS[level];
}

/** 获取某日语难度的描述。 */
export function getJapaneseDifficultyDescription(
  level: JapaneseDifficulty,
): string {
  return JAPANESE_DIFFICULTY_DESCRIPTIONS[level];
}

// =====================================================================
// 难度调整历史
// =====================================================================

/** 获取指定会话的难度调整历史(按调整时间升序)。 */
export async function getDifficultyHistory(
  sessionId: string,
): Promise<DifficultyHistory[]> {
  return db.getDifficultyHistory(sessionId);
}
