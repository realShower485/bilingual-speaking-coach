import { memo, useMemo, useState } from 'react';
import { phrasebook } from '../services/libraries';
import { useUiStore } from '../store/uiStore';
import { speakText, stopSpeaking } from '../services/tts';

interface Props {
  /** 点击某条句子的某一语言版本时回调,将文本插入当前输入框。 */
  onPickText: (text: string) => void;
}

/**
 * 常用句手册:从右侧滑出的浮动面板。
 * 按 PhrasebookCategory 分组显示英日双语对照常用句,支持关键词搜索。
 * 点击任一语言行即将该文本插入输入框;🔊 按钮调用 TTS 朗读对应语言。
 *
 * 使用 React.memo:手册内容来自静态 libraries,父组件频繁 state 变化时
 * (如输入框文字)无需重渲染本面板。
 */
export const PhrasebookPanel = memo(function PhrasebookPanel({ onPickText }: Props) {
  const isPhrasebookOpen = useUiStore((s) => s.isPhrasebookOpen);
  const setPhrasebookOpen = useUiStore((s) => s.setPhrasebookOpen);
  const [query, setQuery] = useState('');
  /** 当前正在朗读的条目标识(`${catIdx}-${phraseIdx}-${lang}`)。 */
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return phrasebook;
    const raw = query.trim();
    return phrasebook
      .map((cat) => ({
        ...cat,
        phrases: cat.phrases.filter(
          (p) =>
            p.en.toLowerCase().includes(q) ||
            p.ja.toLowerCase().includes(q) ||
            p.ja.includes(raw) ||
            cat.title.zh.includes(raw) ||
            cat.title.en.toLowerCase().includes(q) ||
            cat.title.ja.includes(raw),
        ),
      }))
      .filter((cat) => cat.phrases.length > 0);
  }, [query]);

  if (!isPhrasebookOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => setPhrasebookOpen(false)}
      />

      {/* 面板主体 */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--border-light)] bg-[var(--bg-secondary)] shadow-2xl">
        {/* 头部:标题 + 搜索 + 关闭 */}
        <div className="space-y-2 border-b border-[var(--border-light)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              📖 常用句手册
            </h3>
            <button
              onClick={() => setPhrasebookOpen(false)}
              className="rounded-lg border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              title="关闭 (Esc)"
            >
              ✕ 关闭
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索关键词(中/英/日)…"
            className="w-full rounded-lg border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            autoFocus
          />
          <p className="text-xs text-[var(--text-tertiary)]">
            点击英/日任一行即可插入输入框;🔊 按钮朗读对应语言。
          </p>
        </div>

        {/* 列表区 */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
              未找到匹配的常用句。
            </p>
          )}

          {filtered.map((cat) => (
            <section key={cat.id}>
              <h4 className="mb-2 text-sm font-semibold text-[var(--amber)]">
                {cat.title.zh}
                <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                  {cat.title.en} · {cat.title.ja}
                </span>
              </h4>
              <ul className="space-y-1.5">
                {cat.phrases.map((p, i) => {
                  const enKey = `${cat.id}-${i}-en`;
                  const jaKey = `${cat.id}-${i}-ja`;
                  const handleSpeak = async (
                    text: string,
                    lang: 'en' | 'ja',
                    key: string,
                  ) => {
                    if (speakingKey === key) {
                      stopSpeaking();
                      setSpeakingKey(null);
                      return;
                    }
                    setSpeakingKey(key);
                    try {
                      await speakText(text, lang);
                    } catch {
                      /* 错误已在 store 中 */
                    } finally {
                      setSpeakingKey((cur) => (cur === key ? null : cur));
                    }
                  };
                  return (
                    <li
                      key={i}
                      className="group overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)]"
                    >
                      <button
                        onClick={() => {
                          onPickText(p.en);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--accent-bg)]"
                        title="点击插入英语"
                      >
                        <span className="select-none text-xs font-medium text-[var(--accent)]">
                          EN
                        </span>
                        <span className="flex-1">{p.en}</span>
                      </button>
                      <button
                        onClick={() => {
                          onPickText(p.ja);
                        }}
                        className="flex w-full items-center gap-2 border-t border-[var(--border-light)] px-3 py-1.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--rose-light)]"
                        title="点击插入日语"
                      >
                        <span className="select-none text-xs font-medium text-[var(--rose)]">
                          JA
                        </span>
                        <span className="flex-1">{p.ja}</span>
                      </button>
                      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-light)] px-3 py-1">
                        <button
                          onClick={() => handleSpeak(p.en, 'en', enKey)}
                          className="text-xs text-[var(--accent)] transition hover:text-[var(--accent)]"
                          title="朗读英语"
                        >
                          {speakingKey === enKey ? '⏸ EN' : '🔊 EN'}
                        </button>
                        <button
                          onClick={() => handleSpeak(p.ja, 'ja', jaKey)}
                          className="text-xs text-[var(--rose)] transition hover:text-[var(--rose)]"
                          title="朗读日语"
                        >
                          {speakingKey === jaKey ? '⏸ JA' : '🔊 JA'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
});
