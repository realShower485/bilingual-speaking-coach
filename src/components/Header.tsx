import { useEffect, useState } from 'react';
import type {
  ContextType,
  EnglishDifficulty,
  JapaneseDifficulty,
  ScenarioItem,
  TopicItem,
} from '../types';
import { getEnglishDifficulties, getJapaneseDifficulties } from '../services/difficultyHelper';
import { getAllScenarios, getAllTopics } from '../services/contextManager';
import { scenarioLibrary, topicLibrary } from '../services/libraries';
import { useUiStore } from '../store/uiStore';

interface Props {
  contextType: ContextType;
  englishDifficulty: EnglishDifficulty;
  japaneseDifficulty: JapaneseDifficulty;
  scenarioId: string;
  topicId: string;
  disabled: boolean;
  onContextTypeChange: (v: ContextType) => void;
  onEnglishDifficultyChange: (v: EnglishDifficulty) => void;
  onJapaneseDifficultyChange: (v: JapaneseDifficulty) => void;
  onScenarioChange: (v: string) => void;
  onTopicChange: (v: string) => void;
  onOpenSettings: () => void;
  onEndSession: () => void;
}

interface NavItem {
  key: 'training' | 'history' | 'vocabulary' | 'settings';
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'training', label: '训练' },
  { key: 'history', label: '历史' },
  { key: 'vocabulary', label: '词汇本' },
  { key: 'settings', label: '设置' },
];

const CONTEXT_TYPES: { value: ContextType; label: string }[] = [
  { value: 'free_chat', label: '自由聊天' },
  { value: 'roleplay', label: '角色扮演' },
  { value: 'topic_discussion', label: '主题讨论' },
];

const selectClass =
  'rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-2.5 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * 顶栏:Notion 风格 — 简洁导航 + 训练参数选择。
 */
export function Header({
  contextType,
  englishDifficulty,
  japaneseDifficulty,
  scenarioId,
  topicId,
  disabled,
  onContextTypeChange,
  onEnglishDifficultyChange,
  onJapaneseDifficultyChange,
  onScenarioChange,
  onTopicChange,
  onOpenSettings,
  onEndSession,
}: Props) {
  const [scenarios, setScenarios] = useState<ScenarioItem[]>(scenarioLibrary.scenarios);
  const [topics, setTopics] = useState<TopicItem[]>(topicLibrary.topics);

  const activeView = useUiStore((s) => s.activeView);
  const setActiveView = useUiStore((s) => s.setActiveView);

  useEffect(() => {
    let active = true;
    getAllScenarios().then((s) => { if (active) setScenarios(s); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getAllTopics().then((t) => { if (active) setTopics(t); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const englishDifficulties = getEnglishDifficulties();
  const japaneseDifficulties = getJapaneseDifficulties();
  const isTraining = activeView === 'training';

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border-light)] bg-[var(--bg-primary)] px-4 py-2.5">
      {/* 标题 */}
      <h1 className="mr-3 text-base font-semibold text-[var(--text-primary)]">
        双语口语训练
      </h1>

      {/* 主导航 */}
      <nav className="flex gap-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() =>
              item.key === 'settings' ? onOpenSettings() : setActiveView(item.key)
            }
            className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
              activeView === item.key
                ? 'bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* 训练视图专属控件 */}
      {isTraining && (
        <>
          <div className="mx-1 h-5 w-px bg-[var(--border-default)]" />

          {/* 情境类型 */}
          <div className="flex gap-0.5 rounded-md bg-[var(--bg-tertiary)] p-0.5">
            {CONTEXT_TYPES.map((ct) => (
              <button
                key={ct.value}
                disabled={disabled}
                onClick={() => onContextTypeChange(ct.value)}
                className={`rounded px-2.5 py-0.5 text-xs transition-colors ${
                  contextType === ct.value
                    ? 'bg-[var(--bg-primary)] font-medium text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* 难度 */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-[var(--accent)]">EN</span>
            <select
              disabled={disabled}
              value={englishDifficulty}
              onChange={(e) => onEnglishDifficultyChange(e.target.value as EnglishDifficulty)}
              className={selectClass}
            >
              {englishDifficulties.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-[var(--rose)]">JA</span>
            <select
              disabled={disabled}
              value={japaneseDifficulty}
              onChange={(e) => onJapaneseDifficultyChange(e.target.value as JapaneseDifficulty)}
              className={selectClass}
            >
              {japaneseDifficulties.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* 场景/主题选择 */}
          {contextType === 'roleplay' && (
            <select
              disabled={disabled}
              value={scenarioId}
              onChange={(e) => onScenarioChange(e.target.value)}
              className={`${selectClass} max-w-[10rem]`}
            >
              <option value="">选择场景...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.title.zh}</option>
              ))}
            </select>
          )}
          {contextType === 'topic_discussion' && (
            <select
              disabled={disabled}
              value={topicId}
              onChange={(e) => onTopicChange(e.target.value)}
              className={`${selectClass} max-w-[10rem]`}
            >
              <option value="">选择主题...</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title.zh}</option>
              ))}
            </select>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {disabled && (
          <button
            onClick={onEndSession}
            className="rounded-md px-2.5 py-1 text-sm text-[var(--rose)] transition-colors hover:bg-[var(--rose-light)]"
          >
            结束会话
          </button>
        )}
      </div>
    </header>
  );
}
