import { useCallback, useEffect, useState } from 'react';
import type { ErrorWord } from '../types';
import * as db from '../services/db';
import { createLLMProvider } from '../services/llm';
import { useSettingsStore } from '../store/settingsStore';

/**
 * 易错词本 hook:加载所有 error_words,支持按语言切换、关键词搜索,
 * 以及调用 LLM 重新生成单条解释。
 */
export function useVocabulary() {
  const [errorWords, setErrorWords] = useState<ErrorWord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<'en' | 'ja'>('en');
  const [searchQuery, setSearchQuery] = useState('');
  /** 当前正在请求 AI 解释的单词(用 `${language}:${word}` 标识)。 */
  const [explainingKey, setExplainingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const words = await db.getErrorWords();
      setErrorWords(words);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestExplanation = useCallback(
    async (word: ErrorWord) => {
      const key = `${word.language}:${word.word}`;
      setExplainingKey(key);
      setError(null);
      try {
        const settings = useSettingsStore.getState().settings;
        const provider = createLLMProvider(settings);
        const langLabel = word.language === 'en' ? '英语' : '日语';
        const systemPrompt =
          `你是一位资深的${langLabel}语言教学专家,擅长用中文向学习者解释词义、` +
          `用法、常见搭配与易错点。回答应简洁、聚焦学习者需求,避免冗长。`;
        const userPrompt =
          `请用中文解释${langLabel}单词/短语「${word.word}」:\n` +
          `1. 词性与基本含义(若是短语请整体解释)\n` +
          `2. 常见用法与一个简短例句(附中文翻译)\n` +
          `3. 学习者常犯的易错点或近义词辨析\n` +
          `请保持回答不超过 150 字。`;
        const explanation = await provider.chatCompletion({
          systemPrompt,
          userPrompt,
          temperature: 0.5,
        });
        await db.updateErrorWordExplanation(
          word.word,
          word.language,
          explanation.trim(),
        );
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setExplainingKey(null);
      }
    },
    [refresh],
  );

  return {
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
  };
}
