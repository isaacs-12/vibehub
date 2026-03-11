import fs from 'fs-extra';
import type { ProjectRecord, ProjectRepository } from '../types.js';
import type { Database as SqlJsDatabase } from 'sql.js';

/**
 * SqliteRepository — local-dev implementation of ProjectRepository.
 *
 * Uses sql.js (WASM, no native bindings) so it works on any Node version including 25+.
 * Persists to a file at dbPath; loads on creation and saves after each write.
 */
export class SqliteRepository implements ProjectRepository {
  constructor(
    private db: SqlJsDatabase,
    private dbPath: string,
  ) {
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        root_path  TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async persist(): Promise<void> {
    const data = this.db.export();
    await fs.writeFile(this.dbPath, Buffer.from(data));
  }

  async save(project: ProjectRecord): Promise<void> {
    this.db.run(
      `INSERT INTO projects (id, name, root_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         root_path = excluded.root_path,
         updated_at = excluded.updated_at`,
      [
        project.id,
        project.name,
        project.rootPath,
        project.createdAt.toISOString(),
        project.updatedAt.toISOString(),
      ],
    );
    await this.persist();
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as RawRow;
      stmt.free();
      return toRecord(row);
    }
    stmt.free();
    return null;
  }

  async findAll(): Promise<ProjectRecord[]> {
    const result = this.db.exec('SELECT * FROM projects ORDER BY created_at DESC');
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    const { columns, values } = result[0];
    return values.map((row: unknown[]) => {
      const obj: Record<string, string> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = String(row[i]);
      });
      return toRecord(obj as unknown as RawRow);
    });
  }

  async delete(id: string): Promise<void> {
    this.db.run('DELETE FROM projects WHERE id = ?', [id]);
    await this.persist();
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
