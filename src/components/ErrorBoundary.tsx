import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界:捕获子树渲染错误,避免整页白屏。
 * 提供友好界面 + "重试"按钮(重置内部 state,触发重新渲染)。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 仅在控制台打印,便于调试;不写入文件系统以免泄露用户数据。
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, info);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const errMsg = this.state.error?.message ?? '未知错误';

    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg-primary)] p-6 text-[var(--text-primary)]">
        <div className="w-full max-w-md space-y-4 rounded-lg border-[var(--rose)] opacity-50 bg-[var(--bg-secondary)] p-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">😵</span>
            <h2 className="text-base font-semibold text-[var(--rose)]">
              应用遇到错误
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            页面渲染时发生异常。可以尝试重试当前操作,或重新加载应用。
          </p>
          <details className="rounded-lg bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]">
            <summary className="cursor-pointer select-none text-[var(--text-tertiary)]">
              查看错误详情
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono">
              {errMsg}
            </pre>
          </details>
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
            >
              重试
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 rounded-lg border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              重新加载应用
            </button>
          </div>
        </div>
      </div>
    );
  }
}
