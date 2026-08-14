import { create } from 'zustand';
import type { AppSettings } from '../types';

const SETTINGS_STORAGE_KEY = 'bilingual-speaking-coach:settings';

const defaultSettings: AppSettings = {
  llmApiKey: '',
  // SiliconFlow 可用同一个 Key 覆盖 LLM / STT / TTS，开箱即用。
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  sttApiKey: '',
  sttProvider: 'siliconflow',
  sttLanguage: 'auto',
  sttBaseUrl: '',
  sttModel: '',
  ttsApiKey: '',
  ttsProvider: 'siliconflow',
  ttsBaseUrl: '',
  ttsModel: '',
  ttsVoice: '',
  ttsRate: 1.0,
  dbPath: '',
  safeWord: '救命',
  targetLanguageOrder: 'en-ja',
};

interface SettingsState {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

function readFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },

  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
  },

  loadSettings: () => {
    set({ settings: readFromStorage() });
  },

  saveSettings: () => {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(get().settings),
      );
    } catch {
      // 持久化失败时静默忽略,后续可接入 Tauri 文件系统持久化
    }
  },
}));
