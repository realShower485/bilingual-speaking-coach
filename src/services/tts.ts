// =====================================================================
// 语音合成 (Text-to-Speech, TTS)
// ---------------------------------------------------------------------
// 提供:
//   - TTSProvider 接口
//   - OpenAITTSProvider:OpenAI TTS API 实现(tts-1 模型)
//   - AzureTTSProvider:Azure TTS 占位(首版未完整实现)
//   - createTTSProvider 工厂
//   - speakText / stopSpeaking / isSpeaking 高层 API
//
// 高层 API 通过 HTMLAudioElement 播放音频,并同步 sessionStore.isAiSpeaking。
// =====================================================================

import type { AppSettings } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { useSessionStore } from '../store/sessionStore';
import { httpFetch } from './httpClient';

export interface TTSProvider {
  name: string;
  /** 文字转语音,返回音频 Blob。 */
  synthesize(text: string, language: 'en' | 'ja'): Promise<Blob>;
  /** 流式播放(边生成边播放)。首版默认实现为:合成后整体播放。 */
  synthesizeAndPlay(text: string, language: 'en' | 'ja'): Promise<void>;
}

// =====================================================================
// OpenAI TTS 实现
// =====================================================================

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

// 不同语言选择更合适的音色(OpenAI 提供 alloy/echo/fable/onyx/nova/shimmer)
const DEFAULT_VOICE_BY_LANG: Record<'en' | 'ja', string> = {
  en: 'alloy',
  ja: 'nova',
};

// 硅基流动 CosyVoice2 预置音色(需带模型名前缀)
const SILICONFLOW_VOICE_BY_LANG: Record<'en' | 'ja', string> = {
  en: 'FunAudioLLM/CosyVoice2-0.5B:alex',     // 沉稳男声,适合英语
  ja: 'FunAudioLLM/CosyVoice2-0.5B:claire',   // 温柔女声,适合日语
};

class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = OPENAI_TTS_ENDPOINT,
    private readonly model: string = 'tts-1',
    /** 自定义音色;留空则按语言使用默认音色。硅基流动等可传特定音色 ID。 */
    private readonly voice?: string,
    /** 默认音色表(按语言);硅基流动与 OpenAI 不同。 */
    private readonly defaultVoiceByLang: Record<'en' | 'ja', string> = DEFAULT_VOICE_BY_LANG,
  ) {}

  async synthesize(text: string, language: 'en' | 'ja'): Promise<Blob> {
    if (!this.apiKey) {
      throw new Error('未配置 TTS API Key,无法进行语音合成。');
    }
    if (!text.trim()) {
      throw new Error('待合成的文本为空。');
    }

    // 音色选择:优先用构造函数传入的 voice,否则按语言使用默认音色
    const voice = this.voice || this.defaultVoiceByLang[language];
    const res = await httpFetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!res.ok) {
      const errText = await this.safeReadError(res);
      throw new Error(`OpenAI TTS 失败 (${res.status}):${errText}`);
    }
    return await res.blob();
  }

  async synthesizeAndPlay(text: string, language: 'en' | 'ja'): Promise<void> {
    const blob = await this.synthesize(text, language);
    await playBlob(blob);
  }

  private async safeReadError(res: Response): Promise<string> {
    try {
      const t = await res.text();
      return t.slice(0, 300);
    } catch {
      return res.statusText;
    }
  }
}

// =====================================================================
// Azure TTS 占位实现
// =====================================================================

class AzureTTSProvider implements TTSProvider {
  readonly name = 'azure';

  constructor(
    _apiKey: string,
    _region: string = 'eastasia',
  ) {}

  async synthesize(_text: string, _language: 'en' | 'ja'): Promise<Blob> {
    throw new Error(
      'Azure TTS 尚未实现:请在设置中切换至 openai 提供商,或后续集成 Azure Speech SDK。',
    );
  }

  async synthesizeAndPlay(_text: string, _language: 'en' | 'ja'): Promise<void> {
    throw new Error(
      'Azure TTS 尚未实现:请在设置中切换至 openai 提供商,或后续集成 Azure Speech SDK。',
    );
  }
}

// =====================================================================
// 工厂
// =====================================================================

export function createTTSProvider(settings: AppSettings): TTSProvider {
  const apiKey = settings.ttsApiKey || settings.llmApiKey;
  switch (settings.ttsProvider) {
    case 'siliconflow': {
      const baseUrl =
        settings.ttsBaseUrl || 'https://api.siliconflow.cn/v1/audio/speech';
      const model = settings.ttsModel || 'FunAudioLLM/CosyVoice2-0.5B';
      // 过滤 OpenAI 残留音色名,只接受含 ':' 的 SiliconFlow 格式
      const voice = settings.ttsVoice && settings.ttsVoice.includes(':')
        ? settings.ttsVoice
        : undefined;
      return new OpenAITTSProvider(
        apiKey, baseUrl, model,
        voice,
        SILICONFLOW_VOICE_BY_LANG,
      );
    }
    case 'openai':
      return new OpenAITTSProvider(apiKey);
    case 'azure':
      return new AzureTTSProvider(apiKey);
    default:
      // 兜底:使用 openai
      return new OpenAITTSProvider(apiKey);
  }
}

// =====================================================================
// 高层 API:播放管理
// =====================================================================

let currentAudio: HTMLAudioElement | null = null;
let currentAbort: AbortController | null = null;

/** 当前是否正在播放 TTS。 */
export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

/**
 * 将文本合成并播放。
 * - 调用 TTS API 获取音频
 * - 使用 HTMLAudioElement 播放
 * - 同步更新 sessionStore.isAiSpeaking
 * - 播放完毕或出错后清除 isAiSpeaking
 *
 * @param text 待播放文本
 * @param language 目标语言
 * @param options.onBeforePlay 在实际开始播放前的钩子(可用于准备 UI)
 */
export async function speakText(
  text: string,
  language: 'en' | 'ja',
  options?: { onBeforePlay?: () => void },
): Promise<void> {
  if (!text.trim()) return;

  // 若已有播放,先停止
  stopSpeaking();

  const settings = useSettingsStore.getState().settings;
  const provider = createTTSProvider(settings);
  const store = useSessionStore.getState();

  store.setAiSpeaking(true);

  const abort = new AbortController();
  currentAbort = abort;

  try {
    const blob = await provider.synthesize(text, language);
    if (abort.signal.aborted) return; // 已被停止

    options?.onBeforePlay?.();
    await playBlob(blob, abort.signal);
  } catch (e) {
    // 被主动取消时不当作错误
    if (abort.signal.aborted) return;
    store.setError(`TTS 播放失败:${(e as Error).message}`);
  } finally {
    if (currentAbort === abort) {
      currentAbort = null;
    }
    if (currentAudio === null || currentAudio.ended || currentAudio.paused) {
      useSessionStore.getState().setAiSpeaking(false);
    }
  }
}

/**
 * 合成并播放单个句子(用于流式管线)。
 *
 * 与 speakText 的区别:
 *   - 不调用 stopSpeaking(由管线管理播放顺序,避免句子间互相打断)
 *   - 不在结束后清除 isAiSpeaking(由管线统一管理生命周期)
 *   - 单句失败不抛出(仅 console.error),避免中断整条管线
 *
 * @param text 待播放的单句文本
 * @param language 目标语言
 */
export async function speakSentence(
  text: string,
  language: 'en' | 'ja',
): Promise<void> {
  if (!text.trim()) return;

  const settings = useSettingsStore.getState().settings;
  const provider = createTTSProvider(settings);

  const abort = new AbortController();
  currentAbort = abort;

  try {
    const blob = await provider.synthesize(text, language);
    if (abort.signal.aborted) return;
    await playBlob(blob, abort.signal);
  } catch (e) {
    if (abort.signal.aborted) return;
    const errMsg = (e as Error).message;
    console.error('[tts] speakSentence 失败:', e);
    useSessionStore.getState().setError(`TTS 失败:${errMsg}`);
  } finally {
    if (currentAbort === abort) {
      currentAbort = null;
    }
  }
}

/** 停止当前 TTS 播放(并取消进行中的 fetch)。 */
export function stopSpeaking(): void {
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* 忽略 */
    }
    currentAudio = null;
  }
  // 同步清除状态(避免遗漏)
  if (useSessionStore.getState().isAiSpeaking) {
    useSessionStore.getState().setAiSpeaking(false);
  }
}

// =====================================================================
// 内部:Blob 播放
// =====================================================================

function playBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) {
        currentAudio = null;
      }
    };

    if (signal) {
      const onAbort = () => {
        try {
          audio.pause();
        } catch {
          /* 忽略 */
        }
        cleanup();
        signal.removeEventListener('abort', onAbort);
        resolve(); // 主动取消视为正常结束
      };
      signal.addEventListener('abort', onAbort);
    }

    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('音频播放失败。'));
    };
    audio.play().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}
