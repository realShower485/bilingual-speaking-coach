import { open } from '@tauri-apps/plugin-dialog';

const DATABASE_FILTER = {
  name: 'SQLite 数据库',
  extensions: ['db', 'sqlite', 'sqlite3'],
};

/** 选择现有数据库文件，并返回操作系统提供的真实绝对路径。 */
export async function selectDatabaseFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [DATABASE_FILTER],
  });

  return typeof selected === 'string' ? selected : null;
}

/** 选择目录，并返回操作系统提供的真实绝对路径。 */
export async function selectDirectory(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
  });

  return typeof selected === 'string' ? selected : null;
}
