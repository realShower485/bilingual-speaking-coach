// =====================================================================
// 麦克风录音与音频捕获
// ---------------------------------------------------------------------
// 基于 Web API(MediaRecorder + AudioContext + AnalyserNode):
//   - getUserMedia 获取麦克风
//   - MediaRecorder 录制音频(默认 webm/opus)
//   - AnalyserNode 实时计算音量级别,供 UI 显示波形
//
// 说明:本模块仅使用浏览器/Tauri WebView 提供的 Web API,
//       类型定义来自 lib.dom.d.ts(tsconfig 已包含 DOM lib)。
// =====================================================================

type RecordingState = 'idle' | 'recording' | 'stopping';

class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private state: RecordingState = 'idle';

  // 音量分析相关
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private volumeArray: Uint8Array | null = null;
  private volumeLevel = 0;

  /** 当前是否正在录音。 */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * 开始录音。
   * @throws 麦克风权限被拒 / 设备不存在 / 浏览器不支持
   */
  async start(): Promise<void> {
    if (this.state === 'recording') {
      throw new Error('已经在录音中,请先停止当前录音。');
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new Error('当前环境不支持麦克风采集(getUserMedia 不可用)。');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('当前环境不支持 MediaRecorder API。');
    }

    // 获取麦克风
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('麦克风权限被拒绝,请在浏览器/Tauri 设置中允许麦克风访问。');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('未找到可用的麦克风设备。');
      }
      if (err.name === 'NotReadableError') {
        throw new Error('麦克风被其他程序占用,无法访问。');
      }
      throw new Error(`麦克风获取失败:${err.message || err.name}`);
    }

    this.mediaStream = stream;
    this.chunks = [];

    // 选择一个被支持的 mimeType,优先 webm/opus
    const mimeType = this.pickSupportedMimeType();

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder = recorder;
    recorder.start(100); // 每 100ms 触发一次 ondataavailable,便于实时性
    this.state = 'recording';

    // 设置音量分析
    this.setupAnalyser(stream);
  }

  /**
   * 停止录音并返回音频 Blob。
   * @returns 录制的音频 Blob(webm/opus 或浏览器支持的格式)
   */
  stop(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (this.state !== 'recording' || !this.mediaRecorder) {
        reject(new Error('当前未在录音,无法停止。'));
        return;
      }
      this.state = 'stopping';

      this.mediaRecorder.onstop = () => {
        try {
          const type = this.mediaRecorder?.mimeType || 'audio/webm';
          const blob = new Blob(this.chunks, { type });
          this.teardown();
          this.state = 'idle';
          resolve(blob);
        } catch (e) {
          this.teardown();
          this.state = 'idle';
          reject(e);
        }
      };

      this.mediaRecorder.onerror = (e: Event) => {
        this.teardown();
        this.state = 'idle';
        reject(new Error(`录音出错:${(e as ErrorEvent)?.message ?? '未知错误'}`));
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        this.teardown();
        this.state = 'idle';
        reject(e);
      }
    });
  }

  /** 取消录音(不返回数据,立即释放资源)。 */
  cancel(): void {
    if (this.state === 'idle') return;
    this.state = 'idle';
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        // 移除回调以避免触发 stop 的 Promise 路径
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
        this.mediaRecorder.stop();
      }
    } catch {
      /* 忽略取消时的错误 */
    }
    this.teardown();
  }

  /**
   * 获取当前音量级别(0~1),用于 UI 波形显示。
   * 需在 start() 之后调用,否则返回 0。
   */
  getVolumeLevel(): number {
    if (!this.analyser || !this.volumeArray) return 0;
    this.analyser.getByteTimeDomainData(this.volumeArray as Uint8Array<ArrayBuffer>);

    // 计算 RMS(均方根)音量
    let sum = 0;
    for (let i = 0; i < this.volumeArray.length; i++) {
      const v = (this.volumeArray[i] - 128) / 128; // 归一化到 -1~1
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.volumeArray.length);
    // 归一化到 0~1,适度放大以提升 UI 感知
    this.volumeLevel = Math.min(1, rms * 2.5);
    return this.volumeLevel;
  }

  /** 获取当前录音使用的 MIME 类型(用于 STT 上传时扩展名判断)。 */
  getMimeType(): string {
    return this.mediaRecorder?.mimeType || 'audio/webm';
  }

  // ===== 内部工具 =====

  private pickSupportedMimeType(): string | undefined {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch {
        /* 忽略 */
      }
    }
    return undefined;
  }

  private setupAnalyser(stream: MediaStream): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);
      this.volumeArray = new Uint8Array(this.analyser.fftSize);
    } catch {
      // 音量分析非关键功能,失败不影响录音
      this.analyser = null;
    }
  }

  private teardown(): void {
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* 忽略 */
    }
    this.sourceNode = null;
    this.analyser = null;
    this.volumeArray = null;

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        /* 忽略 */
      }
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* 忽略 */
        }
      });
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.chunks = [];
    this.volumeLevel = 0;
  }
}

export const audioRecorder = new AudioRecorder();
