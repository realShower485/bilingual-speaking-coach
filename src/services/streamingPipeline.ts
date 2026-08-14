// =====================================================================
// 流式语音管线 (Streaming TTS Pipeline)
// ---------------------------------------------------------------------
// 将 LLM 的流式文本输出与 TTS 合成播放并联:
//   LLM 流式输出 → 按句分段 → 每段立即送入 TTS 队列 → 顺序播放
//
// 核心思想:
//   - LLM 生成第一个句子后立即送入 TTS 合成,不等后续句子
//   - TTS 合成 + 播放 sentence1 的同时,LLM 继续生成 sentence2、sentence3…
//   - sentence1 播完后立即取 sentence2 播放,无需等待
//   - 首字延迟 ≈ 首句生成时间 + TTS 合成时间 ≈ 1-2 秒
// =====================================================================

import { speakSentence, stopSpeaking } from './tts';
import { useSessionStore } from '../store/sessionStore';

/** 句子结束符正则:英文使用 .!?;\n,日文使用 。！？；\n */
const SENTENCE_END_RE: Record<'en' | 'ja', RegExp> = {
  en: /[^.!?;\n]+[.!?;\n]+/g,
  ja: /[^。！？；\n]+[。！？；\n]+/g,
};

/**
 * 流式语音管线:LLM 流式输出 → 按句分段 → TTS 合成播放
 * 实现文本生成与音频播放并行,降低首字延迟
 */
export class StreamingTTSPipeline {
  private buffer: string = '';
  private isPlaying: boolean = false;
  private queue: string[] = [];
  private abortController: AbortController | null = null;
  private isStopped: boolean = false;
  private playbackChain: Promise<void> = Promise.resolve();

  /**
   * 启动流式管线。
   *
   * 工作流程:
   * 1. 消费 LLM 流式输出,每个 chunk 累积到 buffer,同时调用 onTextChunk(UI 实时显示)
   * 2. 检测 buffer 中的句子边界,提取完整句子入队
   * 3. 队列非空且未在播放时,启动播放循环(顺序播放队列中的句子)
   * 4. LLM 结束后,flush buffer 中剩余文本,等待所有句子播放完毕
   * 5. 调用 onComplete(被 stop 中断时不调用)
   *
   * @param stream LLM 的流式输出 AsyncGenerator
   * @param language 语言(en/ja)
   * @param onTextChunk 文本块回调(供 UI 实时显示)
   * @param onComplete 完成回调(被 stop 中断时不调用)
   */
  async start(
    stream: AsyncGenerator<string>,
    language: 'en' | 'ja',
    onTextChunk: (text: string) => void,
    onComplete: () => void,
  ): Promise<void> {
    this.reset();
    this.abortController = new AbortController();
    useSessionStore.getState().setAiSpeaking(true);

    try {
      // 消费 LLM 流
      for await (const chunk of stream) {
        if (this.isStopped) break;
        this.buffer += chunk;
        onTextChunk(chunk);

        // 提取完整句子入队
        const sentences = this.extractSentences(language);
        for (const sentence of sentences) {
          this.queue.push(sentence);
        }
        // 尝试启动播放(若未在播放)
        this.maybeStartPlayback(language);
      }

      // LLM 结束:flush buffer 中剩余文本
      if (!this.isStopped && this.buffer.trim()) {
        this.queue.push(this.buffer.trim());
        this.buffer = '';
        this.maybeStartPlayback(language);
      }

      // 等待所有句子播放完毕
      await this.playbackChain;
    } finally {
      useSessionStore.getState().setAiSpeaking(false);
      if (!this.isStopped) {
        onComplete();
      }
    }
  }

  /** 停止管线:中断 LLM 消费、清空队列、停止当前 TTS 播放。 */
  stop(): void {
    this.isStopped = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.queue = [];
    this.buffer = '';
    stopSpeaking();
  }

  // -------------------------------------------------------------------
  // 内部:句子提取
  // -------------------------------------------------------------------

  /** 从 buffer 中提取完整句子,提取后从 buffer 中移除已提取部分。 */
  private extractSentences(language: 'en' | 'ja'): string[] {
    const re = SENTENCE_END_RE[language];
    re.lastIndex = 0;
    const matches = this.buffer.match(re);
    if (!matches || matches.length === 0) return [];

    const consumed = matches.join('');
    this.buffer = this.buffer.slice(consumed.length);
    return matches
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // -------------------------------------------------------------------
  // 内部:播放队列管理
  // -------------------------------------------------------------------

  /** 若队列非空且未在播放,启动播放循环。 */
  private maybeStartPlayback(language: 'en' | 'ja'): void {
    if (this.isPlaying || this.queue.length === 0 || this.isStopped) return;
    this.isPlaying = true;
    // 将播放循环链入 playbackChain,保证句子顺序播放
    this.playbackChain = this.playbackChain.then(() =>
      this.playQueue(language),
    );
  }

  /** 顺序播放队列中的所有句子,直到队列空或被停止。 */
  private async playQueue(language: 'en' | 'ja'): Promise<void> {
    while (this.queue.length > 0 && !this.isStopped) {
      const sentence = this.queue.shift()!;
      try {
        await speakSentence(sentence, language);
      } catch (e) {
        // 单句失败不中断整条管线
        console.error('[streaming-pipeline] sentence playback failed:', e);
      }
    }
    this.isPlaying = false;
  }

  /** 重置管线状态(每次 start 前调用)。 */
  private reset(): void {
    this.buffer = '';
    this.queue = [];
    this.isPlaying = false;
    this.isStopped = false;
    this.playbackChain = Promise.resolve();
  }
}

/**
 * 将纯文本包装为单次 yield 的 AsyncGenerator,供流式管线使用。
 * 用于已具备完整文本的场景(如反馈朗读),仍可享受句子级分段播放:
 * 第一句合成播放的同时,后续句子在队列中等待,首句延迟更低。
 */
export async function* textToStream(text: string): AsyncGenerator<string> {
  if (text) yield text;
}
