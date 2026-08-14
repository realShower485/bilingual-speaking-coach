// =====================================================================
// 语音识别 (Speech-to-Text, STT)
// ---------------------------------------------------------------------
// 提供:
//   - STTProvider 接口(含流式 transcribeStream)
//   - StreamHandle:流式识别控制句柄
//   - WhisperSTTProvider:OpenAI Whisper API 实现(非流式,批量)
//   - WebSpeechSTTProvider:浏览器原生 Web Speech API 实现(流式,边说边显示)
//   - AzureSTTProvider:Azure Speech 占位(首版未完整实现)
//   - createSTTProvider 工厂(优先 Web Speech API 流式,不可用时回退 Whisper)
//   - transcribeAudio 高层 API(批量)
// =====================================================================

import type { AppSettings } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { audioRecorder } from './audioRecorder';
import { httpFetch } from './httpClient';

/** 流式识别控制句柄:停止并取回最终文本,或取消识别。 */
export interface StreamHandle {
  /** 停止识别并返回最终文本。 */
  stop: () => Promise<string>;
  /** 取消识别(丢弃结果)。 */
  cancel: () => void;
}

export interface STTProvider {
  name: string;
  /** 音频转文字(非流式,批量)。 */
  transcribe(audioBlob: Blob, language: 'en' | 'ja'): Promise<string>;
  /**
   * 流式识别(可选)。边说边返回中间结果,通过 onInterim 实时更新 UI。
   * 返回 StreamHandle 用于停止/取消。WebSpeechSTTProvider 实现此方法。
   */
  transcribeStream?(
    onInterim: (text: string) => void,
    language: 'en' | 'ja',
  ): StreamHandle;
}

// =====================================================================
// OpenAI Whisper API 实现(批量)
// =====================================================================

const OPENAI_STT_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

class WhisperSTTProvider implements STTProvider {
  readonly name = 'whisper';

  constructor(
    private readonly apiKey: string,
    /** 可选:自定义 base URL(兼容代理/第三方 OpenAI 兼容服务)。 */
    private readonly baseUrl: string = OPENAI_STT_ENDPOINT,
    /** 可选:模型名,默认 whisper-1。 */
    private readonly model: string = 'whisper-1',
  ) {}

  async transcribe(audioBlob: Blob, language: 'en' | 'ja'): Promise<string> {
    if (!this.apiKey) {
      throw new Error('未配置 OpenAI/STT API Key,无法进行语音识别。');
    }
    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('音频为空,无法识别。');
    }

    const formData = new FormData();
    const filename = this.pickFilename(audioBlob);
    formData.append('file', audioBlob, filename);
    formData.append('model', this.model);
    // Whisper language 参数接受 ISO-639-1 代码(en/ja)
    formData.append('language', language);
    formData.append('response_format', 'json');

    const res = await httpFetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await this.safeReadError(res);
      throw new Error(`Whisper 识别失败 (${res.status}):${text}`);
    }

    const data = (await res.json()) as { text?: string };
    const text = (data?.text ?? '').trim();
    return text;
  }

  private pickFilename(blob: Blob): string {
    const type = blob.type || '';
    if (type.includes('webm')) return 'audio.webm';
    if (type.includes('ogg')) return 'audio.ogg';
    if (type.includes('mp4')) return 'audio.mp4';
    if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
    if (type.includes('wav')) return 'audio.wav';
    return 'audio.webm';
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
// Web Speech API 实现(流式,边说边显示)
// ---------------------------------------------------------------------
// 使用浏览器原生 SpeechRecognition 接口:
//   - interimResults: true  返回中间结果,实现"边说边显示"
//   - continuous: true      持续识别直到调用 stop()
//   - onresult 中区分 isFinal 与 interim:
//       final 片段累积到 finalText;interim 片段实时通过 onInterim 回调
//       传回 (finalText + interim),让 UI 显示完整识别进度。
// transcribe(批量)回退到内部 WhisperSTTProvider,保证接口完整。
// =====================================================================

class WebSpeechSTTProvider implements STTProvider {
  readonly name = 'web-speech';

  /** 批量识别的回退实现(用 Whisper)。 */
  private readonly fallback: WhisperSTTProvider;

  constructor(fallback: WhisperSTTProvider) {
    this.fallback = fallback;
  }

  /** 批量识别:回退到 Whisper。 */
  async transcribe(audioBlob: Blob, language: 'en' | 'ja'): Promise<string> {
    return this.fallback.transcribe(audioBlob, language);
  }

  /**
   * 流式识别:边说边返回中间结果。
   * @param onInterim 中间结果回调(传入当前累计文本,含 final + interim)
   * @param language 目标语言('en' | 'ja')
   * @returns StreamHandle 控制句柄
   */
  transcribeStream(
    onInterim: (text: string) => void,
    language: 'en' | 'ja',
  ): StreamHandle {
    const Ctor =
      (window as unknown as { SpeechRecognition?: { new (): SpeechRecognition } })
        .SpeechRecognition ||
      (window as unknown as {
        webkitSpeechRecognition?: { new (): SpeechRecognition };
      }).webkitSpeechRecognition;

    if (!Ctor) {
      // 浏览器不支持:返回一个空句柄,调用方应已通过 createSTTProvider 兜底
      throw new Error('当前浏览器不支持 Web Speech API(SpeechRecognition)。');
    }

    const recognition = new Ctor();
    recognition.lang = language === 'ja' ? 'ja-JP' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = '';
    let resolveStop!: (text: string) => void;
    let rejectStop!: (err: Error) => void;
    const stopPromise = new Promise<string>((resolve, reject) => {
      resolveStop = resolve;
      rejectStop = reject;
    });

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      // 实时更新 UI:已确定的最终文本 + 当前临时片段
      onInterim((finalText + interim).trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // no-speech / aborted 属于正常情况,不中断流程
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      // 其他错误(如 not-allowed、network)向上抛出
      rejectStop(new Error(`语音识别错误:${event.error}`));
    };

    recognition.onend = () => {
      // 识别结束:可能是 stop() 触发,也可能是浏览器自动结束
      resolveStop(finalText.trim());
    };

    try {
      recognition.start();
    } catch (e) {
      rejectStop(e as Error);
    }

    return {
      stop: async () => {
        try {
          recognition.stop();
        } catch {
          /* 已经停止则忽略 */
        }
        return stopPromise;
      },
      cancel: () => {
        try {
          recognition.abort();
        } catch {
          /* 已经停止则忽略 */
        }
        // abort 后 onend 仍会触发,但结果已丢弃;这里立即 resolve 以释放 Promise
        resolveStop('');
      },
    };
  }
}

// =====================================================================
// Azure Speech 占位实现
// ---------------------------------------------------------------------
// Azure Speech SDK 需要额外的 SDK 依赖(microsoft-cognitiveservices-speech-sdk)
// 与 region/endpoint 配置。首版仅做占位,实际调用时抛出友好错误。
// =====================================================================

class AzureSTTProvider implements STTProvider {
  readonly name = 'azure';

  constructor(
    _apiKey: string,
    _region: string = 'eastasia',
  ) {}

  async transcribe(_audioBlob: Blob, _language: 'en' | 'ja'): Promise<string> {
    throw new Error(
      'Azure Speech STT 尚未实现:请切换至 whisper 提供商,或后续集成 Azure Speech SDK。',
    );
  }
}

// =====================================================================
// 工厂
// ---------------------------------------------------------------------
// 优先使用 Web Speech API(流式,边说边显示);
// 浏览器不支持时回退到 Whisper(批量)。
// 注意:WebSpeechSTTProvider 内部持有 WhisperSTTProvider 作为批量回退。
// =====================================================================

/** 浏览器是否支持 Web Speech API 流式识别。 */
export function isWebSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !!w.SpeechRecognition || !!w.webkitSpeechRecognition;
}

export function createSTTProvider(settings: AppSettings): STTProvider {
  // STT 与 LLM 共用 OpenAI Key 时,sttApiKey 可能为空,回退到 llmApiKey
  const apiKey = settings.sttApiKey || settings.llmApiKey;

  // 硅基流动(SiliconFlow):OpenAI 兼容格式,改 base URL 与模型名
  if (settings.sttProvider === 'siliconflow') {
    const baseUrl =
      settings.sttBaseUrl || 'https://api.siliconflow.cn/v1/audio/transcriptions';
    const model = settings.sttModel || 'FunAudioLLM/SenseVoiceSmall';
    const sfWhisper = new WhisperSTTProvider(apiKey, baseUrl, model);
    // 硅基流动也优先用 Web Speech API 流式,回退到硅基流动批量
    if (isWebSpeechSupported()) {
      return new WebSpeechSTTProvider(sfWhisper);
    }
    return sfWhisper;
  }

  const whisper = new WhisperSTTProvider(apiKey);

  // 优先 Web Speech API(流式,边说边显示)
  if (isWebSpeechSupported()) {
    return new WebSpeechSTTProvider(whisper);
  }

  // 显式选择 azure 时使用 azure 占位
  if (settings.sttProvider === 'azure') {
    return new AzureSTTProvider(apiKey);
  }

  // 兜底:使用 whisper(批量)
  return whisper;
}

// =====================================================================
// 高层 API
// =====================================================================

/**
 * 将音频 Blob 转文字。依据当前 settingsStore 选择 STT 提供商。
 * @param audioBlob 录制的音频(通常来自 audioRecorder.stop())
 * @param language 目标语言('en' | 'ja')
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language: 'en' | 'ja',
): Promise<string> {
  const settings = useSettingsStore.getState().settings;
  const provider = createSTTProvider(settings);
  return provider.transcribe(audioBlob, language);
}

/**
 * 录音并识别一步完成(便捷方法,批量模式)。
 * 调用方需先 audioRecorder.start(),完成后调用本方法停止并识别。
 */
export async function stopAndTranscribe(language: 'en' | 'ja'): Promise<string> {
  const blob = await audioRecorder.stop();
  return transcribeAudio(blob, language);
}
