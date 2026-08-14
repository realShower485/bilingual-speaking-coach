// =====================================================================
// useSettings — 设置管理 React Hook
// ---------------------------------------------------------------------
// 包装 settingsStore(zustand),暴露给组件使用。
// 额外提供 testLLMConnection,用于在设置面板中验证 LLM API Key 是否有效。
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { inferBaseUrl } from '../services/llm';
import { httpFetch } from '../services/httpClient';
import type { AppSettings } from '../types';

export interface UseSettingsResult {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  updateSettings: (patch: Partial<AppSettings>) => void;
  saveSettings: () => void;
  /**
   * 测试当前 LLM API Key / 模型 / Base URL 是否可用。
   * 内部发送一条极简对话请求,根据响应状态判定。
   * @returns 成功时返回 true,失败时返回 false 并设置 error。
   */
  testLLMConnection: () => Promise<boolean>;
  /** 当前是否正在测试连接。 */
  isTestingConnection: boolean;
  /** 最近一次测试连接的结果消息(成功 / 失败原因)。 */
  testConnectionMessage: string | null;
}

export function useSettings(): UseSettingsResult {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const saveSettingsStore = useSettingsStore((s) => s.saveSettings);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testConnectionMessage, setTestConnectionMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    try {
      loadSettings();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [loadSettings]);

  const saveSettings = useCallback(() => {
    try {
      saveSettingsStore();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [saveSettingsStore]);

  const testLLMConnection = useCallback(async (): Promise<boolean> => {
    if (!settings.llmApiKey) {
      setTestConnectionMessage('请先填写 LLM API Key');
      return false;
    }
    if (!settings.llmModel) {
      setTestConnectionMessage('请先填写模型名称');
      return false;
    }

    setIsTestingConnection(true);
    setTestConnectionMessage(null);

    const baseUrl =
      settings.llmBaseUrl?.trim() || inferBaseUrl(settings.llmModel);

    try {
      const res = await httpFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.llmApiKey}`,
        },
        body: JSON.stringify({
          model: settings.llmModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      });

      if (res.ok) {
        setTestConnectionMessage('✓ 连接成功,API Key 有效');
        return true;
      }

      const detail = await res.text().catch(() => '');
      const msg = `连接失败 (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`;
      setTestConnectionMessage(msg);
      return false;
    } catch (e) {
      const msg = `网络请求失败:${(e as Error).message}`;
      setTestConnectionMessage(msg);
      return false;
    } finally {
      setIsTestingConnection(false);
    }
  }, [settings.llmApiKey, settings.llmBaseUrl, settings.llmModel]);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    saveSettings,
    testLLMConnection,
    isTestingConnection,
    testConnectionMessage,
  };
}
