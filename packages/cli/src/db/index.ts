export { SqliteRepository } from './SqliteRepository.js';
export { PostgresRepository } from './PostgresRepository.js';

import path from 'path';
import { SqliteRepository } from './SqliteRepository.js';
import { PostgresRepository } from './PostgresRepository.js';
import type { ProjectRepository } from '../types.js';

/**
 * Factory that selects the right ProjectRepository based on the environment.
 *
 * Local (default): SQLite at ~/.vibehub/projects.db
 * Production:      Set VIBEHUB_DB=postgres and DATABASE_URL
 */
export function createRepository(opts: { dataDir?: string } = {}): ProjectRepository {
  const driver = process.env.VIBEHUB_DB ?? 'sqlite';

  if (driver === 'postgres') {
    const repo = new PostgresRepository();
    // Run migrations eagerly (fire-and-forget with a warning on failure)
    repo.migrate().catch((err) => {
      console.warn('Postgres migration failed:', err);
    });
    return repo;
  }

  const dataDir = opts.dataDir ?? path.join(process.env.HOME ?? '.', '.vibehub');
  return new SqliteRepository(path.join(dataDir, 'projects.db'));
}
