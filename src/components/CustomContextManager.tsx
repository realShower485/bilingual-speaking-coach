import { useEffect, useState, type FormEvent } from 'react';
import type { ScenarioItem, TopicItem, TrilingualText } from '../types';
import {
  addCustomScenario,
  addCustomTopic,
  deleteCustomScenario,
  deleteCustomTopic,
  getAllScenarios,
  getAllTopics,
  isCustomScenario,
  isCustomTopic,
} from '../services/contextManager';

type Tab = 'scenarios' | 'topics';

const EMPTY_TEXT: TrilingualText = { zh: '', en: '', ja: '' };

function withFallback(text: TrilingualText): TrilingualText {
  const zh = text.zh.trim();
  return { zh, en: text.en.trim() || zh, ja: text.ja.trim() || zh };
}

function TextFields({
  value,
  onChange,
  label,
  required = false,
}: {
  value: TrilingualText;
  onChange: (next: TrilingualText) => void;
  label: string;
  required?: boolean;
}) {
  const inputClass =
    'mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

  return (
    <fieldset>
      <legend className="text-xs text-[var(--text-secondary)]">
        {label}{required ? '（中文必填）' : '（中文必填，英/日可选）'}
      </legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-3">
        <input
          required={required}
          value={value.zh}
          onChange={(event) => onChange({ ...value, zh: event.target.value })}
          className={inputClass}
          placeholder="中文"
        />
        <input
          value={value.en}
          onChange={(event) => onChange({ ...value, en: event.target.value })}
          className={inputClass}
          placeholder="English（留空使用中文）"
        />
        <input
          value={value.ja}
          onChange={(event) => onChange({ ...value, ja: event.target.value })}
          className={inputClass}
          placeholder="日本語（留空使用中文）"
        />
      </div>
    </fieldset>
  );
}

/** 管理用户自己创建的角色扮演场景和讨论主题。 */
export function CustomContextManager() {
  const [tab, setTab] = useState<Tab>('scenarios');
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState<TrilingualText>(EMPTY_TEXT);
  const [scenarioDescription, setScenarioDescription] = useState<TrilingualText>(EMPTY_TEXT);
  const [npcRole, setNpcRole] = useState('');
  const [topicTitle, setTopicTitle] = useState<TrilingualText>(EMPTY_TEXT);
  const [topicDescription, setTopicDescription] = useState<TrilingualText>(EMPTY_TEXT);
  const [questionEn, setQuestionEn] = useState('');
  const [questionJa, setQuestionJa] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [allScenarios, allTopics] = await Promise.all([getAllScenarios(), getAllTopics()]);
    setScenarios(allScenarios.filter((item) => isCustomScenario(item.id)));
    setTopics(allTopics.filter((item) => isCustomTopic(item.id)));
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setStatus(`读取自定义内容失败：${error.message}`));
  }, []);

  const notifyChanged = () => window.dispatchEvent(new Event('context-library-updated'));

  const saveScenario = async (event: FormEvent) => {
    event.preventDefault();
    if (!scenarioTitle.zh.trim() || !scenarioDescription.zh.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await addCustomScenario({
        title: withFallback(scenarioTitle),
        description: withFallback(scenarioDescription),
        npcRole: npcRole.trim(),
      });
      setScenarioTitle(EMPTY_TEXT);
      setScenarioDescription(EMPTY_TEXT);
      setNpcRole('');
      await refresh();
      notifyChanged();
      setStatus('已新增角色扮演场景。');
    } catch (error) {
      setStatus(`保存失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveTopic = async (event: FormEvent) => {
    event.preventDefault();
    if (!topicTitle.zh.trim() || !topicDescription.zh.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await addCustomTopic({
        title: withFallback(topicTitle),
        description: withFallback(topicDescription),
        sampleQuestions: questionEn.trim() || questionJa.trim()
          ? [{ en: questionEn.trim() || questionJa.trim(), ja: questionJa.trim() || questionEn.trim() }]
          : [],
      });
      setTopicTitle(EMPTY_TEXT);
      setTopicDescription(EMPTY_TEXT);
      setQuestionEn('');
      setQuestionJa('');
      await refresh();
      notifyChanged();
      setStatus('已新增讨论主题。');
    } catch (error) {
      setStatus(`保存失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeScenario = async (id: string) => {
    if (!window.confirm('确定删除这个自定义场景吗？训练历史不会被删除。')) return;
    setBusy(true);
    try {
      await deleteCustomScenario(id);
      await refresh();
      notifyChanged();
      setStatus('已删除自定义场景。');
    } catch (error) {
      setStatus(`删除失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeTopic = async (id: string) => {
    if (!window.confirm('确定删除这个自定义主题吗？训练历史不会被删除。')) return;
    setBusy(true);
    try {
      await deleteCustomTopic(id);
      await refresh();
      notifyChanged();
      setStatus('已删除自定义主题。');
    } catch (error) {
      setStatus(`删除失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const sectionClass = 'space-y-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4';
  const buttonClass = 'rounded-lg border border-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className={sectionClass}>
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">自定义训练内容</h3>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          新增后会立刻出现在训练页的场景或主题下拉框；内置内容不会被修改。
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('scenarios')}
          className={`rounded-md px-2.5 py-1 text-xs ${tab === 'scenarios' ? 'bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          角色扮演
        </button>
        <button type="button" onClick={() => setTab('topics')}
          className={`rounded-md px-2.5 py-1 text-xs ${tab === 'topics' ? 'bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          主题讨论
        </button>
      </div>

      {tab === 'scenarios' ? (
        <>
          <form className="space-y-3 rounded-md bg-[var(--bg-primary)] p-3" onSubmit={(event) => void saveScenario(event)}>
            <TextFields value={scenarioTitle} onChange={setScenarioTitle} label="场景名称" required />
            <TextFields value={scenarioDescription} onChange={setScenarioDescription} label="训练情境说明" required />
            <label className="block text-xs text-[var(--text-secondary)]">
              对话对象角色（可选）
              <input value={npcRole} onChange={(event) => setNpcRole(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                placeholder="例如：咖啡店店员" />
            </label>
            <button disabled={busy} className={buttonClass} type="submit">新增场景</button>
          </form>
          <div className="space-y-2">
            {scenarios.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">还没有自定义场景。</p> : scenarios.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-light)] p-2">
                <div><p className="text-sm text-[var(--text-primary)]">{item.title.zh}</p><p className="text-xs text-[var(--text-tertiary)]">{item.description.zh}</p></div>
                <button disabled={busy} type="button" onClick={() => void removeScenario(item.id)} className="text-xs text-[var(--rose)] hover:underline">删除</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <form className="space-y-3 rounded-md bg-[var(--bg-primary)] p-3" onSubmit={(event) => void saveTopic(event)}>
            <TextFields value={topicTitle} onChange={setTopicTitle} label="主题名称" required />
            <TextFields value={topicDescription} onChange={setTopicDescription} label="讨论说明" required />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-[var(--text-secondary)]">示例问题（英文，可选）<input value={questionEn} onChange={(event) => setQuestionEn(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" placeholder="What do you think?" /></label>
              <label className="text-xs text-[var(--text-secondary)]">示例问题（日语，可选）<input value={questionJa} onChange={(event) => setQuestionJa(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" placeholder="どう思いますか？" /></label>
            </div>
            <button disabled={busy} className={buttonClass} type="submit">新增主题</button>
          </form>
          <div className="space-y-2">
            {topics.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">还没有自定义主题。</p> : topics.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border-light)] p-2">
                <div><p className="text-sm text-[var(--text-primary)]">{item.title.zh}</p><p className="text-xs text-[var(--text-tertiary)]">{item.description.zh}</p></div>
                <button disabled={busy} type="button" onClick={() => void removeTopic(item.id)} className="text-xs text-[var(--rose)] hover:underline">删除</button>
              </div>
            ))}
          </div>
        </>
      )}

      {status && <p className="text-xs text-[var(--text-secondary)]" role="status">{status}</p>}
    </section>
  );
}
