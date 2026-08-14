import { useMemo } from 'react';
import type { ErrorWord } from '../types';
import { useVocabulary } from '../hooks/useVocabulary';

interface Props {
  /** 返回训练视图(顶栏导航也会切换,这里仅作语义按钮)。 */
  onBack?: () => void;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 易错词本:分英语 / 日语两个 Tab 显示易错词列表,
 * 支持关键词搜索、按出错次数排序、点击"重新听讲解"调用 LLM 重新解释。
 */
export function VocabularyPanel({ onBack }: Props) {
  const {
    errorWords,
    isLoading,
    error,
    activeLanguage,
    setActiveLanguage,
    searchQuery,
    setSearchQuery,
    requestExplanation,
    explainingKey,
    refresh,
  } = useVocabulary();

  // 按当前语言过滤 + 关键词搜索 + 按出错次数倒序排序
  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return errorWords
      .filter((w) => w.language === activeLanguage)
      .filter((w) => (q ? w.word.toLowerCase().includes(q) : true))
      .sort((a, b) => b.count - a.count);
  }, [errorWords, activeLanguage, searchQuery]);

  const totalEn = useMemo(
    () => errorWords.filter((w) => w.language === 'en').length,
    [errorWords],
  );
  const totalJa = useMemo(
    () => errorWords.filter((w) => w.language === 'ja').length,
    [errorWords],
  );

  const TABS: { value: 'en' | 'ja'; label: string; count: number }[] = [
    { value: 'en', label: '英语易错词', count: totalEn },
    { value: 'ja', label: '日语易错词', count: totalJa },
  ];

  const inputClass =
    'rounded-lg border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* 标题 + 操作 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">易错词本</h2>
          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              disabled={isLoading}
              className="rounded-lg border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              {isLoading ? '加载中…' : '↻ 刷新'}
            </button>
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-lg border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                ← 返回训练
              </button>
            )}
          </div>
        </div>

        {/* 语言切换 Tab */}
        <div className="flex gap-1 rounded-lg bg-[var(--bg-tertiary)] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveLanguage(tab.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-1.5 text-sm transition ${
                activeLanguage === tab.value
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{tab.value === 'en' ? '🇬🇧' : '🇯🇵'}</span>
              <span>{tab.label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  activeLanguage === tab.value
                    ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                    : 'bg-[var(--border-strong)] text-[var(--text-secondary)]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="flex items-center gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`搜索${activeLanguage === 'en' ? '英语' : '日语'}单词…`}
            className={`${inputClass} w-full`}
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)]"
            >
              ✕ 清除
            </button>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg border-[var(--rose)] opacity-40 bg-[var(--rose-light)] px-4 py-3 text-sm text-[var(--rose)]">
            ⚠ {error}
          </div>
        )}

        {/* 列表 */}
        {isLoading ? (
          <ul className="space-y-2.5" aria-busy="true" aria-label="加载易错词中">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="rounded-lg border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-5 w-24 animate-pulse rounded bg-[var(--border-strong)]" />
                      <div className="h-4 w-10 animate-pulse rounded bg-[var(--border-strong)]" />
                      <div className="h-4 w-12 animate-pulse rounded bg-[var(--border-strong)]" />
                      <div className="h-3 w-20 animate-pulse rounded bg-[var(--border-strong)]" />
                    </div>
                    <div className="h-8 w-full animate-pulse rounded bg-[var(--border-strong)]" />
                  </div>
                  <div className="h-7 w-24 shrink-0 animate-pulse rounded-lg bg-[var(--border-strong)]" />
                </div>
              </li>
            ))}
          </ul>
        ) : filteredWords.length === 0 ? (
          <EmptyState
            language={activeLanguage}
            hasSearch={!!searchQuery.trim()}
          />
        ) : (
          <ul className="space-y-2.5">
            {filteredWords.map((word) => (
              <ErrorWordCard
                key={`${word.language}:${word.word}`}
                word={word}
                isExplaining={explainingKey === `${word.language}:${word.word}`}
                onReExplain={() => void requestExplanation(word)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface ErrorWordCardProps {
  word: ErrorWord;
  isExplaining: boolean;
  onReExplain: () => void;
}

function ErrorWordCard({ word, isExplaining, onReExplain }: ErrorWordCardProps) {
  const langBadge =
    word.language === 'en'
      ? 'bg-[var(--accent-light)] text-[var(--accent)]'
      : 'bg-[var(--rose-light)] text-[var(--rose)]';

  return (
    <li className="rounded-lg border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {/* 顶部:单词 + 计数 + 语言 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-[var(--text-primary)]">
              {word.word}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${langBadge}`}
            >
              {word.language === 'en' ? 'EN' : 'JA'}
            </span>
            <span
              className="rounded bg-[var(--amber-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--amber)]"
              title="累计出错次数"
            >
              ⚠ ×{word.count}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              首次:{formatDateTime(word.firstSeenAt)}
            </span>
          </div>

          {/* 最近一次 AI 解释 */}
          {word.lastExplanation ? (
            <div className="whitespace-pre-wrap rounded bg-[var(--bg-secondary)] p-2 text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--amber)]">最近 AI 解释:</span>{' '}
              {word.lastExplanation}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">尚无 AI 解释,点击右侧按钮获取。</p>
          )}
        </div>

        {/* 重新听讲解按钮 */}
        <button
          onClick={onReExplain}
          disabled={isExplaining}
          className="shrink-0 rounded-lg border-[var(--amber)] opacity-50 px-3 py-1.5 text-xs text-[var(--amber)] transition hover:bg-[var(--amber-light)] disabled:cursor-not-allowed disabled:opacity-50"
          title="调用 AI 重新生成解释"
        >
          {isExplaining ? '⏳ 生成中…' : '🔁 重新听讲解'}
        </button>
      </div>
    </li>
  );
}

/** 空状态:无易错词或无搜索结果时显示。 */
function EmptyState({
  language,
  hasSearch,
}: {
  language: 'en' | 'ja';
  hasSearch: boolean;
}) {
  const langLabel = language === 'en' ? '英语' : '日语';
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] py-16 text-center">
      <span className="text-5xl opacity-60">
        {hasSearch ? '🔍' : '📚'}
      </span>
      <h3 className="text-base font-semibold text-[var(--text-secondary)]">
        {hasSearch
          ? `未找到匹配的${langLabel}易错词`
          : `还没有${langLabel}易错词`}
      </h3>
      <p className="max-w-sm text-xs text-[var(--text-tertiary)]">
        {hasSearch
          ? '尝试更换关键词,或清除搜索查看全部。'
          : '在训练中,当 AI 识别到你的易错词时会自动记录到这里。'}
      </p>
    </div>
  );
}
