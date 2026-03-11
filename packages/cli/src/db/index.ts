export { SqliteRepository } from './SqliteRepository.js';
export { PostgresRepository } from './PostgresRepository.js';

import path from 'path';
import { createRequire } from 'module';
import fs from 'fs-extra';
import initSqlJs from 'sql.js';
import { SqliteRepository } from './SqliteRepository.js';
import { PostgresRepository } from './PostgresRepository.js';
import type { ProjectRepository } from '../types.js';

const require = createRequire(import.meta.url);

/**
 * Factory that selects the right ProjectRepository based on the environment.
 * Async because SQLite (sql.js) requires loading WASM first.
 *
 * Local (default): SQLite at ~/.vibehub/projects.db (pure JS, no native deps)
 * Production:      Set VIBEHUB_DB=postgres and DATABASE_URL
 */
export async function createRepository(opts: { dataDir?: string } = {}): Promise<ProjectRepository> {
  const driver = process.env.VIBEHUB_DB ?? 'sqlite';

  if (driver === 'postgres') {
    const repo = new PostgresRepository();
    repo.migrate().catch((err) => {
      console.warn('Postgres migration failed:', err);
    });
    return repo;
  }

  const dataDir = opts.dataDir ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.vibehub');
  const dbPath = path.join(dataDir, 'projects.db');
  await fs.ensureDir(path.dirname(dbPath));

  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  let db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>;
  if (await fs.pathExists(dbPath)) {
    const buf = await fs.readFile(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  return new SqliteRepository(db, dbPath);
}
