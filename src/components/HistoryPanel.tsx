import { memo, useEffect, useState } from 'react';
import type { ContextType, ScenarioItem, Session, TopicItem, Turn } from '../types';
import { useHistory } from '../hooks/useHistory';
import { OptimalOutcomeArchive } from './OptimalOutcomeArchive';
import { LearningStats } from './LearningStats';
import { getAllScenarios, getAllTopics } from '../services/contextManager';
import * as db from '../services/db';

interface Props {
  /** 返回训练视图(顶栏导航也会切换,这里仅作"返回列表"语义)。 */
  onBack?: () => void;
}

const CONTEXT_OPTIONS: { value: ContextType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: '全部', icon: '🗂' },
  { value: 'free_chat', label: '自由聊天', icon: '💬' },
  { value: 'roleplay', label: '角色扮演', icon: '🎭' },
  { value: 'topic_discussion', label: '主题讨论', icon: '🗣' },
];

const CONTEXT_LABELS: Record<ContextType, { label: string; icon: string }> = {
  free_chat: { label: '自由聊天', icon: '💬' },
  roleplay: { label: '角色扮演', icon: '🎭' },
  topic_discussion: { label: '主题讨论', icon: '🗣' },
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 计算会话时长(endedAt - startedAt),返回可读字符串。 */
function formatDuration(session: Session): string {
  if (!session.endedAt) return '进行中 / 未结束';
  const ms = session.endedAt - session.startedAt;
  if (ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} 秒`;
  if (min < 60) return `${min} 分 ${sec} 秒`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr} 时 ${remMin} 分`;
}

/** yyyy-mm-dd 今天的本地日期,用于 date input 默认值上限。 */
function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 格式化单一语言的难度显示。
 * - 自动模式且仍为 auto(尚未调整):"auto"
 * - 自动模式且已选定具体等级:"auto→{level}"
 * - 手动模式:"{level}"
 */
function formatDifficulty(
  difficulty: string,
  isAuto: boolean,
): string {
  if (isAuto && difficulty !== 'auto') return `auto→${difficulty}`;
  return difficulty;
}

/** 格式化会话的英日双难度,形如 "EN: B2 | JA: auto→N3"。 */
function formatSessionDifficulties(session: Session): string {
  return `EN: ${formatDifficulty(session.englishDifficulty, session.autoEnglishDifficulty)} | JA: ${formatDifficulty(session.japaneseDifficulty, session.autoJapaneseDifficulty)}`;
}

/**
 * 历史会话面板:顶部筛选栏 + 会话列表卡片。
 * 点击卡片切换到详情视图(完整回合列表)。
 */
export function HistoryPanel({ onBack }: Props) {
  const {
    sessions,
    isLoading,
    isLoadingDetail,
    error,
    filters,
    setFilters,
    selectedSession,
    selectSession,
    clearSelection,
    refresh,
  } = useHistory();

  // 预加载场景/主题列表,用于将 session.scenario(id) 映射为可读名称
  const [scenarioMap, setScenarioMap] = useState<Record<string, ScenarioItem>>(
    {},
  );
  const [topicMap, setTopicMap] = useState<Record<string, TopicItem>>({});

  useEffect(() => {
    let active = true;
    Promise.all([getAllScenarios(), getAllTopics()])
      .then(([scenarios, topics]) => {
        if (!active) return;
        const smap: Record<string, ScenarioItem> = {};
        scenarios.forEach((s) => (smap[s.id] = s));
        setScenarioMap(smap);
        const tmap: Record<string, TopicItem> = {};
        topics.forEach((t) => (tmap[t.id] = t));
        setTopicMap(tmap);
      })
      .catch(() => {
        /* 忽略,名称解析失败时回退到 id */
      });
    return () => {
      active = false;
    };
  }, []);

  const getScenarioLabel = (session: Session): string => {
    if (!session.scenario) return '';
    if (session.contextType === 'roleplay') {
      return scenarioMap[session.scenario]?.title.zh ?? session.scenario;
    }
    if (session.contextType === 'topic_discussion') {
      return topicMap[session.scenario]?.title.zh ?? session.scenario;
    }
    return session.scenario;
  };

  // ===== 详情视图 =====
  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession.session}
        turns={selectedSession.turns}
        scenarioLabel={getScenarioLabel(selectedSession.session)}
        isLoadingDetail={isLoadingDetail}
        error={error}
        onBack={clearSelection}
      />
    );
  }

  // ===== 列表视图 =====
  const inputClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
  const today = todayStr();

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* 标题 + 操作 */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">历史会话</h2>
          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              disabled={isLoading}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              {isLoading ? '加载中…' : '↻ 刷新'}
            </button>
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                ← 返回训练
              </button>
            )}
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="space-y-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">情境:</span>
            <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
              {CONTEXT_OPTIONS.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() =>
                    setFilters({ ...filters, contextType: ct.value })
                  }
                  className={`rounded px-2.5 py-1 text-xs transition ${
                    filters.contextType === ct.value
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {ct.icon} {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              起始:
              <input
                type="date"
                value={filters.startDate ?? ''}
                max={filters.endDate ?? today}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    startDate: e.target.value || null,
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              截止:
              <input
                type="date"
                value={filters.endDate ?? ''}
                min={filters.startDate ?? undefined}
                max={today}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    endDate: e.target.value || null,
                  })
                }
                className={inputClass}
              />
            </label>
            {(filters.contextType !== 'all' ||
              filters.startDate ||
              filters.endDate) && (
              <button
                onClick={() =>
                  setFilters({
                    contextType: 'all',
                    startDate: null,
                    endDate: null,
                  })
                }
                className="text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)]"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

        <LearningStats sessions={sessions} />

        {/* 错误提示 */}
        {error && (
          <div className="rounded-lg border border-[var(--rose)] opacity-40 bg-[var(--rose-light)] px-4 py-3 text-sm text-[var(--rose)]">
            ⚠ {error}
          </div>
        )}

        {/* 列表 */}
        {isLoading ? (
          <ul className="space-y-2.5" aria-busy="true" aria-label="加载历史会话中">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 animate-pulse rounded bg-[var(--border-strong)]" />
                        <div className="h-4 w-20 animate-pulse rounded bg-[var(--border-strong)]" />
                        <div className="h-4 w-12 animate-pulse rounded bg-[var(--border-strong)]" />
                      </div>
                      <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--border-strong)]" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--border-strong)]" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="h-3 w-16 animate-pulse rounded bg-[var(--border-strong)]" />
                      <div className="h-3 w-14 animate-pulse rounded bg-[var(--border-strong)]" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2.5">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                scenarioLabel={getScenarioLabel(s)}
                onSelect={selectSession}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: Session;
  scenarioLabel: string;
  onSelect: (s: Session) => void;
}

/**
 * 历史会话卡片。使用 React.memo 避免父组件(HistoryPanel)在筛选状态变化时
 * 不必要地重渲染所有已有卡片;仅当 session/scenarioLabel/onSelect 变化时才重渲染。
 */
const SessionCard = memo(function SessionCard({
  session,
  scenarioLabel,
  onSelect,
}: SessionCardProps) {
  const ctx = CONTEXT_LABELS[session.contextType];
  return (
    // cv-auto = content-visibility:auto,长列表(>50 条)时浏览器自动跳过屏幕外卡片渲染
    <li className="cv-auto">
      <button
        onClick={() => void onSelect(session)}
        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-base">{ctx.icon}</span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {ctx.label}
              </span>
              <span className="rounded bg-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                {formatSessionDifficulties(session)}
              </span>
              {(session.autoEnglishDifficulty || session.autoJapaneseDifficulty) && (
                <span className="rounded bg-[var(--emerald-light)] px-1.5 py-0.5 text-[10px] text-[var(--emerald)]">
                  自动
                </span>
              )}
            </div>
            {scenarioLabel && (
              <p className="truncate text-xs text-[var(--text-secondary)]">
                📌 {scenarioLabel}
              </p>
            )}
            <p className="text-xs text-[var(--text-tertiary)]">
              {formatDateTime(session.startedAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-[var(--text-tertiary)]">
            <TurnCount session={session} />
            <span>时长:{formatDuration(session)}</span>
          </div>
        </div>
      </button>
    </li>
  );
});

/** 卡片右侧的回合数(异步加载,在列表渲染时通过该子组件 lazy 取值)。 */
function TurnCount({ session }: { session: Session }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    db.getTurnsBySession(session.id)
      .then((turns) => {
        if (active) setCount(turns.length);
      })
      .catch(() => {
        if (active) setCount(0);
      });
    return () => {
      active = false;
    };
  }, [session.id]);
  return <span>回合数:{count === null ? '…' : count}</span>;
}

/** 空状态:无历史记录时显示。 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] py-16 text-center">
      <span className="text-5xl opacity-60">📭</span>
      <h3 className="text-base font-semibold text-[var(--text-secondary)]">
        还没有历史会话
      </h3>
      <p className="max-w-sm text-xs text-[var(--text-tertiary)]">
        完成一次训练后,历史会话将出现在这里。可在顶栏点击「训练」开始练习。
      </p>
    </div>
  );
}

// =====================================================================
// 会话详情视图
// =====================================================================

interface SessionDetailProps {
  session: Session;
  turns: Turn[];
  scenarioLabel: string;
  isLoadingDetail: boolean;
  error: string | null;
  onBack: () => void;
}

function SessionDetail({
  session,
  turns,
  scenarioLabel,
  isLoadingDetail,
  error,
  onBack,
}: SessionDetailProps) {
  const ctx = CONTEXT_LABELS[session.contextType];

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* 顶栏:返回 + 概要 */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            ← 返回列表
          </button>
          <span className="text-xs text-[var(--text-tertiary)]">
            {formatDateTime(session.startedAt)}
          </span>
        </div>

        {/* 会话元信息卡片 */}
        <div className="space-y-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base">{ctx.icon}</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {ctx.label}
            </span>
            <span className="rounded bg-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              {formatSessionDifficulties(session)}
            </span>
            {(session.autoEnglishDifficulty || session.autoJapaneseDifficulty) && (
              <span className="rounded bg-[var(--emerald-light)] px-1.5 py-0.5 text-[10px] text-[var(--emerald)]">
                自动难度
              </span>
            )}
          </div>
          {scenarioLabel && (
            <p className="text-xs text-[var(--text-secondary)]">📌 {scenarioLabel}</p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-tertiary)]">
            <span>开始:{formatDateTime(session.startedAt)}</span>
            <span>结束:{session.endedAt ? formatDateTime(session.endedAt) : '—'}</span>
            <span>时长:{formatDuration(session)}</span>
            <span>回合数:{isLoadingDetail ? '加载中…' : turns.length}</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--rose)] opacity-40 bg-[var(--rose-light)] px-4 py-3 text-sm text-[var(--rose)]">
            ⚠ {error}
          </div>
        )}

        {/* 回合列表 */}
        {isLoadingDetail ? (
          <ol className="space-y-3" aria-busy="true" aria-label="加载回合列表中">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="h-3 w-16 animate-pulse rounded bg-[var(--border-strong)]" />
                  <div className="h-3 w-20 animate-pulse rounded bg-[var(--border-strong)]" />
                </div>
                <div className="mb-3 h-10 w-full animate-pulse rounded bg-[var(--border-strong)]" />
                <div className="space-y-1.5">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--border-strong)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--border-strong)]" />
                </div>
              </li>
            ))}
          </ol>
        ) : turns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] py-12 text-center text-sm text-[var(--text-tertiary)]">
            该会话没有回合记录。
          </div>
        ) : (
          <ol className="space-y-3">
            {turns.map((turn, idx) => (
              <li
                key={turn.id}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--accent)]">
                    回合 {idx + 1}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {formatDate(turn.createdAt)}
                  </span>
                </div>

                {/* 情境 */}
                {turn.contextGiven && (
                  <div className="mb-3 rounded bg-[var(--bg-secondary)] p-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-medium text-[var(--text-secondary)]">📋 情境:</span>{' '}
                    {turn.contextGiven}
                  </div>
                )}

                {/* 用户双语表达 */}
                <div className="space-y-1.5 text-sm">
                  {turn.englishInput && (
                    <p className="text-[var(--text-primary)]">
                      <span className="font-medium text-[var(--accent)]">EN:</span>{' '}
                      {turn.englishInput}
                    </p>
                  )}
                  {turn.japaneseInput && (
                    <p className="text-[var(--text-primary)]">
                      <span className="font-medium text-[var(--rose)]">JA:</span>{' '}
                      {turn.japaneseInput}
                    </p>
                  )}
                </div>

                {/* AI 反馈(简化) */}
                {turn.feedback ? (
                  <div className="mt-3 space-y-1.5 border-t border-[var(--border-light)] pt-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)]">语义一致:</span>
                      <span
                        className={
                          turn.feedback.semanticConsistency
                            ? 'text-[var(--emerald)]'
                            : 'text-[var(--amber)]'
                        }
                      >
                        {turn.feedback.semanticConsistency ? '✓ 一致' : '✗ 不一致'}
                      </span>
                    </div>
                    {turn.feedback.englishFeedback && (
                      <p className="text-[var(--text-secondary)]">
                        <span className="text-[var(--accent)] opacity-80">EN 反馈:</span>{' '}
                        {turn.feedback.englishFeedback}
                      </p>
                    )}
                    {turn.feedback.japaneseFeedback && (
                      <p className="text-[var(--text-secondary)]">
                        <span className="text-[var(--rose)] opacity-80">JA 反馈:</span>{' '}
                        {turn.feedback.japaneseFeedback}
                      </p>
                    )}
                    <OptimalOutcomeArchive feedback={turn.feedback} compact />
                  </div>
                ) : (
                  <p className="mt-3 border-t border-[var(--border-light)] pt-2 text-xs text-[var(--text-tertiary)]">
                    (无 AI 反馈)
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
