import { appDataDir, join } from '@tauri-apps/api/path';
import { Client, Stronghold } from '@tauri-apps/plugin-stronghold';
import type { AppSettings } from '../types';

export type ApiKeyField = 'llmApiKey' | 'sttApiKey' | 'ttsApiKey';
export type ApiKeys = Pick<AppSettings, ApiKeyField>;

const VAULT_FILENAME = 'bilingual-speaking-coach.hold';
const CLIENT_NAME = 'bilingual-speaking-coach';
const VAULT_MARKER_KEY = 'bilingual-speaking-coach:stronghold-initialized';
const API_KEY_FIELDS: ApiKeyField[] = ['llmApiKey', 'sttApiKey', 'ttsApiKey'];

let activeVault: Stronghold | null = null;
let activeStore: ReturnType<Client['getStore']> | null = null;

export function isSecretVaultInitialized(): boolean {
  return localStorage.getItem(VAULT_MARKER_KEY) === '1';
}

export function isSecretVaultUnlocked(): boolean {
  return activeVault !== null && activeStore !== null;
}

function requireUnlockedStore(): ReturnType<Client['getStore']> {
  if (!activeStore) {
    throw new Error('请先在“API Key 安全”中解锁本机加密保险库');
  }
  return activeStore;
}

async function createOrLoadClient(stronghold: Stronghold): Promise<Client> {
  try {
    return await stronghold.loadClient(CLIENT_NAME);
  } catch {
    return stronghold.createClient(CLIENT_NAME);
  }
}

export async function unlockSecretVault(password: string): Promise<ApiKeys> {
  if (password.length < 12) {
    throw new Error('保险库口令至少需要 12 个字符');
  }

  const vaultPath = await join(await appDataDir(), VAULT_FILENAME);
  const stronghold = await Stronghold.load(vaultPath, password);
  const store = (await createOrLoadClient(stronghold)).getStore();

  activeVault = stronghold;
  activeStore = store;

  const values = await Promise.all(
    API_KEY_FIELDS.map(async (field) => {
      const record = await store.get(field);
      return [field, record ? new TextDecoder().decode(new Uint8Array(record)) : ''] as const;
    }),
  );

  return Object.fromEntries(values) as ApiKeys;
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  const store = requireUnlockedStore();
  if (!activeVault) {
    throw new Error('加密保险库未初始化');
  }

  for (const field of API_KEY_FIELDS) {
    const value = keys[field].trim();
    if (value) {
      await store.insert(field, Array.from(new TextEncoder().encode(value)));
    } else {
      await store.remove(field);
    }
  }

  await activeVault.save();
  localStorage.setItem(VAULT_MARKER_KEY, '1');
}
