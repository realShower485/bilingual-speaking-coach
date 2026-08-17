import type {
  ContextType,
  EnglishDifficulty,
  ErrorWord,
  Feedback,
  JapaneseDifficulty,
  PronunciationTip,
  ReusableMaterial,
} from '../types';

// =====================================================================
// LLM JSON 输出格式定义
// =====================================================================

/** 对话伙伴(conversation_partner)的 JSON 输出 */
export interface ConversationPartnerOutput {
  /** 情境描述(中文为主,可辅以英日关键词) */
  context: string;
  /** 待表达的核心意思,英日两版语义一致 */
  targetMeaning: {
    en: string;
    ja: string;
  };
}

/** 评估者(evaluator)的 JSON 输出(errorWords 为最小集,由系统补全持久化字段) */
export interface EvaluatorOutput {
  semanticConsistency: boolean;
  englishFeedback: string;
  japaneseFeedback: string;
  crossLanguageNotes: string;
  englishTips: PronunciationTip[];
  japaneseTips: PronunciationTip[];
  optimalEnglish?: string;
  optimalJapanese?: string;
  outcomeSummaryZh?: string;
  errorWords: Array<{
    word: string;
    language: 'en' | 'ja';
    explanation: string;
  }>;
}

/** 独立材料生成器输出。只接收连续三回合，不承担纠错职责。 */
export interface MaterialGenerationOutput {
  suitable: boolean;
  unsuitableReasonZh: string;
  titleZh: string;
  situationZh: string;
  form: 'dialogue' | 'narration';
  sections: Array<Omit<ReusableMaterial['sections'][number], 'index'>>;
  fullEnglish: string;
  fullJapanese: string;
  expressions: ReusableMaterial['expressions'];
  learnerNotesZh: string;
}

/** 元对话者(meta_dialog)的 JSON 输出 */
export interface MetaDialogOutput {
  /** 回应正文:目标语言(英或日),或安全词触发后的中文 */
  response: string;
  /** 可选;中文文本注释,仅显示不朗读;无则留空字符串 */
  noteZh: string;
  /** 是否因安全词将语言切换为中文 */
  switchedToZh: boolean;
}

/** 难度调节器的 JSON 输出 */
export interface DifficultyAdjustmentOutput {
  shouldAdjust: boolean;
  newDifficulty: string;
  reason: string;
}

// =====================================================================
// 辅助:评估者输出转换
// =====================================================================

/** 将评估者输出转换为可持久化的 Feedback(补全 errorWords 的统计字段)。 */
export function toFeedback(output: EvaluatorOutput, now: number = Date.now()): Feedback {
  const errorWords: ErrorWord[] = output.errorWords.map((e) => ({
    word: e.word,
    language: e.language,
    explanation: e.explanation,
    count: 1,
    firstSeenAt: now,
    lastExplanation: e.explanation,
  }));
  return {
    semanticConsistency: output.semanticConsistency,
    englishFeedback: output.englishFeedback,
    japaneseFeedback: output.japaneseFeedback,
    crossLanguageNotes: output.crossLanguageNotes,
    englishTips: output.englishTips,
    japaneseTips: output.japaneseTips,
    errorWords,
    optimalEnglish: output.optimalEnglish?.trim() || undefined,
    optimalJapanese: output.optimalJapanese?.trim() || undefined,
    outcomeSummaryZh: output.outcomeSummaryZh?.trim() || undefined,
  };
}

// =====================================================================
// 角色 1:对话伙伴 conversation_partner
// =====================================================================

export interface ConversationPartnerParams {
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  /** 角色扮演场景标题/描述(roleplay 时必填) */
  scenario?: string;
  /** 主题讨论主题(topic_discussion 时必填) */
  topic?: string;
  /** 近期回合(用于 free_chat 延展话题) */
  recentTurns?: ReadonlyArray<{ english: string; japanese: string }>;
  /** 双语表达顺序 */
  languageOrder: 'en-ja' | 'ja-en';
}

export function buildConversationPartnerSystemPrompt(): string {
  return `你是"双语并行口语训练"应用中的【对话伙伴】(conversation_partner)。
你的职责是为学习者构造情境,并引导其用英语与日语表达同一意思,从而在两种语言间建立直接语义映射(绕过母语翻译)。

# 核心规则
1. 每回合你只给出"情境 + 待表达的核心意思(target_meaning)",由用户去产出英语和日语句子。不要替用户说出完整目标句或范文。
2. targetMeaning 必须同时给出英语与日语两个版本,二者语义一致;它们是"待表达意思的说明",不是让用户照念的句子。
3. 英语与日语有各自独立的难度等级,分别作用于对应语言的 targetMeaning 句式复杂度与词汇选择。
4. 根据情境类型调整风格:
   - free_chat:不预设固定主题,基于上一回合自然延展,贴近日常生活。
   - roleplay:你扮演指定场景中的 NPC,从该角色视角提出需要用户表达的意思(例如店员对顾客说的话、面试官的提问)。
   - topic_discussion:围绕指定主题提出一个观点/论点/问题,让用户用双语表达立场或回应。
5. 双语表达顺序由 languageOrder 决定(en-ja 先英后日,ja-en 先日后英),你应在 context 中提示用户先表达哪一种。
6. 不要给出答案或示范句;若用户卡住,由系统另行请求 hint,不属于你的输出范围。
7. 内容须适合一般学习者,避免敏感、政治、成人内容。

# 难度体系(英语与日语独立)
- 英语采用 CEFR:A2 → B1 → B2 → C1。
- 日语采用 JLPT:N5 → N4 → N3 → N2 → N1。
- 两语言的难度独立设定,无需近似对应。某一语言难度为 auto 时,根据 recentTurns 中该语言的表达推断合适层级。

# 输出格式(严格 JSON,不要 Markdown 代码块,不要 JSON 以外的任何文字)
{
  "context": "情境描述(中文为主,可辅以英日关键词,1-3 句)",
  "targetMeaning": {
    "en": "待表达意思的英语说明",
    "ja": "待表达意思的日语说明"
  }
}`;
}

export function buildConversationPartnerUserPrompt(p: ConversationPartnerParams): string {
  const orderText =
    p.languageOrder === 'en-ja' ? '先英语,后日语' : '先日语,后英语';
  const typeText =
    p.contextType === 'free_chat'
      ? '自由聊天:基于近期回合自然延展话题。'
      : p.contextType === 'roleplay'
        ? `角色扮演:场景为「${p.scenario ?? '未指定'}」,你扮演该场景的 NPC。`
        : `主题讨论:主题为「${p.topic ?? '未指定'}」,围绕该主题提出需表达的观点或问题。`;

  const recentText =
    p.recentTurns && p.recentTurns.length > 0
      ? p.recentTurns
          .map(
            (t, i) =>
              `第${i + 1}回合 EN: ${t.english} / JA: ${t.japanese}`,
          )
          .join('\n')
      : '这是第一回合,无历史。';

  return `请给出下一回合的情境与待表达意思。

情境类型:${typeText}
英语表达难度:${p.englishDifficulty}(CEFR,auto 表示由你依据历史推断)
日语表达难度:${p.japaneseDifficulty}(JLPT,auto 表示由你依据历史推断)
表达顺序:${orderText}
近期回合:
${recentText}

请按指定 JSON 格式输出。`;
}

// =====================================================================
// 角色 2:评估者 evaluator
// =====================================================================

export interface EvaluatorParams {
  /** AI 给出的情境与待表达意思 */
  context: string;
  /** 用户的英语表达 */
  englishInput: string;
  /** 用户的日语表达 */
  japaneseInput: string;
  /** 当前英语难度等级(用于判断英语期望水平) */
  englishDifficulty: EnglishDifficulty;
  /** 当前日语难度等级(用于判断日语期望水平) */
  japaneseDifficulty: JapaneseDifficulty;
}

export function buildEvaluatorSystemPrompt(): string {
  return `你是"双语并行口语训练"应用中的【评估者】(evaluator)。
你的职责是对照评估用户在同一情境下用英语和日语表达的两句话:判断二者是否传达同一语义,分别给出反馈,最后提供跨语言对照说明。

# 评估要求
1. semanticConsistency:判断英语与日语两句话是否传达同一核心语义(允许表达方式不同,但意思应一致),true/false。
2. englishFeedback:针对英语表达的语法、用词、地道度给出具体反馈,指出问题并给改进建议。必须只用自然英语输出，便于英语语音直接朗读。不要打分。
3. japaneseFeedback:针对日语表达的语法、用词、敬语/礼貌层级、地道度给出反馈。必须只用自然日语输出，便于日语语音直接朗读。不要打分。
4. crossLanguageNotes:用中文写跨语言对照。可涉及:同源词/外来语(如 latte ↔ ラテ)、表达习惯差异(如英语 I'd like ↔ 日语 お願いします 的礼貌层级)、文化差异等。
5. englishTips:从该回合英语表达中选 0-3 个对学习者而言易错或值得注意的词,给出 IPA 音标与重音位置(如重音在第几音节)。仅文本提示,不打分。
6. japaneseTips:从该回合日语表达中选 0-3 个易错/值得注意的词,给出假名标注与音调(头高型/中高型/平板型等)。仅文本提示,不打分。
7. errorWords:标记 1-3 个该回合中真正出错的词;若该回合确实没有错误,可返回空数组。每项含 word、language('en' 或 'ja')、explanation(为何错/正确用法)。
8. optimalEnglish:给出与本回合情境完全对应、自然且适合当前英语难度的一句最佳英语表达。只输出英文句子，不要解释。
9. optimalJapanese:给出与同一情境完全对应、自然且适合当前日语难度的一句最佳日语表达。只输出日语句子，不要解释。
10. outcomeSummaryZh:用中文写 1-2 句总结，说明这两个最佳表达最值得记住的用法或差异。

# 约束
- 不要输出任何评分数字。
- 不要输出 JSON 以外的任何内容,不要使用 Markdown 代码块。

# 输出格式(严格 JSON)
{
  "semanticConsistency": true,
  "englishFeedback": "...",
  "japaneseFeedback": "...",
  "crossLanguageNotes": "...",
  "optimalEnglish": "...",
  "optimalJapanese": "...",
  "outcomeSummaryZh": "...",
  "englishTips": [{"word":"...","ipa":"...","stress":"..."}],
  "japaneseTips": [{"word":"...","kana":"...","pitch":"..."}],
  "errorWords": [{"word":"...","language":"en","explanation":"..."}]
}`;
}

export function buildEvaluatorUserPrompt(p: EvaluatorParams): string {
  return `请评估以下双语表达。

情境(情境与待表达意思):
${p.context}

用户英语表达:
${p.englishInput}

用户日语表达:
${p.japaneseInput}

当前英语难度等级:${p.englishDifficulty}(CEFR)
当前日语难度等级:${p.japaneseDifficulty}(JLPT)

请按指定 JSON 格式输出。`;
}

// =====================================================================
// 独立材料生成器：只负责把三回合整理成可复习材料
// =====================================================================

export interface MaterialGenerationParams {
  contextType: ContextType;
  scenario?: string;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  turns: Array<{
    context: string;
    english: string;
    japanese: string;
  }>;
}

export function buildMaterialGenerationSystemPrompt(): string {
  return `你是“英日双语口语训练”中的【复习材料编辑】。你只负责将学习者已经完成的连续三段表达编辑为可重复练习的标准双语材料；你不负责逐句纠错、打分或教学。

# 首要原则
1. 输入必须恰好有三回合。三回合若不能构成同一话题的“进入 → 展开 → 收束”路线，suitable 必须为 false，说明原因，其他文本字段输出空字符串或空数组；绝不强行拼接，更不能编造故事。
2. suitable 为 true 时，必须忠实保留用户已经表达的关键事实、态度、人物和意图。可以润色自然度、补足必要连接词，但不得加入用户没有表达过的重要经历、观点、承诺、时间、数字或人物。
3. sections 必须严格有 3 项，顺序对应进入话题、展开内容、回应收束。每项英文只能是英语，日文只能是自然日语。
4. fullEnglish 与 fullJapanese 必须分别是把三节自然连成完整、可直接朗读的版本；不能是反馈、提纲、说明或逐字翻译。
5. expressions 仅选 3-5 个确实出现在最终稿中的高复用表达；replaceablePart 只写可替换槽位，没有则空字符串。
6. learnerNotesZh 只写 2-3 条值得复习的中文要点，不重复纠错细节。

# 输出格式
严格 JSON，不要 Markdown，不要任何额外文字：
{
  "suitable": true,
  "unsuitableReasonZh": "",
  "titleZh": "...",
  "situationZh": "...",
  "form": "dialogue",
  "sections": [
    {"titleZh":"...","purposeZh":"...","chineseRoute":"...","english":"...","japanese":"..."},
    {"titleZh":"...","purposeZh":"...","chineseRoute":"...","english":"...","japanese":"..."},
    {"titleZh":"...","purposeZh":"...","chineseRoute":"...","english":"...","japanese":"..."}
  ],
  "fullEnglish": "...",
  "fullJapanese": "...",
  "expressions": [{"meaningZh":"...","english":"...","japanese":"...","replaceablePart":"..."}],
  "learnerNotesZh": "..."
}`;
}

export function buildMaterialGenerationUserPrompt(p: MaterialGenerationParams): string {
  const turns = p.turns.map((turn, index) => `第${index + 1}回合
情境：${turn.context}
学习者英语：${turn.english}
学习者日语：${turn.japanese}`).join('\n\n');

  return `请把以下三回合整理为可直接用于语音复习的双语材料。

训练类型：${p.contextType}
选择的场景或话题：${p.scenario ?? '未指定'}
英语难度：${p.englishDifficulty}
日语难度：${p.japaneseDifficulty}

${turns}

先判断三回合是否真的连续、能否忠实整理；然后按 JSON 格式输出。`;
}

// =====================================================================
// 角色 3:元对话者 meta_dialog
// =====================================================================

export interface MetaDialogParams {
  /** 用户的元对话发言 */
  userMessage: string;
  /** 上一回合主要训练语言(无法判断讨论哪种语言时作为默认) */
  recentLang?: 'en' | 'ja';
  /** 安全词(命中则切换中文) */
  safeWord: string;
  /** 上一回合的英语表达(可选上下文) */
  lastEnglish?: string;
  /** 上一回合的日语表达(可选上下文) */
  lastJapanese?: string;
}

export function buildMetaDialogSystemPrompt(): string {
  return `你是"双语并行口语训练"应用中的【元对话者】(meta_dialog)。
"元对话"指训练之外的复盘讨论:用户就刚刚的练习提问、请求解释、讨论表达方式等。你的职责是用目标语言与用户讨论训练本身,使复盘也变成练习。

# 语言规则(重要)
1. 讨论英语相关问题时,用英语回应。
2. 讨论日语相关问题时,用日语回应。
3. 若涉及复杂概念,可在 response 之外附加 noteZh(中文文本注释);noteZh 仅作文本显示,不会被语音朗读。
4. 若用户说出安全词(由系统在输入中提供),立即将回应语言切换为中文:把 switchedToZh 设为 true,response 用中文。直到用户说"继续练习"才恢复目标语言训练。
5. 无法判断讨论的是哪种语言时,默认用 recentLang 指定的语言回应。

# 风格
- 简洁、聚焦语言点,避免长篇大论。
- 鼓励用户,但不浮夸。
- 不要替用户做下一回合的情境生成(那是对话伙伴的职责)。

# 输出格式(严格 JSON,不要 Markdown 代码块,不要 JSON 以外内容)
{
  "response": "回应正文(目标语言,或安全词触发后的中文)",
  "noteZh": "可选;中文文本注释,仅显示不朗读;无则留空字符串",
  "switchedToZh": false
}`;
}

export function buildMetaDialogUserPrompt(p: MetaDialogParams): string {
  const lastEnText = p.lastEnglish ? `上一回合英语表达:${p.lastEnglish}` : '上一回合英语表达:无';
  const lastJaText = p.lastJapanese ? `上一回合日语表达:${p.lastJapanese}` : '上一回合日语表达:无';
  const recentLangText = p.recentLang ?? 'en';
  return `用户发言:
${p.userMessage}

安全词:${p.safeWord}(命中则切换中文)
默认语言(无法判断时使用):${recentLangText}
${lastEnText}
${lastJaText}

请按指定 JSON 格式输出。`;
}

// =====================================================================
// 难度调节器(针对单一语言,英/日各自独立调用)
// =====================================================================

export interface DifficultyAdjustmentParams {
  /** 被调整的语言 */
  language: 'en' | 'ja';
  /** 该语言当前的难度等级(英语 CEFR 或日语 JLPT,可为 auto) */
  currentDifficulty: EnglishDifficulty | JapaneseDifficulty;
  /** 近 5 回合该语言的表现摘要 */
  recentPerformance: ReadonlyArray<{
    semanticConsistency: boolean;
    accuracy: 'high' | 'medium' | 'low';
    vocabularyRichness: 'high' | 'medium' | 'low';
  }>;
}

export function buildDifficultyAdjustmentSystemPrompt(): string {
  return `你是"双语并行口语训练"应用中的【难度调节器】。
根据用户近 5 回合在某一语言上的表现,判断是否需要调整该语言的难度,并给出新等级与理由。
注意:你每次只调整一种语言(英语或日语),不要混用两套等级体系。

# 判断依据
- 准确度高且词汇丰富 → 可上调一级。
- 频繁出错或表达吃力 → 下调一级。
- 表现稳定 → 不调整。
- 一次只调一级,不要跳级。

# 等级阶梯(依据 language 参数)
- 英语(language=en):A2 → B1 → B2 → C1
- 日语(language=ja):N5 → N4 → N3 → N2 → N1
currentDifficulty 为 auto 时,依据 recentPerformance 为该语言选定一个起始等级。
newDifficulty 必须与 language 对应(英语给 CEFR,日语给 JLPT)。

# 输出格式(严格 JSON,不要 Markdown 代码块,不要 JSON 以外内容)
{
  "shouldAdjust": true,
  "newDifficulty": "B2",
  "reason": "近 5 回语义一致率高且用词多样,可上调一级"
}
shouldAdjust 为 false 时,newDifficulty 应等于 currentDifficulty(或依据 auto 选定的等级),reason 说明为何不调整。`;
}

export function buildDifficultyAdjustmentUserPrompt(
  p: DifficultyAdjustmentParams,
): string {
  const langName = p.language === 'en' ? '英语' : '日语';
  const ladder =
    p.language === 'en'
      ? '英语阶梯(CEFR):A2 → B1 → B2 → C1'
      : '日语阶梯(JLPT):N5 → N4 → N3 → N2 → N1';

  const perfText =
    p.recentPerformance.length > 0
      ? p.recentPerformance
          .map(
            (t, i) =>
              `第${i + 1}回 一致:${t.semanticConsistency ? '是' : '否'} / 准确度:${t.accuracy} / 词汇丰富度:${t.vocabularyRichness}`,
          )
          .join('\n')
      : '暂无近期表现数据。';

  return `请判断是否调整${langName}难度。

当前${langName}难度:${p.currentDifficulty}
${ladder}

近 5 回合${langName}表现:
${perfText}

请按指定 JSON 格式输出。`;
}
