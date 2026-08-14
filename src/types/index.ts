// 会话情境类型
export type ContextType = 'free_chat' | 'roleplay' | 'topic_discussion';

// 难度等级
export type EnglishLevel = 'A2' | 'B1' | 'B2' | 'C1'; // CEFR
export type JapaneseLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'; // JLPT
// 英语/日语各自独立的难度(含 auto 自动调整)
export type EnglishDifficulty = EnglishLevel | 'auto';
export type JapaneseDifficulty = JapaneseLevel | 'auto';

// 训练回合中的语言阶段
export type TurnPhase =
  | 'awaiting_english'
  | 'awaiting_japanese'
  | 'evaluating'
  | 'feedback'
  | 'meta_dialog';

// 发音提示
export interface PronunciationTip {
  word: string;
  ipa?: string; // 英语:IPA 音标
  stress?: string; // 英语:重音位置
  kana?: string; // 日语:假名标注
  pitch?: string; // 日语:音调(头高型/平板型等)
}

// 易错词
export interface ErrorWord {
  word: string;
  language: 'en' | 'ja';
  explanation: string;
  count: number;
  firstSeenAt: number;
  lastExplanation: string;
}

// AI 反馈
export interface Feedback {
  semanticConsistency: boolean; // 两种表达是否语义一致
  englishFeedback: string; // 英语反馈
  japaneseFeedback: string; // 日语反馈
  crossLanguageNotes: string; // 跨语言对照说明
  englishTips: PronunciationTip[]; // 英语发音小贴士
  japaneseTips: PronunciationTip[]; // 日语发音小贴士
  errorWords: ErrorWord[]; // 易错词
}

// 训练回合
export interface Turn {
  id: string;
  sessionId: string;
  phase: TurnPhase;
  contextGiven: string; // AI 给出的情境/待表达意思
  englishInput: string; // 用户的英语表达
  japaneseInput: string; // 用户的日语表达
  feedback: Feedback | null; // AI 评估结果
  createdAt: number;
}

// 会话
export interface Session {
  id: string;
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty; // 英语难度(CEFR 或 auto)
  japaneseDifficulty: JapaneseDifficulty; // 日语难度(JLPT 或 auto)
  autoEnglishDifficulty: boolean; // 英语是否自动调整
  autoJapaneseDifficulty: boolean; // 日语是否自动调整
  scenario?: string; // 角色扮演场景或主题讨论主题
  turns: Turn[];
  startedAt: number;
  endedAt?: number;
}

// 难度调整历史
export interface DifficultyHistory {
  id: string;
  sessionId: string;
  oldDifficulty: string | null;
  newDifficulty: string;
  reason: string;
  adjustedAt: number;
}

// 设置
export interface AppSettings {
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl?: string; // LLM 基础 URL(高级选项,留空则按模型名自动推断)
  sttApiKey: string;
  sttProvider: 'whisper' | 'azure' | 'siliconflow';
  sttLanguage?: string; // STT 语言偏好(如 en/ja/auto),留空表示自动
  sttBaseUrl?: string; // STT API base URL(留空用默认)
  sttModel?: string; // STT 模型名(留空用默认 whisper-1)
  ttsApiKey: string;
  ttsProvider: 'azure' | 'openai' | 'siliconflow';
  ttsBaseUrl?: string; // TTS API base URL(留空用默认)
  ttsModel?: string; // TTS 模型名(留空用默认 tts-1)
  ttsVoice?: string; // 音色(OpenAI: alloy/echo/fable/onyx/nova/shimmer;硅基流动可填音色 ID 或留空)
  ttsRate?: number; // TTS 语速(0.5 ~ 2.0,默认 1.0)
  dbPath: string; // SQLite 文件路径
  safeWord: string; // 安全词,默认"救命"
  targetLanguageOrder: 'en-ja' | 'ja-en'; // 双语表达顺序
}

// ===== LLM 多角色与内置库 =====

// LLM 角色
export type LLMRole = 'conversation_partner' | 'evaluator' | 'meta_dialog';

// 三语文本(中/英/日)
export interface TrilingualText {
  zh: string;
  en: string;
  ja: string;
}

// 角色扮演场景
// id 约定:内置场景使用 snake_case 标识(如 'ordering_food');
//         自定义场景使用前缀 'custom_scenario_' + UUID(见 contextManager)。
export interface ScenarioItem {
  id: string;
  title: TrilingualText;
  description: TrilingualText;
  npcRole: string; // NPC 角色描述(可用中文);自定义场景无 NPC 时为空字符串
}

// 角色扮演场景库
export interface ScenarioLibrary {
  scenarios: ScenarioItem[];
}

// 主题讨论条目
// id 约定:内置主题使用 snake_case 标识(如 'technology');
//         自定义主题使用前缀 'custom_topic_' + UUID(见 contextManager)。
export interface TopicItem {
  id: string;
  title: TrilingualText;
  description: TrilingualText;
  sampleQuestions: PhrasebookEntry[]; // 示例问题英日对照;无则为空数组
}

// 主题讨论库
export interface TopicLibrary {
  topics: TopicItem[];
}

// 常用句手册条目(英日对照)
export interface PhrasebookEntry {
  en: string;
  ja: string;
}

// 常用句手册分类
export interface PhrasebookCategory {
  id: string;
  title: TrilingualText;
  phrases: PhrasebookEntry[];
}

// ===== 情境管理辅助类型 =====

/** 待新建的场景(尚未生成 id),用于 contextManager.addCustomScenario。 */
export type NewScenarioItem = Omit<ScenarioItem, 'id'>;

/** 待新建的主题(尚未生成 id),用于 contextManager.addCustomTopic。 */
export type NewTopicItem = Omit<TopicItem, 'id'>;
