import { useCallback, useEffect, useState } from 'react';
import type { ContextType, Session, Turn } from '../types';
import * as db from '../services/db';

export interface HistoryFilters {
  contextType: ContextType | 'all';
  /** 起始日期(YYYY-MM-DD,本地时区零点起)。 */
  startDate: string | null;
  /** 截止日期(YYYY-MM-DD,本地时区当日结束)。 */
  endDate: string | null;
}

export interface SelectedSession {
  session: Session;
  turns: Turn[];
}

export const DEFAULT_FILTERS: HistoryFilters = {
  contextType: 'all',
  startDate: null,
  endDate: null,
};

/** 将 YYYY-MM-DD 字符串转为当日 00:00:00 的毫秒时间戳。 */
function startDateToTs(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

/** 将 YYYY-MM-DD 字符串转为当日 23:59:59.999 的毫秒时间戳。 */
function endDateToTs(date: string): number {
  return new Date(`${date}T23:59:59.999`).getTime();
}

/**
 * 历史会话数据 hook:加载所有 sessions(倒序),支持按情境类型与日期范围筛选,
 * 点击卡片可加载并查看该会话的完整回合列表。
 */
export function useHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [selectedSession, setSelectedSession] =
    useState<SelectedSession | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all = await db.getAllSessions();
      const filtered = all.filter((s) => {
        if (filters.contextType !== 'all' && s.contextType !== filters.contextType) {
          return false;
        }
        if (filters.startDate && s.startedAt < startDateToTs(filters.startDate)) {
          return false;
        }
        if (filters.endDate && s.startedAt > endDateToTs(filters.endDate)) {
          return false;
        }
        return true;
      });
      setSessions(filtered);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectSession = useCallback(async (session: Session) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const turns = await db.getTurnsBySession(session.id);
      setSelectedSession({ session, turns });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSession(null);
  }, []);

  return {
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
  };
}
