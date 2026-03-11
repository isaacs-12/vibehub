import Database from 'better-sqlite3';
import type { ProjectRecord, ProjectRepository } from '../types.js';

/**
 * SqliteRepository — local-dev implementation of ProjectRepository.
 *
 * Creates (or opens) a SQLite database at the given file path and manages
 * a `projects` table.
 */
export class SqliteRepository implements ProjectRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        root_path  TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  async save(project: ProjectRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, root_path, created_at, updated_at)
      VALUES (@id, @name, @rootPath, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name       = excluded.name,
        root_path  = excluded.root_path,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as RawRow | undefined;
    return row ? toRecord(row) : null;
  }

  async findAll(): Promise<ProjectRecord[]> {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as RawRow[];
    return rows.map(toRecord);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}

interface RawRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: RawRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
