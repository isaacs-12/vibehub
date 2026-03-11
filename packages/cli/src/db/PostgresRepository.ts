import pg from 'pg';
import type { ProjectRecord, ProjectRepository } from '../types.js';

const { Pool } = pg;

/**
 * PostgresRepository — production implementation of ProjectRepository.
 *
 * Requires a DATABASE_URL environment variable (or explicit connString).
 * Example: postgresql://user:pass@host:5432/vibehub
 */
export class PostgresRepository implements ProjectRepository {
  private pool: pg.Pool;

  constructor(connString?: string) {
    this.pool = new Pool({
      connectionString: connString ?? process.env.DATABASE_URL,
    });
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT        NOT NULL,
        root_path  TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  async save(project: ProjectRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO projects (id, name, root_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         name       = EXCLUDED.name,
         root_path  = EXCLUDED.root_path,
         updated_at = EXCLUDED.updated_at`,
      [project.id, project.name, project.rootPath, project.createdAt, project.updatedAt],
    );
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    const res = await this.pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    return res.rows.length > 0 ? toRecord(res.rows[0]) : null;
  }

  async findAll(): Promise<ProjectRecord[]> {
    const res = await this.pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    return res.rows.map(toRecord);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM projects WHERE id = $1', [id]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface RawRow {
  id: string;
  name: string;
  root_path: string;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: RawRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
