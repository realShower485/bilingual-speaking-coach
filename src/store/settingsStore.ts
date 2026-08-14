import { create } from 'zustand';
import type { AppSettings } from '../types';
import {
  isSecretVaultInitialized,
  isSecretVaultUnlocked,
  saveApiKeys,
  unlockSecretVault,
  type ApiKeyField,
} from '../services/secretVault';

const SETTINGS_STORAGE_KEY = 'bilingual-speaking-coach:settings';
const API_KEY_FIELDS: ApiKeyField[] = ['llmApiKey', 'sttApiKey', 'ttsApiKey'];

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

type PersistedSettings = Omit<AppSettings, ApiKeyField>;

interface StoredSettings {
  settings: AppSettings;
  hasLegacySecrets: boolean;
}

interface SettingsState {
  settings: AppSettings;
  hasLegacySecrets: boolean;
  isSecretVaultInitialized: boolean;
  isSecretsUnlocked: boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
  loadSettings: () => void;
  unlockSecrets: (password: string) => Promise<void>;
  saveSettings: () => Promise<void>;
}

function splitSettings(settings: AppSettings): {
  publicSettings: PersistedSettings;
  apiKeys: Pick<AppSettings, ApiKeyField>;
} {
  const { llmApiKey, sttApiKey, ttsApiKey, ...publicSettings } = settings;
  return {
    publicSettings,
    apiKeys: { llmApiKey, sttApiKey, ttsApiKey },
  };
}

function readFromStorage(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { settings: { ...defaultSettings }, hasLegacySecrets: false };
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const settings = { ...defaultSettings, ...parsed };
    const hasLegacySecrets = API_KEY_FIELDS.some((field) => Boolean(parsed[field]));

    return { settings, hasLegacySecrets };
  } catch {
    return { settings: { ...defaultSettings }, hasLegacySecrets: false };
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  hasLegacySecrets: false,
  isSecretVaultInitialized: isSecretVaultInitialized(),
  isSecretsUnlocked: isSecretVaultUnlocked(),

  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
  },

  loadSettings: () => {
    const stored = readFromStorage();
    set({
      settings: stored.settings,
      hasLegacySecrets: stored.hasLegacySecrets,
      isSecretVaultInitialized: isSecretVaultInitialized(),
      isSecretsUnlocked: isSecretVaultUnlocked(),
    });
  },

  unlockSecrets: async (password) => {
    const savedKeys = await unlockSecretVault(password);
    const current = get().settings;
    const mergedKeys = API_KEY_FIELDS.reduce(
      (keys, field) => ({
        ...keys,
        [field]: current[field] || savedKeys[field],
      }),
      {} as Pick<AppSettings, ApiKeyField>,
    );

    set({
      settings: { ...current, ...mergedKeys },
      isSecretsUnlocked: true,
      isSecretVaultInitialized: isSecretVaultInitialized(),
    });
  },

  saveSettings: async () => {
    const { publicSettings, apiKeys } = splitSettings(get().settings);
    const hasApiKeys = API_KEY_FIELDS.some((field) => Boolean(apiKeys[field]));

    if (hasApiKeys) {
      if (!isSecretVaultUnlocked()) {
        throw new Error('请先解锁本机加密保险库，再保存 API Key');
      }
      await saveApiKeys(apiKeys);
    }

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(publicSettings));
    set({
      hasLegacySecrets: false,
      isSecretVaultInitialized: isSecretVaultInitialized(),
      isSecretsUnlocked: isSecretVaultUnlocked(),
    });
  },
}));
