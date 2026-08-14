// =====================================================================
// 打断管理 (Interruption Manager)
// ---------------------------------------------------------------------
// 在 AI 说话(TTS 播放)期间,同时打开麦克风检测音量;
// 当音量持续超过阈值超过设定时长(默认 0.5s),判定为用户开始说话,
// 触发 onInterrupt 回调(由调用方停止 TTS 并开始正式录音)。
//
// 首版采用简单的音量阈值方案;后续可替换为更精准的 VAD
// (Voice Activity Detection,如 @ricky0123/vad-web)。
// =====================================================================

import { audioRecorder } from './audioRecorder';

interface InterruptionManagerConfig {
  /** 触发打断的音量阈值(0~1),默认 0.18。 */
  volumeThreshold?: number;
  /** 音量需持续超过阈值多长时间(ms)才触发打断,默认 500ms。 */
  sustainedMs?: number;
  /** 检测轮询间隔(ms),默认 80ms。 */
  pollIntervalMs?: number;
  /** 启动后忽略前若干 ms 的输入(避免回声/启动噪声),默认 300ms。 */
  warmupMs?: number;
}

class InterruptionManager {
  private listening = false;
  private timer: number | null = null;
  private aboveThresholdSince = 0;
  private startedAt = 0;
  private onInterrupt: (() => void) | null = null;

  private readonly volumeThreshold: number;
  private readonly sustainedMs: number;
  private readonly pollIntervalMs: number;
  private readonly warmupMs: number;

  constructor(config: InterruptionManagerConfig = {}) {
    this.volumeThreshold = config.volumeThreshold ?? 0.18;
    this.sustainedMs = config.sustainedMs ?? 500;
    this.pollIntervalMs = config.pollIntervalMs ?? 80;
    this.warmupMs = config.warmupMs ?? 300;
  }

  /** 当前是否正在监听打断。 */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * 开始监听打断。在 AI 开始说话时调用。
   * 会打开麦克风(独立于正式录音的 audioRecorder 实例行为;
   * 这里复用 audioRecorder 仅用于读取音量,不读取其录音数据)。
   *
   * 注意:本管理器调用 audioRecorder.start() 占用麦克风以便读取音量。
   * 触发打断后,调用方应先 stopListening(),再开始正式录音流程。
   */
  async startListening(onInterrupt: () => void): Promise<void> {
    if (this.listening) return;
    if (audioRecorder.isRecording()) {
      // 若正式录音已在进行,不打断其流程
      return;
    }
    this.onInterrupt = onInterrupt;
    this.aboveThresholdSince = 0;
    this.startedAt = Date.now();
    this.listening = true;

    try {
      await audioRecorder.start();
    } catch (e) {
      // 麦克风无法打开时,放弃打断检测,不影响 TTS 播放
      this.listening = false;
      this.onInterrupt = null;
      console.warn('[interruption] 麦克风打开失败,放弃打断检测:', e);
      return;
    }

    this.timer = window.setInterval(() => this.tick(), this.pollIntervalMs);
  }

  /** 停止监听打断。释放麦克风。 */
  stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.onInterrupt = null;
    this.aboveThresholdSince = 0;
    // 取消录音(audioRecorder 在打断检测期间仅用于读取音量,数据不保留)
    if (audioRecorder.isRecording()) {
      audioRecorder.cancel();
    }
  }

  private tick(): void {
    if (!this.listening) return;
    const now = Date.now();
    if (now - this.startedAt < this.warmupMs) return;

    const level = audioRecorder.getVolumeLevel();
    if (level >= this.volumeThreshold) {
      if (this.aboveThresholdSince === 0) {
        this.aboveThresholdSince = now;
      } else if (now - this.aboveThresholdSince >= this.sustainedMs) {
        // 持续超过阈值达设定时长 → 触发打断
        const cb = this.onInterrupt;
        this.stopListening();
        if (cb) cb();
      }
    } else {
      // 低于阈值则重置计时
      this.aboveThresholdSince = 0;
    }
  }
}

export const interruptionManager = new InterruptionManager();
export { InterruptionManager };
