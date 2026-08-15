import { beforeEach, describe, expect, it, vi } from 'vitest';

const vault = vi.hoisted(() => ({
  initialized: false,
  unlocked: false,
  savedKeys: {
    llmApiKey: '',
    sttApiKey: '',
    ttsApiKey: '',
  },
  saveApiKeys: vi.fn(async () => undefined),
}));

const database = vi.hoisted(() => ({
  removePersistedApiKeys: vi.fn(async () => undefined),
}));

vi.mock('../services/secretVault', () => ({
  isSecretVaultInitialized: () => vault.initialized,
  isSecretVaultUnlocked: () => vault.unlocked,
  saveApiKeys: vault.saveApiKeys,
  unlockSecretVault: async () => vault.savedKeys,
}));

vi.mock('../services/db', () => ({
  removePersistedApiKeys: database.removePersistedApiKeys,
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

describe('settingsStore API Key persistence', () => {
  const storageKey = 'bilingual-speaking-coach:settings';
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.resetModules();
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    vault.initialized = false;
    vault.unlocked = false;
    vault.savedKeys = { llmApiKey: '', sttApiKey: '', ttsApiKey: '' };
    vault.saveApiKeys.mockClear();
    database.removePersistedApiKeys.mockClear();
  });

  it('migrates legacy keys and saves only public settings to localStorage', async () => {
    storage.setItem(
      storageKey,
      JSON.stringify({
        llmApiKey: 'legacy-llm',
        sttApiKey: 'legacy-stt',
        ttsApiKey: '',
        safeWord: '救命',
      }),
    );
    vault.unlocked = true;

    const { useSettingsStore } = await import('./settingsStore');
    useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().hasLegacySecrets).toBe(true);

    await useSettingsStore.getState().saveSettings();

    expect(vault.saveApiKeys).toHaveBeenCalledWith({
      llmApiKey: 'legacy-llm',
      sttApiKey: 'legacy-stt',
      ttsApiKey: '',
    });
    expect(database.removePersistedApiKeys).toHaveBeenCalledOnce();

    const persisted = JSON.parse(storage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('llmApiKey');
    expect(persisted).not.toHaveProperty('sttApiKey');
    expect(persisted).not.toHaveProperty('ttsApiKey');
    expect(persisted.safeWord).toBe('救命');
  });

  it('refuses to save API Keys while the vault is locked', async () => {
    const { useSettingsStore } = await import('./settingsStore');
    useSettingsStore.getState().updateSettings({ llmApiKey: 'secret' });

    await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow(
      '请先解锁本机加密保险库',
    );

    expect(vault.saveApiKeys).not.toHaveBeenCalled();
    expect(storage.getItem(storageKey)).toBeNull();
  });
});
