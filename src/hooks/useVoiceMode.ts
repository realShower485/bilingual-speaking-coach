// =====================================================================
// useVoiceMode — 语音模式完整流程封装
// ---------------------------------------------------------------------
// 将 audioRecorder + stt + tts + interruptionManager 组合为统一的
// 语音模式 API,供 TrainingView / StatusBar 等组件使用。
//
// 状态来源:
//   - isVoiceMode / toggleVoiceMode → uiStore(全局,多组件共享)
//   - isRecording / isAiSpeaking / isInterruptible → sessionStore(全局)
//   - volumeLevel / interimText → 本地 state
//
// 流式 STT:
//   - 录音开始时,若浏览器支持 Web Speech API,同时启动流式识别
//   - interim 结果实时更新 interimText(边说边显示)
//   - 录音停止时,从流式句柄获取最终文本(无需再调用 Whisper)
//   - 不支持 Web Speech API 时,回退到原批量模式(audioRecorder + Whisper)
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { audioRecorder } from '../services/audioRecorder';
import {
  createSTTProvider,
  transcribeAudio,
  type StreamHandle,
} from '../services/stt';
import {
  speakText,
  stopSpeaking as stopSpeakingTts,
} from '../services/tts';
import { interruptionManager } from '../services/interruptionManager';
import { StreamingTTSPipeline } from '../services/streamingPipeline';

export function useVoiceMode() {
  const isVoiceMode = useUiStore((s) => s.isVoiceMode);
  const setVoiceMode = useUiStore((s) => s.setVoiceMode);

  const isRecording = useSessionStore((s) => s.isRecording);
  const isAiSpeaking = useSessionStore((s) => s.isAiSpeaking);
  const isInterruptible = useSessionStore((s) => s.isInterruptible);
  const setRecording = useSessionStore((s) => s.setRecording);
  const setError = useSessionStore((s) => s.setError);
  const setInterruptible = useSessionStore((s) => s.setInterruptible);

  const [volumeLevel, setVolumeLevel] = useState(0);
  /** 流式识别的实时文本(边说边显示)。 */
  const [interimText, setInterimText] = useState('');
  /** 流式识别句柄(录音期间持有,停止时取回最终文本)。 */
  const streamHandleRef = useRef<StreamHandle | null>(null);
  /** AI 正在说的文本(流式 TTS 管线实时更新,供 UI 显示字幕)。 */
  const [aiSpeakingText, setAiSpeakingText] = useState('');
  /** 当前活跃的流式 TTS 管线实例(用于 stop / 清理)。 */
  const pipelineRef = useRef<StreamingTTSPipeline | null>(null);

  // 录音中通过 requestAnimationFrame 轮询音量级别,供 UI 显示波形。
  // 节流到 ~50ms 一次状态更新,在平滑度与重渲染开销之间取平衡。
  // 组件卸载或录音停止时,cleanup 会取消 rAF 并重置音量为 0(避免残留波形)。
  useEffect(() => {
    if (!isRecording) {
      setVolumeLevel(0);
      return;
    }
    let rafId: number;
    let lastUpdate = 0;
    const tick = (ts: number) => {
      if (ts - lastUpdate >= 50) {
        lastUpdate = ts;
        setVolumeLevel(audioRecorder.getVolumeLevel());
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      setVolumeLevel(0);
    };
  }, [isRecording]);

  /** 关闭语音模式时清理所有语音资源。 */
  const disableVoiceMode = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.stop();
      pipelineRef.current = null;
    }
    if (audioRecorder.isRecording()) audioRecorder.cancel();
    if (streamHandleRef.current) {
      streamHandleRef.current.cancel();
      streamHandleRef.current = null;
    }
    setInterimText('');
    setAiSpeakingText('');
    setRecording(false);
    stopSpeakingTts();
    interruptionManager.stopListening();
    setInterruptible(false);
    setVoiceMode(false);
  }, [setRecording, setInterruptible, setVoiceMode]);

  const handleToggleVoiceMode = useCallback(() => {
    if (isVoiceMode) {
      disableVoiceMode();
    } else {
      setVoiceMode(true);
    }
  }, [isVoiceMode, disableVoiceMode, setVoiceMode]);

  /**
   * 开始录音(会先停止 AI 说话与打断检测)。
   * @param language 目标语言;提供时同时启动 Web Speech API 流式识别(边说边显示)
   */
  const startRecording = useCallback(
    async (language?: 'en' | 'ja'): Promise<void> => {
      stopSpeakingTts();
      interruptionManager.stopListening();
      setInterruptible(false);
      setInterimText('');
      try {
        await audioRecorder.start();
        setRecording(true);

        // 同时启动流式 STT(若支持且提供了语言)
        if (language) {
          const settings = useSettingsStore.getState().settings;
          const provider = createSTTProvider(settings);
          if (provider.transcribeStream) {
            try {
              streamHandleRef.current = provider.transcribeStream(
                (text) => setInterimText(text),
                language,
              );
            } catch (e) {
              // 流式启动失败:静默回退到批量模式,不打断录音
              streamHandleRef.current = null;
              console.warn('流式 STT 启动失败,回退批量模式:', e);
            }
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [setRecording, setError, setInterruptible],
  );

  /**
   * 停止录音并返回 STT 识别结果。
   * 优先使用流式句柄的最终文本;无流式句柄时回退到批量 Whisper 识别。
   * @param language 目标语言(en/ja)
   * @returns 识别出的文本;失败或空音频时返回空字符串
   */
  const stopRecording = useCallback(
    async (language: 'en' | 'ja'): Promise<string> => {
      setRecording(false);

      // 流式模式:从句柄获取最终文本
      const handle = streamHandleRef.current;
      streamHandleRef.current = null;
      if (handle) {
        try {
          // 同时停止 audioRecorder(用于波形显示,音频数据不再需要)
          if (audioRecorder.isRecording()) {
            await audioRecorder.stop();
          }
          const text = await handle.stop();
          setInterimText('');
          return text;
        } catch (e) {
          setError((e as Error).message);
          setInterimText('');
          return '';
        }
      }

      // 批量回退:Whisper 识别
      if (!audioRecorder.isRecording()) return '';
      try {
        const blob = await audioRecorder.stop();
        if (blob.size === 0) return '';
        const text = await transcribeAudio(blob, language);
        return text;
      } catch (e) {
        setError((e as Error).message);
        return '';
      }
    },
    [setRecording, setError],
  );

  /** 取消当前录音(不识别)。 */
  const cancelRecording = useCallback((): void => {
    setRecording(false);
    if (streamHandleRef.current) {
      streamHandleRef.current.cancel();
      streamHandleRef.current = null;
    }
    setInterimText('');
    if (audioRecorder.isRecording()) audioRecorder.cancel();
  }, [setRecording]);

  /**
   * 合成并播放文本(AI 说话)。在语音模式下自动启用打断检测。
   * @param text 待播放文本
   * @param language 目标语言
   * @param options.enableInterrupt 是否启用打断检测(默认与 isVoiceMode 一致)
   * @param options.onInterrupt 打断时的回调(通常用于启动正式录音)
   */
  const speak = useCallback(
    async (
      text: string,
      language: 'en' | 'ja',
      options?: {
        enableInterrupt?: boolean;
        onInterrupt?: () => void;
      },
    ): Promise<void> => {
      if (!text.trim()) return;
      const enableInterrupt = options?.enableInterrupt ?? isVoiceMode;

      await speakText(text, language, {
        onBeforePlay: () => {
          if (enableInterrupt) {
            setInterruptible(true);
            void interruptionManager.startListening(() => {
              stopSpeakingTts();
              setInterruptible(false);
              options?.onInterrupt?.();
            });
          }
        },
      });
      setInterruptible(false);
      interruptionManager.stopListening();
    },
    [isVoiceMode, setInterruptible],
  );

  /**
   * 流式合成并播放文本(AI 说话)。LLM 流式生成与 TTS 播放并行,降低首字延迟。
   *
   * 使用 StreamingTTSPipeline:
   *   - LLM 流式输出的每个 chunk 通过 onTextChunk 回调实时更新 aiSpeakingText(字幕)
   *   - 按句分段送入 TTS 队列,第一句生成后立即合成播放
   *   - 在语音模式下自动启用打断检测
   *
   * @param stream LLM 流式输出 AsyncGenerator
   * @param language 目标语言
   * @param options.enableInterrupt 是否启用打断检测(默认与 isVoiceMode 一致)
   * @param options.onTextChunk 文本块回调(调用方可用于增量更新 UI,如元对话消息)
   * @param options.onComplete 完成回调(正常结束时调用,被 stop 中断时不调用)
   * @param options.onInterrupt 打断时的回调
   */
  const speakStream = useCallback(
    async (
      stream: AsyncGenerator<string>,
      language: 'en' | 'ja',
      options?: {
        enableInterrupt?: boolean;
        onTextChunk?: (text: string) => void;
        onComplete?: () => void;
        onInterrupt?: () => void;
      },
    ): Promise<void> => {
      const enableInterrupt = options?.enableInterrupt ?? isVoiceMode;

      // 停止已有播放 / 管线
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current = null;
      }
      stopSpeakingTts();
      setAiSpeakingText('');

      const pipeline = new StreamingTTSPipeline();
      pipelineRef.current = pipeline;

      // 启用打断检测:管线开始即监听(第一句很快播放)
      if (enableInterrupt) {
        setInterruptible(true);
        void interruptionManager.startListening(() => {
          pipeline.stop();
          setInterruptible(false);
          options?.onInterrupt?.();
        });
      }

      let accumulated = '';
      try {
        await pipeline.start(
          stream,
          language,
          (chunk) => {
            accumulated += chunk;
            setAiSpeakingText(accumulated);
            options?.onTextChunk?.(chunk);
          },
          () => {
            options?.onComplete?.();
          },
        );
      } finally {
        pipelineRef.current = null;
        setAiSpeakingText('');
        setInterruptible(false);
        interruptionManager.stopListening();
      }
    },
    [isVoiceMode, setInterruptible],
  );

  /** 停止 AI 说话(并取消打断检测与流式管线)。 */
  const stopSpeaking = useCallback((): void => {
    if (pipelineRef.current) {
      pipelineRef.current.stop();
      pipelineRef.current = null;
    }
    stopSpeakingTts();
    interruptionManager.stopListening();
    setInterruptible(false);
    setAiSpeakingText('');
  }, [setInterruptible]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current = null;
      }
      interruptionManager.stopListening();
      stopSpeakingTts();
      if (streamHandleRef.current) {
        streamHandleRef.current.cancel();
        streamHandleRef.current = null;
      }
      if (audioRecorder.isRecording()) audioRecorder.cancel();
    };
  }, []);

  return {
    isVoiceMode,
    toggleVoiceMode: handleToggleVoiceMode,
    isRecording,
    isAiSpeaking,
    isInterruptible,
    volumeLevel,
    interimText,
    aiSpeakingText,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    speakStream,
    stopSpeaking,
  };
}
