/**
 * Data store abstraction.
 *
 * Local dev (no DATABASE_URL): persists to ~/.vibehub/data.json
 * Production (DATABASE_URL set): delegates to Drizzle + Postgres
 *
 * All methods are async so callers are identical either way.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  owner: string;
  repo: string;
  description: string;
  createdAt: string;   // ISO
  updatedAt: string;
}

export interface Feature {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface VibePR {
  id: string;
  projectId: string;
  title: string;
  author: string;
  status: 'open' | 'merged' | 'closed';
  headBranch: string;
  decisionsChanged: number;
  createdAt: string;
  updatedAt: string;
}

export interface PRComment {
  id: string;
  prId: string;
  author: string;
  content: string;
  createdAt: string;
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface Store {
  // Projects
  getProject(owner: string, repo: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  upsertProject(p: Project): Promise<void>;

  // Features
  listFeatures(projectId: string): Promise<Feature[]>;
  upsertFeature(f: Feature): Promise<void>;

  // PRs
  listPRs(projectId: string): Promise<VibePR[]>;
  getPR(id: string): Promise<VibePR | null>;
  upsertPR(pr: VibePR): Promise<void>;

  // Comments
  listComments(prId: string): Promise<PRComment[]>;
  addComment(c: PRComment): Promise<void>;
}

// ─── File store (local dev) ───────────────────────────────────────────────────

interface FileData {
  projects: Project[];
  features: Feature[];
  prs: VibePR[];
  comments: PRComment[];
}

function dataFilePath(): string {
  const dir = process.env.VIBEHUB_DATA_DIR ?? path.join(os.homedir(), '.vibehub');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'data.json');
}

function readFile(): FileData {
  const p = dataFilePath();
  if (!fs.existsSync(p)) return { projects: [], features: [], prs: [], comments: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { projects: [], features: [], prs: [], comments: [] };
  }
}

function writeFile(data: FileData): void {
  fs.writeFileSync(dataFilePath(), JSON.stringify(data, null, 2), 'utf8');
}

class FileStore implements Store {
  async getProject(owner: string, repo: string): Promise<Project | null> {
    return readFile().projects.find(
      (p) => p.owner === owner && p.repo === repo,
    ) ?? null;
  }

  async listProjects(): Promise<Project[]> {
    return readFile().projects;
  }

  async upsertProject(project: Project): Promise<void> {
    const data = readFile();
    const idx = data.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) data.projects[idx] = project;
    else data.projects.push(project);
    writeFile(data);
  }

  async listFeatures(projectId: string): Promise<Feature[]> {
    return readFile().features.filter((f) => f.projectId === projectId);
  }

  async upsertFeature(feature: Feature): Promise<void> {
    const data = readFile();
    const idx = data.features.findIndex((f) => f.id === feature.id);
    if (idx >= 0) data.features[idx] = feature;
    else data.features.push(feature);
    writeFile(data);
  }

  async listPRs(projectId: string): Promise<VibePR[]> {
    return readFile().prs
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPR(id: string): Promise<VibePR | null> {
    return readFile().prs.find((p) => p.id === id) ?? null;
  }

  async upsertPR(pr: VibePR): Promise<void> {
    const data = readFile();
    const idx = data.prs.findIndex((p) => p.id === pr.id);
    if (idx >= 0) data.prs[idx] = pr;
    else data.prs.push(pr);
    writeFile(data);
  }

  async listComments(prId: string): Promise<PRComment[]> {
    return readFile().comments.filter((c) => c.prId === prId);
  }

  async addComment(comment: PRComment): Promise<void> {
    const data = readFile();
    data.comments.push(comment);
    writeFile(data);
  }
}

// ─── Postgres store (production) ──────────────────────────────────────────────

class PostgresStore implements Store {
  // Lazy-loaded to avoid importing drizzle at build time when DATABASE_URL is absent
  private async db() {
    const { db } = await import('../db/client');
    return db;
  }

  private async schema() {
    return import('../db/schema');
  }

  async getProject(owner: string, repo: string): Promise<Project | null> {
    const { eq, and } = await import('drizzle-orm');
    const db = await this.db();
    const { projects } = await this.schema();
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.owner, owner), eq(projects.repo, repo)))
      .limit(1);
    if (!row) return null;
    return { ...row, description: row.description ?? '', createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async listProjects(): Promise<Project[]> {
    const db = await this.db();
    const { projects } = await this.schema();
    const rows = await db.select().from(projects);
    return rows.map((r) => ({ ...r, description: r.description ?? '', createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
  }

  async upsertProject(p: Project): Promise<void> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { projects } = await this.schema();
    await db.insert(projects).values({
      id: p.id, owner: p.owner, repo: p.repo, description: p.description,
      createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt),
    }).onConflictDoUpdate({
      target: projects.id,
      set: { description: p.description, updatedAt: new Date(p.updatedAt) },
    });
  }

  async listFeatures(projectId: string): Promise<Feature[]> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { features } = await this.schema();
    const rows = await db.select().from(features).where(eq(features.projectId, projectId));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
  }

  async upsertFeature(f: Feature): Promise<void> {
    const db = await this.db();
    const { features } = await this.schema();
    await db.insert(features).values({
      id: f.id, projectId: f.projectId, name: f.name, slug: f.slug, content: f.content,
      createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt),
    }).onConflictDoUpdate({
      target: features.id,
      set: { content: f.content, name: f.name, updatedAt: new Date(f.updatedAt) },
    });
  }

  async listPRs(projectId: string): Promise<VibePR[]> {
    const { eq, desc } = await import('drizzle-orm');
    const db = await this.db();
    const { vibePullRequests } = await this.schema();
    const rows = await db.select().from(vibePullRequests)
      .where(eq(vibePullRequests.projectId, projectId))
      .orderBy(desc(vibePullRequests.createdAt));
    return rows.map((r) => ({
      id: r.id, projectId: r.projectId, title: r.title, author: r.authorId,
      status: r.status as VibePR['status'], headBranch: r.headBranch,
      decisionsChanged: r.decisionsChanged,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getPR(id: string): Promise<VibePR | null> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { vibePullRequests } = await this.schema();
    const [row] = await db.select().from(vibePullRequests).where(eq(vibePullRequests.id, id)).limit(1);
    if (!row) return null;
    return {
      id: row.id, projectId: row.projectId, title: row.title, author: row.authorId,
      status: row.status as VibePR['status'], headBranch: row.headBranch,
      decisionsChanged: row.decisionsChanged,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertPR(pr: VibePR): Promise<void> {
    const db = await this.db();
    const { vibePullRequests } = await this.schema();
    await db.insert(vibePullRequests).values({
      id: pr.id, projectId: pr.projectId, title: pr.title, authorId: pr.author,
      status: pr.status, headBranch: pr.headBranch, decisionsChanged: pr.decisionsChanged,
      createdAt: new Date(pr.createdAt), updatedAt: new Date(pr.updatedAt),
    }).onConflictDoUpdate({
      target: vibePullRequests.id,
      set: { title: pr.title, status: pr.status, updatedAt: new Date(pr.updatedAt) },
    });
  }

  async listComments(prId: string): Promise<PRComment[]> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { prComments } = await this.schema();
    const rows = await db.select().from(prComments).where(eq(prComments.prId, prId));
    return rows.map((r) => ({ id: r.id, prId: r.prId, author: r.authorId, content: r.content, createdAt: r.createdAt.toISOString() }));
  }

  async addComment(c: PRComment): Promise<void> {
    const db = await this.db();
    const { prComments } = await this.schema();
    await db.insert(prComments).values({
      id: c.id, prId: c.prId, authorId: c.author, content: c.content,
      createdAt: new Date(c.createdAt),
    });
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _store: Store | null = null;

export function getStore(): Store {
  if (!_store) {
    _store = process.env.DATABASE_URL ? new PostgresStore() : new FileStore();
  }
  return _store;
}
