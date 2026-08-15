import { useEffect, useState } from 'react';
import type { ContextType, Session, Turn } from '../types';
import * as db from '../services/db';

interface Props {
  /** 当前历史列表中的会话，统计会随筛选条件同步变化。 */
  sessions: Session[];
}

interface Stats {
  completedTurns: number;
  semanticMatches: number;
  totalMinutes: number;
  errorOccurrences: number;
  contextCounts: Record<ContextType, number>;
}

const EMPTY_STATS: Stats = {
  completedTurns: 0,
  semanticMatches: 0,
  totalMinutes: 0,
  errorOccurrences: 0,
  contextCounts: {
    free_chat: 0,
    roleplay: 0,
    topic_discussion: 0,
  },
};

const CONTEXT_LABELS: Record<ContextType, string> = {
  free_chat: '自由聊天',
  roleplay: '角色扮演',
  topic_discussion: '主题讨论',
};

function buildStats(sessions: Session[], turnsBySession: Turn[][]): Stats {
  const allTurns = turnsBySession.flat();
  const completedTurns = allTurns.filter((turn) => turn.feedback);
  const semanticMatches = completedTurns.filter(
    (turn) => turn.feedback?.semanticConsistency,
  ).length;
  const errorOccurrences = completedTurns.reduce(
    (sum, turn) => sum + (turn.feedback?.errorWords.length ?? 0),
    0,
  );
  const totalMinutes = Math.round(
    sessions.reduce((sum, session) => {
      if (!session.endedAt || session.endedAt < session.startedAt) return sum;
      return sum + (session.endedAt - session.startedAt) / 60_000;
    }, 0),
  );

  const contextCounts: Stats['contextCounts'] = {
    free_chat: 0,
    roleplay: 0,
    topic_discussion: 0,
  };
  sessions.forEach((session) => {
    contextCounts[session.contextType] += 1;
  });

  return {
    completedTurns: completedTurns.length,
    semanticMatches,
    totalMinutes,
    errorOccurrences,
    contextCounts,
  };
}

export function LearningStats({ sessions }: Props) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    Promise.all(sessions.map((session) => db.getTurnsBySession(session.id)))
      .then((turnsBySession) => {
        if (active) setStats(buildStats(sessions, turnsBySession));
      })
      .catch(() => {
        if (active) setStats(EMPTY_STATS);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessions]);

  if (isLoading) {
    return (
      <section
        className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4 text-sm text-[var(--text-secondary)]"
        aria-busy="true"
      >
        正在汇总学习数据…
      </section>
    );
  }

  if (sessions.length === 0) return null;

  const consistency =
    stats.completedTurns === 0
      ? '—'
      : `${Math.round((stats.semanticMatches / stats.completedTurns) * 100)}%`;

  return (
    <section className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          学习概览
        </h3>
        <span className="text-xs text-[var(--text-tertiary)]">
          随当前筛选条件变化
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="完成回合" value={String(stats.completedTurns)} />
        <StatCard label="语义一致率" value={consistency} />
        <StatCard label="练习时长" value={`${stats.totalMinutes} 分钟`} />
        <StatCard label="待复习错误" value={String(stats.errorOccurrences)} />
      </div>

      <div className="mt-4 border-t border-[var(--border-light)] pt-3">
        <p className="mb-2 text-xs text-[var(--text-secondary)]">情境分布</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONTEXT_LABELS) as ContextType[]).map((type) => (
            <span
              key={type}
              className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              {CONTEXT_LABELS[type]} {stats.contextCounts[type]} 次
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-secondary)] px-3 py-2">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}
