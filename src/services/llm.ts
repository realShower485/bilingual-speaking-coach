import type {
  AppSettings,
  ContextType,
  EnglishDifficulty,
  Feedback,
  JapaneseDifficulty,
  Turn,
} from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { httpFetch } from './httpClient';
import {
  buildConversationPartnerSystemPrompt,
  buildConversationPartnerUserPrompt,
  buildDifficultyAdjustmentSystemPrompt,
  buildDifficultyAdjustmentUserPrompt,
  buildEvaluatorSystemPrompt,
  buildEvaluatorUserPrompt,
  buildMetaDialogSystemPrompt,
  buildMetaDialogUserPrompt,
  toFeedback,
  type ConversationPartnerOutput,
  type DifficultyAdjustmentOutput,
  type EvaluatorOutput,
  type MetaDialogOutput,
} from './prompts';

// =====================================================================
// Provider 接口
// =====================================================================

interface ChatCompletionParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  /** 是否使用流式调用(若为 true,内部累积流式片段后返回完整文本)。 */
  stream?: boolean;
}

interface ChatCompletionStreamParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

interface LLMProvider {
  name: string;
  /** 调用一次对话补全,返回完整文本。 */
  chatCompletion(params: ChatCompletionParams): Promise<string>;
  /** 流式调用,逐段 yield 文本片段。 */
  chatCompletionStream(
    params: ChatCompletionStreamParams,
  ): AsyncGenerator<string>;
}

// =====================================================================
// OpenAI 兼容 Provider(兼容 GLM / DeepSeek 等 OpenAI 格式 API)
// =====================================================================

class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chatCompletion(params: ChatCompletionParams): Promise<string> {
    // 若调用方要求流式,则复用流式实现并累积为完整文本返回。
    if (params.stream) {
      let full = '';
      for await (const chunk of this.chatCompletionStream(params)) {
        full += chunk;
      }
      return full;
    }

    const res = await this.request(false, params);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LLM 响应格式异常:缺少 choices[0].message.content');
    }
    return content;
  }

  async *chatCompletionStream(
    params: ChatCompletionStreamParams,
  ): AsyncGenerator<string> {
    const res = await this.request(true, params);
    if (!res.body) {
      throw new Error('LLM 流式响应缺少响应体');
    }
    yield* parseSSEStream(res.body);
  }

  private async request(
    stream: boolean,
    params: ChatCompletionStreamParams,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await httpFetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
          temperature: params.temperature ?? 0.7,
          stream,
        }),
      });
    } catch (e) {
      throw new Error(
        `LLM 网络请求失败,请检查网络与 baseUrl 配置:${(e as Error).message}`,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `LLM 请求失败 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    return res;
  }
}

// =====================================================================
// SSE 流解析
// =====================================================================

/** 解析 `data: {...}` 格式的 SSE 流,逐段 yield delta.content;遇到 [DONE] 结束。 */
async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
        buffer = buffer.slice(newlineIdx + 1);

        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
        } catch {
          // 跳过无法解析的片段(如心跳/注释行)。
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =====================================================================
// Provider 工厂
// =====================================================================

/** 根据模型名推断 OpenAI 兼容 API 的 baseUrl。 */
export function inferBaseUrl(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('glm') || m.startsWith('chatglm')) {
    return 'https://open.bigmodel.cn/api/paas/v4';
  }
  if (m.startsWith('deepseek')) {
    return 'https://api.deepseek.com';
  }
  return 'https://api.openai.com/v1';
}

/** 根据设置创建 LLM Provider。当前默认使用 OpenAI 兼容格式。 */
export function createLLMProvider(settings: AppSettings): LLMProvider {
  if (!settings.llmApiKey) {
    throw new Error('未配置 LLM API Key,请前往「设置」页面填写后再使用。');
  }
  if (!settings.llmModel) {
    throw new Error('未配置 LLM 模型名称,请前往「设置」页面填写后再使用。');
  }
  const baseUrl = settings.llmBaseUrl?.trim() || inferBaseUrl(settings.llmModel);
  return new OpenAICompatibleProvider(
    baseUrl,
    settings.llmApiKey,
    settings.llmModel,
  );
}

/** 读取当前设置(zustand store 可在 React 组件外通过 getState 读取)。 */
function getSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}

// =====================================================================
// JSON 提取 / 解析辅助
// =====================================================================

/** 从可能包含 Markdown 代码块或额外文字的响应中提取 JSON 字符串。 */
function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    t = fence[1].trim();
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1);
  }
  return t;
}

/** 调用 LLM 并解析为指定 JSON 类型。 */
async function callLLMJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature?: number,
): Promise<T> {
  const provider = createLLMProvider(getSettings());
  const raw = await provider.chatCompletion({
    systemPrompt,
    userPrompt,
    temperature,
  });
  const jsonText = extractJson(raw);
  try {
    return JSON.parse(jsonText) as T;
  } catch (e) {
    throw new Error(
      `LLM 响应 JSON 解析失败:${(e as Error).message}\n原始响应:\n${raw}`,
    );
  }
}

// =====================================================================
// 高层 API:三角色 + 难度调整
// =====================================================================

/**
 * 对话伙伴:根据情境类型与难度给出下一回合的情境与待表达意思。
 * 内部调用 buildConversationPartnerPrompt 构造提示词,语言顺序与安全词读取自设置。
 */
export async function generateContext(params: {
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  scenario?: string;
  previousTurns?: Turn[];
}): Promise<ConversationPartnerOutput> {
  const settings = getSettings();
  const systemPrompt = buildConversationPartnerSystemPrompt();
  const userPrompt = buildConversationPartnerUserPrompt({
    contextType: params.contextType,
    englishDifficulty: params.englishDifficulty,
    japaneseDifficulty: params.japaneseDifficulty,
    scenario: params.contextType === 'roleplay' ? params.scenario : undefined,
    topic:
      params.contextType === 'topic_discussion' ? params.scenario : undefined,
    recentTurns: params.previousTurns?.map((t) => ({
      english: t.englishInput,
      japanese: t.japaneseInput,
    })),
    languageOrder: settings.targetLanguageOrder,
  });
  return callLLMJson<ConversationPartnerOutput>(systemPrompt, userPrompt, 0.8);
}

/**
 * 评估者:对照评估同一情境下的英语与日语表达,返回可持久化的 Feedback。
 */
export async function evaluateTurn(params: {
  context: string;
  englishInput: string;
  japaneseInput: string;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
}): Promise<Feedback> {
  const systemPrompt = buildEvaluatorSystemPrompt();
  const userPrompt = buildEvaluatorUserPrompt({
    context: params.context,
    englishInput: params.englishInput,
    japaneseInput: params.japaneseInput,
    englishDifficulty: params.englishDifficulty,
    japaneseDifficulty: params.japaneseDifficulty,
  });
  const output = await callLLMJson<EvaluatorOutput>(
    systemPrompt,
    userPrompt,
    0.3,
  );
  return toFeedback(output);
}

/**
 * 元对话者:就训练本身与用户讨论,用目标语言回应(命中安全词则切换中文)。
 */
export async function metaDialog(params: {
  userMessage: string;
  targetLanguage: 'en' | 'ja';
  recentTurn?: Turn;
}): Promise<MetaDialogOutput> {
  const settings = getSettings();
  const systemPrompt = buildMetaDialogSystemPrompt();
  const userPrompt = buildMetaDialogUserPrompt({
    userMessage: params.userMessage,
    recentLang: params.targetLanguage,
    safeWord: settings.safeWord,
    lastEnglish: params.recentTurn?.englishInput,
    lastJapanese: params.recentTurn?.japaneseInput,
  });
  return callLLMJson<MetaDialogOutput>(systemPrompt, userPrompt, 0.7);
}

/**
 * 流式生成元对话回应(供流式 TTS 管线使用)。
 *
 * 与 metaDialog 的区别:
 *   - 输出纯文本(非 JSON),可直接送入 TTS 管线
 *   - 逐段 yield 文本,实现 LLM 生成与 TTS 播放并行
 *   - 安全词检测由调用方在调用前完成(客户端检测),本函数专注目标语言流式输出
 *
 * @param params.userMessage 用户发言
 * @param params.targetLanguage 目标语言(英语或日语)
 * @param params.recentTurn 上一回合(可选上下文)
 */
export async function* streamMetaDialog(params: {
  userMessage: string;
  targetLanguage: 'en' | 'ja';
  recentTurn?: Turn;
}): AsyncGenerator<string> {
  const provider = createLLMProvider(getSettings());
  const systemPrompt = buildMetaDialogStreamSystemPrompt();
  const userPrompt = buildMetaDialogStreamUserPrompt(params);
  yield* provider.chatCompletionStream({
    systemPrompt,
    userPrompt,
    temperature: 0.7,
  });
}

// ---------------------------------------------------------------------
// 流式元对话 prompt(纯文本输出,非 JSON)
// ---------------------------------------------------------------------

function buildMetaDialogStreamSystemPrompt(): string {
  return `你是"双语并行口语训练"应用中的【元对话者】(meta_dialog)。
"元对话"指训练之外的复盘讨论:用户就刚刚的练习提问、请求解释、讨论表达方式等。你的职责是用目标语言与用户讨论训练本身,使复盘也变成练习。

# 语言规则
1. 必须使用指定的目标语言回应(英语或日语),不要混入其他语言。
2. 若涉及复杂概念,可适当补充简短说明,但主体语言必须是目标语言。
3. 简洁、聚焦语言点,避免长篇大论。
4. 鼓励用户,但不浮夸。
5. 不要替用户做下一回合的情境生成。

# 输出格式
直接输出回应正文(纯文本)。不要 JSON,不要 Markdown 代码块,不要任何前缀说明。`;
}

function buildMetaDialogStreamUserPrompt(params: {
  userMessage: string;
  targetLanguage: 'en' | 'ja';
  recentTurn?: Turn;
}): string {
  const langName = params.targetLanguage === 'en' ? '英语' : '日语';
  const lastEn = params.recentTurn?.englishInput
    ? `上一回合英语表达:${params.recentTurn.englishInput}`
    : '上一回合英语表达:无';
  const lastJa = params.recentTurn?.japaneseInput
    ? `上一回合日语表达:${params.recentTurn.japaneseInput}`
    : '上一回合日语表达:无';
  return `用户发言:
${params.userMessage}

请用${langName}回应(直接输出回应正文,纯文本)。
${lastEn}
${lastJa}`;
}

/**
 * 难度调节器:针对单一语言(英或日),依据近期回合在该语言上的表现判断是否调整难度。
 * 英语与日语各自独立调用本函数。
 */
export async function adjustDifficulty(params: {
  language: 'en' | 'ja';
  currentDifficulty: EnglishDifficulty | JapaneseDifficulty;
  recentTurns: Turn[];
}): Promise<DifficultyAdjustmentOutput> {
  const systemPrompt = buildDifficultyAdjustmentSystemPrompt();
  const userPrompt = buildDifficultyAdjustmentUserPrompt({
    language: params.language,
    currentDifficulty: params.currentDifficulty,
    recentPerformance: deriveRecentPerformance(params.recentTurns, params.language),
  });
  return callLLMJson<DifficultyAdjustmentOutput>(systemPrompt, userPrompt, 0.4);
}

/**
 * 由近 5 个回合的 feedback 启发式推导难度调节器所需的表现摘要。
 * language 决定只统计该语言的错误数与提示数(英语错误/tips 或日语错误/tips)。
 */
function deriveRecentPerformance(
  turns: Turn[],
  language: 'en' | 'ja',
): Array<{
  semanticConsistency: boolean;
  accuracy: 'high' | 'medium' | 'low';
  vocabularyRichness: 'high' | 'medium' | 'low';
}> {
  return turns.slice(-5).map((t) => {
    const fb = t.feedback;
    // 仅统计目标语言的错误词
    const errorCount =
      fb?.errorWords.filter((w) => w.language === language).length ?? 0;
    // 仅统计目标语言的发音提示
    const tipCount =
      (language === 'en'
        ? fb?.englishTips.length ?? 0
        : fb?.japaneseTips.length ?? 0);
    return {
      // 语义一致性是跨语言指标,两语言共用
      semanticConsistency: fb?.semanticConsistency ?? false,
      accuracy: errorCount === 0 ? 'high' : errorCount <= 2 ? 'medium' : 'low',
      vocabularyRichness:
        tipCount >= 3 ? 'high' : tipCount >= 1 ? 'medium' : 'low',
    };
  });
}
