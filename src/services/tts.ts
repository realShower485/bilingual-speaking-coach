// =====================================================================
// 语音合成 (Text-to-Speech, TTS)
// ---------------------------------------------------------------------
// 每种语言独立选择音色，并在混合文本时按文字本身识别语言。
// 这样中文说明不会被英语音色硬读，英语和日语也不会共用同一发音人。
// =====================================================================

import type { AppSettings } from '../types';
import { useSettingsStore } from '../store/settingsStore';
import { useSessionStore } from '../store/sessionStore';
import { httpFetch } from './httpClient';

export type SpeechLanguage = 'zh' | 'en' | 'ja';

export interface TTSProvider {
  name: string;
  synthesize(text: string, language: SpeechLanguage): Promise<Blob>;
  synthesizeAndPlay(text: string, language: SpeechLanguage): Promise<void>;
}

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

const DEFAULT_VOICE_BY_LANG: Record<SpeechLanguage, string> = {
  zh: 'shimmer',
  en: 'onyx',
  ja: 'nova',
};

const SILICONFLOW_VOICE_BY_LANG: Record<SpeechLanguage, string> = {
  zh: 'FunAudioLLM/CosyVoice2-0.5B:diana',
  en: 'FunAudioLLM/CosyVoice2-0.5B:alex',
  ja: 'FunAudioLLM/CosyVoice2-0.5B:claire',
};

/** 根据文字本身决定朗读语言；中文说明不再由英/日语音硬读。 */
export function detectSpeechLanguage(
  text: string,
  fallback: SpeechLanguage = 'en',
): SpeechLanguage {
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(text)) return 'ja';
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) return 'zh';
  if (/[A-Za-z]/.test(text)) return 'en';
  return fallback;
}

/** 优先使用该语言专属设置；旧版统一音色不再覆盖全部语言。 */
export function resolveTtsVoice(
  settings: Pick<AppSettings, 'ttsEnglishVoice' | 'ttsJapaneseVoice' | 'ttsChineseVoice'>,
  language: SpeechLanguage,
  defaults: Record<SpeechLanguage, string>,
): string {
  const configured = {
    en: settings.ttsEnglishVoice,
    ja: settings.ttsJapaneseVoice,
    zh: settings.ttsChineseVoice,
  }[language]?.trim();
  return configured || defaults[language];
}

function addCosyVoiceConversationPrompt(text: string): string {
  return '请用自然、清晰、亲切的对话语气朗读以下内容，不要解释。<|endofprompt|>' + text;
}

class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly rate: number,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly voices: Record<SpeechLanguage, string>,
    private readonly useConversationPrompt: boolean = false,
  ) {}

  async synthesize(text: string, language: SpeechLanguage): Promise<Blob> {
    if (!this.apiKey) throw new Error('未配置 TTS API Key，无法进行语音合成。');
    if (!text.trim()) throw new Error('待合成的文本为空。');

    const res = await httpFetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: this.useConversationPrompt ? addCosyVoiceConversationPrompt(text) : text,
        voice: this.voices[language],
        response_format: 'mp3',
        speed: this.rate,
      }),
    });

    if (!res.ok) {
      const errText = await this.safeReadError(res);
      throw new Error('TTS 请求失败 (' + res.status + ')：' + errText);
    }
    return res.blob();
  }

  async synthesizeAndPlay(text: string, language: SpeechLanguage): Promise<void> {
    await playBlob(await this.synthesize(text, language));
  }

  private async safeReadError(res: Response): Promise<string> {
    try {
      return (await res.text()).slice(0, 300);
    } catch {
      return res.statusText;
    }
  }
}

class AzureTTSProvider implements TTSProvider {
  readonly name = 'azure';
  async synthesize(_text: string, _language: SpeechLanguage): Promise<Blob> {
    throw new Error('Azure TTS 尚未实现；请在设置中使用 OpenAI 或 SiliconFlow。');
  }
  async synthesizeAndPlay(_text: string, _language: SpeechLanguage): Promise<void> {
    throw new Error('Azure TTS 尚未实现；请在设置中使用 OpenAI 或 SiliconFlow。');
  }
}

function configuredVoices(
  settings: AppSettings,
  defaults: Record<SpeechLanguage, string>,
): Record<SpeechLanguage, string> {
  return {
    zh: resolveTtsVoice(settings, 'zh', defaults),
    en: resolveTtsVoice(settings, 'en', defaults),
    ja: resolveTtsVoice(settings, 'ja', defaults),
  };
}

export function createTTSProvider(settings: AppSettings): TTSProvider {
  const apiKey = settings.ttsApiKey || settings.llmApiKey;
  const rate = normalizeTtsRate(settings.ttsRate);

  if (settings.ttsProvider === 'siliconflow') {
    return new OpenAITTSProvider(
      apiKey,
      rate,
      settings.ttsBaseUrl || 'https://api.siliconflow.cn/v1/audio/speech',
      settings.ttsModel || 'FunAudioLLM/CosyVoice2-0.5B',
      configuredVoices(settings, SILICONFLOW_VOICE_BY_LANG),
      true,
    );
  }
  if (settings.ttsProvider === 'azure') return new AzureTTSProvider();
  return new OpenAITTSProvider(
    apiKey,
    rate,
    settings.ttsBaseUrl || OPENAI_TTS_ENDPOINT,
    settings.ttsModel || 'tts-1',
    configuredVoices(settings, DEFAULT_VOICE_BY_LANG),
  );
}

function normalizeTtsRate(rate: number | undefined): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(2, Math.max(0.5, rate as number));
}

let currentAudio: HTMLAudioElement | null = null;
let currentAbort: AbortController | null = null;

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

export async function speakText(
  text: string,
  language: SpeechLanguage,
  options?: { onBeforePlay?: () => void },
): Promise<void> {
  if (!text.trim()) return;
  stopSpeaking();

  const provider = createTTSProvider(useSettingsStore.getState().settings);
  const store = useSessionStore.getState();
  const abort = new AbortController();
  currentAbort = abort;
  store.setAiSpeaking(true);

  try {
    const actualLanguage = detectSpeechLanguage(text, language);
    const blob = await provider.synthesize(text, actualLanguage);
    if (abort.signal.aborted) return;
    options?.onBeforePlay?.();
    await playBlob(blob, abort.signal);
  } catch (e) {
    if (!abort.signal.aborted) store.setError('TTS 播放失败：' + (e as Error).message);
  } finally {
    if (currentAbort === abort) currentAbort = null;
    if (currentAudio === null || currentAudio.ended || currentAudio.paused) {
      useSessionStore.getState().setAiSpeaking(false);
    }
  }
}

export async function speakSentence(
  text: string,
  language: SpeechLanguage,
): Promise<void> {
  if (!text.trim()) return;
  const provider = createTTSProvider(useSettingsStore.getState().settings);
  const abort = new AbortController();
  currentAbort = abort;
  try {
    const actualLanguage = detectSpeechLanguage(text, language);
    const blob = await provider.synthesize(text, actualLanguage);
    if (!abort.signal.aborted) await playBlob(blob, abort.signal);
  } catch (e) {
    if (!abort.signal.aborted) {
      console.error('[tts] speakSentence failed:', e);
      useSessionStore.getState().setError('TTS 播放失败：' + (e as Error).message);
    }
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}

export function stopSpeaking(): void {
  currentAbort?.abort();
  currentAbort = null;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudio = null;
  }
  if (useSessionStore.getState().isAiSpeaking) {
    useSessionStore.getState().setAiSpeaking(false);
  }
}

function playBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    const onAbort = () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }
      cleanup();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort);
    audio.onended = () => {
      cleanup();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('音频播放失败。'));
    };
    audio.play().catch((e) => {
      cleanup();
      signal?.removeEventListener('abort', onAbort);
      reject(e);
    });
  });
}
