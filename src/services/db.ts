import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';
import type {
  AppSettings,
  ContextType,
  DifficultyHistory,
  EnglishDifficulty,
  ErrorWord,
  Feedback,
  JapaneseDifficulty,
  PhrasebookEntry,
  ScenarioItem,
  Session,
  TopicItem,
  TrilingualText,
  Turn,
  TurnPhase,
} from '../types';
import { isEnglishLevel, isJapaneseLevel } from './difficultyHelper';

// ===== 数据库连接单例 =====
let db: Database | null = null;
let currentDbPath: string | null = null;

const DB_FILENAME = 'bilingual-speaking-coach.db';

// ===== 数据库行类型(列名与 schema 对应) =====
interface SessionRow {
  id: string;
  context_type: string;
  // 旧字段(兼容旧数据读取;新数据写入时仍填入,便于回退查看)
  difficulty: string | null;
  auto_difficulty: number | null;
  // 新字段(英日各自独立难度)
  english_difficulty: string | null;
  japanese_difficulty: string | null;
  auto_english_difficulty: number | null;
  auto_japanese_difficulty: number | null;
  scenario: string | null;
  started_at: number;
  ended_at: number | null;
}

interface TurnRow {
  id: string;
  session_id: string;
  phase: string;
  context_given: string | null;
  english_input: string | null;
  japanese_input: string | null;
  feedback_json: string | null;
  created_at: number;
}

interface ErrorWordRow {
  id: string;
  word: string;
  language: string;
  explanation: string | null;
  count: number;
  first_seen_at: number;
  last_explanation: string | null;
}

interface DifficultyHistoryRow {
  id: string;
  session_id: string;
  old_difficulty: string | null;
  new_difficulty: string;
  reason: string | null;
  adjusted_at: number;
}

interface SettingsRow {
  id: number;
  settings_json: string;
}

interface MetaRow {
  key: string;
  value: string;
}

interface CustomScenarioRow {
  id: string;
  title: string; // JSON of TrilingualText
  description: string; // JSON of TrilingualText
  npc_role: string | null;
  created_at: number;
}

interface CustomTopicRow {
  id: string;
  title: string; // JSON of TrilingualText
  description: string; // JSON of TrilingualText
  sample_questions: string | null; // JSON of PhrasebookEntry[]
  created_at: number;
}

type PublicSettings = Omit<AppSettings, 'llmApiKey' | 'sttApiKey' | 'ttsApiKey'>;

// ===== 初始化 / 连接管理 =====

/**
 * 初始化数据库。可指定路径(文件路径,不含 `sqlite:` 前缀);
 * 默认使用 Tauri 的 appDataDir 下的 `bilingual-speaking-coach.db`。
 */
export async function initDatabase(dbPath?: string): Promise<void> {
  if (db) return;
  const path = dbPath ?? (await join(await appDataDir(), DB_FILENAME));
  currentDbPath = path;
  db = await Database.load(`sqlite:${path}`);
  await createSchema();
  await markModified();
}

/** 获取数据库连接(若未初始化则用默认路径初始化)。 */
export async function getDb(): Promise<Database> {
  if (!db) {
    await initDatabase();
  }
  return db as Database;
}

/** 关闭数据库连接。 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    currentDbPath = null;
  }
}

/** 返回当前已打开的数据库文件路径(未初始化时为 null)。 */
export function getCurrentDbPath(): string | null {
  return currentDbPath;
}

// ===== Schema =====

/**
 * 幂等添加列:若该列不存在则 ALTER TABLE ADD COLUMN,已存在则忽略。
 * SQLite 不支持 IF NOT EXISTS 于 ADD COLUMN,故先尝试执行并捕获重复列错误。
 */
async function addColumnIfMissing(
  database: Database,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  try {
    await database.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (e) {
    // 列已存在(duplicate column name)时忽略;其他错误重新抛出
    const msg = (e as Error).message ?? '';
    if (!/duplicate column/i.test(msg)) throw e;
  }
}

async function createSchema(): Promise<void> {
  const database = await getDb();
  await database.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      context_type TEXT NOT NULL,
      difficulty TEXT,
      auto_difficulty INTEGER,
      english_difficulty TEXT,
      japanese_difficulty TEXT,
      auto_english_difficulty INTEGER,
      auto_japanese_difficulty INTEGER,
      scenario TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    )
  `);
  // 迁移:为旧版 sessions 表补充英日独立难度列(ALTER TABLE 幂等,列已存在则忽略错误)
  await addColumnIfMissing(database, 'sessions', 'english_difficulty', 'TEXT');
  await addColumnIfMissing(database, 'sessions', 'japanese_difficulty', 'TEXT');
  await addColumnIfMissing(
    database,
    'sessions',
    'auto_english_difficulty',
    'INTEGER',
  );
  await addColumnIfMissing(
    database,
    'sessions',
    'auto_japanese_difficulty',
    'INTEGER',
  );
  await database.execute(`
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      context_given TEXT,
      english_input TEXT,
      japanese_input TEXT,
      feedback_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS error_words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      language TEXT NOT NULL,
      explanation TEXT,
      count INTEGER DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_explanation TEXT,
      UNIQUE(word, language)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS difficulty_history (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      old_difficulty TEXT,
      new_difficulty TEXT NOT NULL,
      reason TEXT,
      adjusted_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS db_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS custom_scenarios (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      npc_role TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS custom_topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sample_questions TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}

// ===== 行 -> 类型 映射 =====

/**
 * 将数据库行映射为 Session。
 * 兼容旧数据:若 english_difficulty/japanese_difficulty 为空但旧 difficulty 字段存在,
 * 则依据旧 difficulty 的语言类型映射(英语等级 → englishDifficulty,日语等级 → japaneseDifficulty,
 * 另一侧用默认值)。
 */
function mapSessionRow(row: SessionRow): Session {
  let englishDifficulty: EnglishDifficulty;
  let japaneseDifficulty: JapaneseDifficulty;
  let autoEnglishDifficulty: boolean;
  let autoJapaneseDifficulty: boolean;

  if (row.english_difficulty && row.japanese_difficulty) {
    // 新版数据:直接读取
    englishDifficulty = row.english_difficulty as EnglishDifficulty;
    japaneseDifficulty = row.japanese_difficulty as JapaneseDifficulty;
    autoEnglishDifficulty = (row.auto_english_difficulty ?? 0) === 1;
    autoJapaneseDifficulty = (row.auto_japanese_difficulty ?? 0) === 1;
  } else if (row.difficulty) {
    // 旧版数据:只有单个 difficulty 字段,按语言类型分别映射
    const oldDiff = row.difficulty;
    const oldAuto = (row.auto_difficulty ?? 0) === 1;
    if (oldDiff === 'auto') {
      // 旧 auto:英日都设为 auto
      englishDifficulty = 'auto';
      japaneseDifficulty = 'auto';
      autoEnglishDifficulty = oldAuto;
      autoJapaneseDifficulty = oldAuto;
    } else if (isEnglishLevel(oldDiff)) {
      englishDifficulty = oldDiff;
      autoEnglishDifficulty = oldAuto;
      // 旧数据未指定日语难度,默认 N3
      japaneseDifficulty = 'N3';
      autoJapaneseDifficulty = false;
    } else if (isJapaneseLevel(oldDiff)) {
      japaneseDifficulty = oldDiff;
      autoJapaneseDifficulty = oldAuto;
      // 旧数据未指定英语难度,默认 B1
      englishDifficulty = 'B1';
      autoEnglishDifficulty = false;
    } else {
      // 未知值兜底
      englishDifficulty = 'B1';
      japaneseDifficulty = 'N3';
      autoEnglishDifficulty = oldAuto;
      autoJapaneseDifficulty = oldAuto;
    }
  } else {
    // 完全无难度信息(极端兜底)
    englishDifficulty = 'B1';
    japaneseDifficulty = 'N3';
    autoEnglishDifficulty = false;
    autoJapaneseDifficulty = false;
  }

  return {
    id: row.id,
    contextType: row.context_type as ContextType,
    englishDifficulty,
    japaneseDifficulty,
    autoEnglishDifficulty,
    autoJapaneseDifficulty,
    scenario: row.scenario ?? undefined,
    turns: [],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
  };
}

function mapTurnRow(row: TurnRow): Turn {
  return {
    id: row.id,
    sessionId: row.session_id,
    phase: row.phase as TurnPhase,
    contextGiven: row.context_given ?? '',
    englishInput: row.english_input ?? '',
    japaneseInput: row.japanese_input ?? '',
    feedback: row.feedback_json ? (JSON.parse(row.feedback_json) as Feedback) : null,
    createdAt: row.created_at,
  };
}

function mapErrorWordRow(row: ErrorWordRow): ErrorWord {
  return {
    word: row.word,
    language: row.language as 'en' | 'ja',
    explanation: row.explanation ?? '',
    count: row.count,
    firstSeenAt: row.first_seen_at,
    lastExplanation: row.last_explanation ?? '',
  };
}

function mapDifficultyHistoryRow(row: DifficultyHistoryRow): DifficultyHistory {
  return {
    id: row.id,
    sessionId: row.session_id,
    oldDifficulty: row.old_difficulty,
    newDifficulty: row.new_difficulty,
    reason: row.reason ?? '',
    adjustedAt: row.adjusted_at,
  };
}

function mapCustomScenarioRow(row: CustomScenarioRow): ScenarioItem {
  return {
    id: row.id,
    title: JSON.parse(row.title) as TrilingualText,
    description: JSON.parse(row.description) as TrilingualText,
    npcRole: row.npc_role ?? '',
  };
}

function mapCustomTopicRow(row: CustomTopicRow): TopicItem {
  return {
    id: row.id,
    title: JSON.parse(row.title) as TrilingualText,
    description: JSON.parse(row.description) as TrilingualText,
    sampleQuestions: row.sample_questions
      ? (JSON.parse(row.sample_questions) as PhrasebookEntry[])
      : [],
  };
}

// ===== 内部工具 =====

function generateId(): string {
  return crypto.randomUUID();
}

/** API Key 只允许存在于 Stronghold；SQLite 设置记录始终只保存非敏感字段。 */
function toPublicSettings(settings: AppSettings): PublicSettings {
  const { llmApiKey: _llmApiKey, sttApiKey: _sttApiKey, ttsApiKey: _ttsApiKey, ...publicSettings } =
    settings;
  return publicSettings;
}

/** 清理旧版 settings_json 中的明文 API Key；无敏感字段时返回 null。 */
function sanitizeSettingsJson(settingsJson: string): string | null {
  try {
    const parsed = JSON.parse(settingsJson) as Record<string, unknown>;
    const hadSecret =
      'llmApiKey' in parsed || 'sttApiKey' in parsed || 'ttsApiKey' in parsed;
    if (!hadSecret) return null;
    delete parsed.llmApiKey;
    delete parsed.sttApiKey;
    delete parsed.ttsApiKey;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

/** 更新数据库最后修改时间(用于跨电脑同步检测)。 */
async function markModified(): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO db_meta (key, value) VALUES ('last_modified', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(Date.now())],
  );
}

// ===== Sessions CRUD =====

export async function createSession(session: Session): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO sessions
       (id, context_type, difficulty, auto_difficulty,
        english_difficulty, japanese_difficulty, auto_english_difficulty, auto_japanese_difficulty,
        scenario, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      session.id,
      session.contextType,
      session.englishDifficulty,
      session.autoEnglishDifficulty ? 1 : 0,
      session.englishDifficulty,
      session.japaneseDifficulty,
      session.autoEnglishDifficulty ? 1 : 0,
      session.autoJapaneseDifficulty ? 1 : 0,
      session.scenario ?? null,
      session.startedAt,
      session.endedAt ?? null,
    ],
  );
  await markModified();
}

export async function updateSession(session: Session): Promise<void> {
  const database = await getDb();
  await database.execute(
    `UPDATE sessions
     SET context_type = $1, difficulty = $2, auto_difficulty = $3,
         english_difficulty = $4, japanese_difficulty = $5,
         auto_english_difficulty = $6, auto_japanese_difficulty = $7,
         scenario = $8, started_at = $9, ended_at = $10
     WHERE id = $11`,
    [
      session.contextType,
      session.englishDifficulty,
      session.autoEnglishDifficulty ? 1 : 0,
      session.englishDifficulty,
      session.japaneseDifficulty,
      session.autoEnglishDifficulty ? 1 : 0,
      session.autoJapaneseDifficulty ? 1 : 0,
      session.scenario ?? null,
      session.startedAt,
      session.endedAt ?? null,
      session.id,
    ],
  );
  await markModified();
}

export async function getSession(id: string): Promise<Session | null> {
  const database = await getDb();
  const rows = await database.select<SessionRow[]>(
    'SELECT * FROM sessions WHERE id = $1',
    [id],
  );
  if (rows.length === 0) return null;
  return mapSessionRow(rows[0]);
}

export async function getAllSessions(): Promise<Session[]> {
  const database = await getDb();
  const rows = await database.select<SessionRow[]>(
    'SELECT * FROM sessions ORDER BY started_at DESC',
  );
  return rows.map(mapSessionRow);
}

export async function getSessionsByType(contextType: ContextType): Promise<Session[]> {
  const database = await getDb();
  const rows = await database.select<SessionRow[]>(
    'SELECT * FROM sessions WHERE context_type = $1 ORDER BY started_at DESC',
    [contextType],
  );
  return rows.map(mapSessionRow);
}

// ===== Turns CRUD =====

export async function createTurn(turn: Turn): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO turns (id, session_id, phase, context_given, english_input, japanese_input, feedback_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      turn.id,
      turn.sessionId,
      turn.phase,
      turn.contextGiven,
      turn.englishInput,
      turn.japaneseInput,
      turn.feedback ? JSON.stringify(turn.feedback) : null,
      turn.createdAt,
    ],
  );
  await markModified();
}

export async function updateTurn(turn: Turn): Promise<void> {
  const database = await getDb();
  await database.execute(
    `UPDATE turns
     SET phase = $1, context_given = $2, english_input = $3, japanese_input = $4, feedback_json = $5
     WHERE id = $6`,
    [
      turn.phase,
      turn.contextGiven,
      turn.englishInput,
      turn.japaneseInput,
      turn.feedback ? JSON.stringify(turn.feedback) : null,
      turn.id,
    ],
  );
  await markModified();
}

export async function getTurnsBySession(sessionId: string): Promise<Turn[]> {
  const database = await getDb();
  const rows = await database.select<TurnRow[]>(
    'SELECT * FROM turns WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId],
  );
  return rows.map(mapTurnRow);
}

// ===== ErrorWords =====

/**
 * 新增易错词。若 (word, language) 已存在,则计数 +1 并更新最近一次解释。
 */
export async function addErrorWord(
  word: string,
  language: 'en' | 'ja',
  explanation: string,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO error_words (id, word, language, explanation, count, first_seen_at, last_explanation)
     VALUES ($1, $2, $3, $4, 1, $5, $4)
     ON CONFLICT(word, language) DO UPDATE SET count = count + 1, last_explanation = $4`,
    [generateId(), word, language, explanation, Date.now()],
  );
  await markModified();
}

export async function getErrorWords(language?: 'en' | 'ja'): Promise<ErrorWord[]> {
  const database = await getDb();
  const rows = language
    ? await database.select<ErrorWordRow[]>(
        'SELECT * FROM error_words WHERE language = $1 ORDER BY first_seen_at DESC',
        [language],
      )
    : await database.select<ErrorWordRow[]>(
        'SELECT * FROM error_words ORDER BY first_seen_at DESC',
      );
  return rows.map(mapErrorWordRow);
}

export async function updateErrorWordExplanation(
  word: string,
  language: 'en' | 'ja',
  explanation: string,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    'UPDATE error_words SET last_explanation = $1 WHERE word = $2 AND language = $3',
    [explanation, word, language],
  );
  await markModified();
}

// ===== Difficulty History =====

export async function addDifficultyHistory(
  sessionId: string,
  oldDiff: string,
  newDiff: string,
  reason: string,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO difficulty_history (id, session_id, old_difficulty, new_difficulty, reason, adjusted_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [generateId(), sessionId, oldDiff, newDiff, reason, Date.now()],
  );
  await markModified();
}

export async function getDifficultyHistory(sessionId: string): Promise<DifficultyHistory[]> {
  const database = await getDb();
  const rows = await database.select<DifficultyHistoryRow[]>(
    'SELECT * FROM difficulty_history WHERE session_id = $1 ORDER BY adjusted_at ASC',
    [sessionId],
  );
  return rows.map(mapDifficultyHistoryRow);
}

// ===== Custom Scenarios / Topics =====

export async function createCustomScenario(scenario: ScenarioItem): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO custom_scenarios (id, title, description, npc_role, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      scenario.id,
      JSON.stringify(scenario.title),
      JSON.stringify(scenario.description),
      scenario.npcRole || null,
      Date.now(),
    ],
  );
  await markModified();
}

export async function getCustomScenarios(): Promise<ScenarioItem[]> {
  const database = await getDb();
  const rows = await database.select<CustomScenarioRow[]>(
    'SELECT * FROM custom_scenarios ORDER BY created_at ASC',
  );
  return rows.map(mapCustomScenarioRow);
}

export async function deleteCustomScenario(id: string): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM custom_scenarios WHERE id = $1', [id]);
  await markModified();
}

export async function createCustomTopic(topic: TopicItem): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO custom_topics (id, title, description, sample_questions, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      topic.id,
      JSON.stringify(topic.title),
      JSON.stringify(topic.description),
      topic.sampleQuestions.length > 0
        ? JSON.stringify(topic.sampleQuestions)
        : null,
      Date.now(),
    ],
  );
  await markModified();
}

export async function getCustomTopics(): Promise<TopicItem[]> {
  const database = await getDb();
  const rows = await database.select<CustomTopicRow[]>(
    'SELECT * FROM custom_topics ORDER BY created_at ASC',
  );
  return rows.map(mapCustomTopicRow);
}

export async function deleteCustomTopic(id: string): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM custom_topics WHERE id = $1', [id]);
  await markModified();
}

// ===== Settings =====

/** 保存普通设置；API Key 始终由 Stronghold 管理，绝不写入 SQLite。 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO settings (id, settings_json) VALUES (1, $1)
     ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json`,
    [JSON.stringify(toPublicSettings(settings))],
  );
  await markModified();
}

/** 读取普通设置，并主动忽略旧数据库记录中的 API Key。 */
export async function loadSettings(): Promise<AppSettings | null> {
  const database = await getDb();
  const rows = await database.select<SettingsRow[]>(
    'SELECT * FROM settings WHERE id = 1',
  );
  if (rows.length === 0) return null;
  const parsed = JSON.parse(rows[0].settings_json) as Omit<AppSettings, 'llmApiKey' | 'sttApiKey' | 'ttsApiKey'>;
  return { ...parsed, llmApiKey: '', sttApiKey: '', ttsApiKey: '' };
}

/** 在用户成功保存 Stronghold 后，移除旧数据库设置记录中的明文 API Key。 */
export async function removePersistedApiKeys(): Promise<void> {
  const database = await getDb();
  const rows = await database.select<SettingsRow[]>(
    'SELECT * FROM settings WHERE id = 1',
  );
  if (rows.length === 0) return;

  const sanitized = sanitizeSettingsJson(rows[0].settings_json);
  if (!sanitized) return;

  await database.execute('UPDATE settings SET settings_json = $1 WHERE id = 1', [
    sanitized,
  ]);
  await markModified();
}

// ===== 数据库维护 =====

/**
 * 返回数据库最后修改时间戳(毫秒),用于跨电脑同步检测。
 * 该值在每次写操作时更新并持久化于 db_meta 表。
 */
export async function getDbModifiedTime(): Promise<number | null> {
  const database = await getDb();
  const rows = await database.select<MetaRow[]>(
    "SELECT value FROM db_meta WHERE key = 'last_modified'",
  );
  if (rows.length === 0) return null;
  return Number(rows[0].value);
}

/**
 * 将数据库迁移到新路径:导出当前全部数据,关闭旧连接,在新路径重建 schema 并写回数据。
 * 注意:旧路径下的数据库文件不会被删除(需文件系统权限),如需清理请手动删除。
 */
export async function migrateDbPath(newPath: string): Promise<void> {
  const oldDb = await getDb();

  // 导出所有表数据
  const sessions = await oldDb.select<SessionRow[]>('SELECT * FROM sessions');
  const turns = await oldDb.select<TurnRow[]>('SELECT * FROM turns');
  const errorWords = await oldDb.select<ErrorWordRow[]>('SELECT * FROM error_words');
  const diffHistory = await oldDb.select<DifficultyHistoryRow[]>(
    'SELECT * FROM difficulty_history',
  );
  const settingsRows = await oldDb.select<SettingsRow[]>('SELECT * FROM settings');
  const metaRows = await oldDb.select<MetaRow[]>('SELECT * FROM db_meta');
  const customScenarios = await oldDb.select<CustomScenarioRow[]>(
    'SELECT * FROM custom_scenarios',
  );
  const customTopics = await oldDb.select<CustomTopicRow[]>(
    'SELECT * FROM custom_topics',
  );

  // 关闭旧连接
  await closeDatabase();

  // 在新路径初始化(创建 schema)
  await initDatabase(newPath);
  const newDb = await getDb();

  // 重新插入数据(保留原 id)
  for (const r of sessions) {
    await newDb.execute(
      `INSERT INTO sessions
         (id, context_type, difficulty, auto_difficulty,
          english_difficulty, japanese_difficulty, auto_english_difficulty, auto_japanese_difficulty,
          scenario, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        r.id,
        r.context_type,
        r.difficulty,
        r.auto_difficulty,
        r.english_difficulty,
        r.japanese_difficulty,
        r.auto_english_difficulty,
        r.auto_japanese_difficulty,
        r.scenario,
        r.started_at,
        r.ended_at,
      ],
    );
  }
  for (const r of turns) {
    await newDb.execute(
      `INSERT INTO turns (id, session_id, phase, context_given, english_input, japanese_input, feedback_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.id, r.session_id, r.phase, r.context_given, r.english_input, r.japanese_input, r.feedback_json, r.created_at],
    );
  }
  for (const r of errorWords) {
    await newDb.execute(
      `INSERT INTO error_words (id, word, language, explanation, count, first_seen_at, last_explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [r.id, r.word, r.language, r.explanation, r.count, r.first_seen_at, r.last_explanation],
    );
  }
  for (const r of diffHistory) {
    await newDb.execute(
      `INSERT INTO difficulty_history (id, session_id, old_difficulty, new_difficulty, reason, adjusted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.id, r.session_id, r.old_difficulty, r.new_difficulty, r.reason, r.adjusted_at],
    );
  }
  for (const r of settingsRows) {
    await newDb.execute(
      'INSERT INTO settings (id, settings_json) VALUES ($1, $2)',
      [r.id, sanitizeSettingsJson(r.settings_json) ?? r.settings_json],
    );
  }
  for (const r of metaRows) {
    await newDb.execute(
      `INSERT INTO db_meta (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [r.key, r.value],
    );
  }
  for (const r of customScenarios) {
    await newDb.execute(
      `INSERT INTO custom_scenarios (id, title, description, npc_role, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.id, r.title, r.description, r.npc_role, r.created_at],
    );
  }
  for (const r of customTopics) {
    await newDb.execute(
      `INSERT INTO custom_topics (id, title, description, sample_questions, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.id, r.title, r.description, r.sample_questions, r.created_at],
    );
  }

  // 迁移完成,刷新修改时间
  await markModified();
}
