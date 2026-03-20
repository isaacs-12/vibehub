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

// ─── User types ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  handle: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  owner: string;
  repo: string;
  description: string;
  framework?: string | null;      // nextjs | vite | express | fastapi | flask
  forkedFromId?: string | null;   // project ID this was forked from
  compiledWith?: string | null;   // model used for last compile
  visibility: 'public' | 'unlisted' | 'private';
  starCount: number;
  forkCount: number;
  createdAt: string;   // ISO
  updatedAt: string;
}

export interface Star {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
}

/** A project and all its related forks (the "family"). */
export interface ProjectFamily {
  root: Project;
  variants: Project[];          // all forks (direct + transitive), sorted by starCount desc
  totalStars: number;           // rollup across entire family
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
  /** Vibe file contents and generated code captured at push time; stored in intentDiff in DB. */
  intentDiff?: {
    /** Main branch vibes at the time the feature branch was cut — used for 3-way conflict detection. */
    baseFeatures?: { path: string; content: string }[];
    /** Changed vibe files on the feature branch (the intent diff). */
    headFeatures?: { path: string; content: string }[];
    /** Generated code from Vibe compile, pushed alongside the vibes. */
    implementationProofs?: { path: string; content: string }[];
  } | null;
}

export interface PRComment {
  id: string;
  prId: string;
  author: string;
  content: string;
  createdAt: string;
}

/** An immutable point-in-time capture of all feature specs. */
export interface SpecSnapshot {
  id: string;
  projectId: string;
  version: number;                                    // auto-incrementing per project
  features: { slug: string; content: string }[];      // full spec content at this point
  message?: string;                                   // "Merged PR: Add auth feature"
  author?: string;
  prId?: string;                                      // PR that triggered this snapshot
  parentSnapshotId?: string | null;                   // previous snapshot in project history
  forkedFromSnapshotId?: string | null;               // snapshot from another project (fork source)
  createdAt: string;
}

/** A record of compiling a specific snapshot with a specific model. */
export interface Compilation {
  id: string;
  snapshotId: string;
  projectId: string;
  model: string;                                      // "claude-opus-4", "gemini-2.5-flash", etc.
  status: 'pending' | 'running' | 'completed' | 'failed';
  code?: { path: string; content: string }[] | null;  // generated files
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

/** A cloud compile job enqueued when a PR is pushed or merged. */
export interface CompileJob {
  id: string;
  prId: string;
  /** 'pending' = waiting to be picked up; 'running' = agent is working; 'completed' / 'failed' = done. */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** The generation model the agent should use for this job. */
  model?: string;
  /** The validation/fast model (null = same as generation model). */
  fastModel?: string;
  /** The provider for the generation model ('google' | 'anthropic' | 'openai'). */
  provider?: string;
  /** Encrypted API key — only set when using a user-provided key. The agent decrypts server-side. */
  apiKey?: string;
  /** 'platform' or 'user' — tracks whose key was used, for billing. */
  keySource?: string;
  /** The user who triggered this job (null for anonymous). */
  userId?: string | null;
  /** Real-time progress events appended by the agent during compilation. */
  events?: CompileJobEvent[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/** A single progress event emitted by the agent during compilation. */
export interface CompileJobEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface Store {
  // Users
  getUserByHandle(handle: string): Promise<User | null>;
  listUserProjects(handle: string): Promise<Project[]>;

  // Projects
  getProject(owner: string, repo: string): Promise<Project | null>;
  getProjectById(id: string): Promise<Project | null>;
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

  // Spec snapshots & compilations
  createSnapshot(snapshot: SpecSnapshot): Promise<SpecSnapshot>;
  listSnapshots(projectId: string): Promise<SpecSnapshot[]>;
  getSnapshot(id: string): Promise<SpecSnapshot | null>;
  getLatestSnapshot(projectId: string): Promise<SpecSnapshot | null>;
  createCompilation(compilation: Compilation): Promise<void>;
  listCompilations(snapshotId: string): Promise<Compilation[]>;
  listProjectCompilations(projectId: string): Promise<Compilation[]>;
  updateCompilation(id: string, updates: Partial<Pick<Compilation, 'status' | 'code' | 'error' | 'startedAt' | 'completedAt'>>): Promise<void>;

  // Stars & Lineage
  starProject(star: Star): Promise<void>;
  unstarProject(projectId: string, userId: string): Promise<void>;
  isStarred(projectId: string, userId: string): Promise<boolean>;
  getProjectFamily(projectId: string): Promise<ProjectFamily | null>;
  forkProject(sourceId: string, newOwner: string, newRepo: string): Promise<Project>;

  // Compile jobs (cloud agent queue)
  createCompileJob(job: CompileJob): Promise<void>;
  getCompileJobForPR(prId: string): Promise<CompileJob | null>;
  /** Atomically claims the next pending job by setting it to 'running'. Returns null if queue is empty. */
  claimNextPendingJob(): Promise<CompileJob | null>;
  updateCompileJob(id: string, updates: Partial<Pick<CompileJob, 'status' | 'startedAt' | 'completedAt' | 'error'>>): Promise<void>;
  /** Append progress events to a running compile job. */
  appendCompileJobEvents(id: string, events: CompileJobEvent[]): Promise<void>;
  /** Get a compile job by ID. */
  getCompileJob(id: string): Promise<CompileJob | null>;
  /** Count active (pending + running) compile jobs for a user. */
  countActiveJobsForUser(userId: string): Promise<number>;
  /** Find running jobs that started before the given cutoff (for zombie reaping). */
  findStaleRunningJobs(startedBefore: string): Promise<CompileJob[]>;
}

// ─── Compile concurrency limits ───────────────────────────────────────────────

/** Max concurrent compiles per user by key source. */
export const COMPILE_LIMITS = {
  /** Free tier: platform API key. */
  platform: 1,
  /** BYOK tier: user's own API key. */
  user: 3,
} as const;

/** How long a running job can stay alive before being reaped (ms). */
export const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// ─── File store (local dev) ───────────────────────────────────────────────────

interface FileData {
  projects: Project[];
  features: Feature[];
  prs: VibePR[];
  comments: PRComment[];
  compileJobs: CompileJob[];
  stars: Star[];
  snapshots: SpecSnapshot[];
  compilations: Compilation[];
}

function dataFilePath(): string {
  let dir: string;
  if (process.env.VIBEHUB_DATA_DIR) {
    dir = process.env.VIBEHUB_DATA_DIR;
  } else {
    try {
      dir = path.join(os.homedir(), '.vibehub');
    } catch {
      dir = path.join(process.cwd(), '.vibehub-data');
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'data.json');
}

function readFile(): FileData {
  const p = dataFilePath();
  if (!fs.existsSync(p)) return { projects: [], features: [], prs: [], comments: [], compileJobs: [], stars: [], snapshots: [], compilations: [] };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.compileJobs) data.compileJobs = [];
    if (!data.stars) data.stars = [];
    if (!data.snapshots) data.snapshots = [];
    if (!data.compilations) data.compilations = [];
    // Back-compat: ensure projects have new fields
    for (const proj of data.projects) {
      if (proj.visibility === undefined) proj.visibility = 'public';
      if (proj.starCount === undefined) proj.starCount = 0;
      if (proj.forkCount === undefined) proj.forkCount = 0;
    }
    return data;
  } catch {
    return { projects: [], features: [], prs: [], comments: [], compileJobs: [], stars: [], snapshots: [], compilations: [] };
  }
}

function writeFile(data: FileData): void {
  fs.writeFileSync(dataFilePath(), JSON.stringify(data, null, 2), 'utf8');
}

class FileStore implements Store {
  async getUserByHandle(_handle: string): Promise<User | null> { return null; }
  async listUserProjects(handle: string): Promise<Project[]> {
    return readFile().projects.filter((p) => p.owner === handle);
  }

  async getProject(owner: string, repo: string): Promise<Project | null> {
    return readFile().projects.find(
      (p) => p.owner === owner && p.repo === repo,
    ) ?? null;
  }

  async getProjectById(id: string): Promise<Project | null> {
    return readFile().projects.find((p) => p.id === id) ?? null;
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

  // ── Spec snapshots & compilations ──────────────────────────────────────────

  async createSnapshot(snapshot: SpecSnapshot): Promise<SpecSnapshot> {
    const data = readFile();
    // Auto-assign version: max existing version for this project + 1
    const projectSnapshots = data.snapshots.filter((s) => s.projectId === snapshot.projectId);
    const maxVersion = projectSnapshots.reduce((max, s) => Math.max(max, s.version), 0);
    const versioned = { ...snapshot, version: snapshot.version || maxVersion + 1 };
    data.snapshots.push(versioned);
    writeFile(data);
    return versioned;
  }

  async listSnapshots(projectId: string): Promise<SpecSnapshot[]> {
    return readFile().snapshots
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.version - b.version);
  }

  async getSnapshot(id: string): Promise<SpecSnapshot | null> {
    return readFile().snapshots.find((s) => s.id === id) ?? null;
  }

  async getLatestSnapshot(projectId: string): Promise<SpecSnapshot | null> {
    const snapshots = readFile().snapshots.filter((s) => s.projectId === projectId);
    if (snapshots.length === 0) return null;
    return snapshots.reduce((latest, s) => s.version > latest.version ? s : latest);
  }

  async createCompilation(compilation: Compilation): Promise<void> {
    const data = readFile();
    data.compilations.push(compilation);
    writeFile(data);
  }

  async listCompilations(snapshotId: string): Promise<Compilation[]> {
    return readFile().compilations
      .filter((c) => c.snapshotId === snapshotId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listProjectCompilations(projectId: string): Promise<Compilation[]> {
    return readFile().compilations
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCompilation(
    id: string,
    updates: Partial<Pick<Compilation, 'status' | 'code' | 'error' | 'startedAt' | 'completedAt'>>,
  ): Promise<void> {
    const data = readFile();
    const idx = data.compilations.findIndex((c) => c.id === id);
    if (idx >= 0) data.compilations[idx] = { ...data.compilations[idx], ...updates };
    writeFile(data);
  }

  // ── Stars & lineage ───────────────────────────────────────────────────────

  async starProject(star: Star): Promise<void> {
    const data = readFile();
    // Idempotent — skip if already starred
    if (data.stars.some((s) => s.projectId === star.projectId && s.userId === star.userId)) return;
    data.stars.push(star);
    // Update cached count
    const proj = data.projects.find((p) => p.id === star.projectId);
    if (proj) proj.starCount = data.stars.filter((s) => s.projectId === star.projectId).length;
    writeFile(data);
  }

  async unstarProject(projectId: string, userId: string): Promise<void> {
    const data = readFile();
    data.stars = data.stars.filter((s) => !(s.projectId === projectId && s.userId === userId));
    const proj = data.projects.find((p) => p.id === projectId);
    if (proj) proj.starCount = data.stars.filter((s) => s.projectId === projectId).length;
    writeFile(data);
  }

  async isStarred(projectId: string, userId: string): Promise<boolean> {
    return readFile().stars.some((s) => s.projectId === projectId && s.userId === userId);
  }

  async getProjectFamily(projectId: string): Promise<ProjectFamily | null> {
    const data = readFile();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return null;

    // Walk up to find root
    let root = project;
    const seen = new Set<string>([root.id]);
    while (root.forkedFromId) {
      const parent = data.projects.find((p) => p.id === root.forkedFromId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      root = parent;
    }

    // Collect all descendants of root (BFS)
    const family: Project[] = [];
    const queue = [root.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const forks = data.projects.filter((p) => p.forkedFromId === current && p.visibility === 'public');
      for (const fork of forks) {
        family.push(fork);
        queue.push(fork.id);
      }
    }

    family.sort((a, b) => b.starCount - a.starCount);
    const totalStars = root.starCount + family.reduce((sum, f) => sum + f.starCount, 0);

    return { root, variants: family, totalStars };
  }

  async forkProject(sourceId: string, newOwner: string, newRepo: string): Promise<Project> {
    const data = readFile();
    const source = data.projects.find((p) => p.id === sourceId);
    if (!source) throw new Error('Source project not found');

    const now = new Date().toISOString();
    const newProject: Project = {
      id: `${newOwner}-${newRepo}-${Date.now()}`,
      owner: newOwner,
      repo: newRepo,
      description: source.description,
      forkedFromId: sourceId,
      compiledWith: source.compiledWith,
      visibility: 'public',
      starCount: 0,
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(newProject);

    // Update source fork count
    source.forkCount = data.projects.filter((p) => p.forkedFromId === sourceId).length;

    // Copy features
    const sourceFeatures = data.features.filter((f) => f.projectId === sourceId);
    for (const f of sourceFeatures) {
      data.features.push({
        ...f,
        id: `${newProject.id}-${f.slug}`,
        projectId: newProject.id,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Find the latest source snapshot and create a fork snapshot referencing it
    const sourceSnapshots = data.snapshots.filter((s) => s.projectId === sourceId);
    const latestSourceSnapshot = sourceSnapshots.length > 0
      ? sourceSnapshots.reduce((latest, s) => s.version > latest.version ? s : latest)
      : null;

    const forkSnapshot: SpecSnapshot = {
      id: `snap-${newProject.id}-1`,
      projectId: newProject.id,
      version: 1,
      features: sourceFeatures.map((f) => ({ slug: f.slug, content: f.content })),
      message: `Forked from ${source.owner}/${source.repo}`,
      author: newOwner,
      parentSnapshotId: null,
      forkedFromSnapshotId: latestSourceSnapshot?.id ?? null,
      createdAt: now,
    };
    data.snapshots.push(forkSnapshot);

    // Also copy the latest compilation if one exists
    if (latestSourceSnapshot) {
      const sourceCompilations = data.compilations.filter(
        (c) => c.snapshotId === latestSourceSnapshot.id && c.status === 'completed',
      );
      if (sourceCompilations.length > 0) {
        const bestCompilation = sourceCompilations[0]; // most recent completed
        data.compilations.push({
          ...bestCompilation,
          id: `comp-${newProject.id}-fork`,
          snapshotId: forkSnapshot.id,
          projectId: newProject.id,
          createdAt: now,
        });
      }
    }

    writeFile(data);
    return newProject;
  }

  async createCompileJob(job: CompileJob): Promise<void> {
    const data = readFile();
    data.compileJobs.push(job);
    writeFile(data);
  }

  async getCompileJobForPR(prId: string): Promise<CompileJob | null> {
    const data = readFile();
    // Return the most recent job for this PR
    const jobs = data.compileJobs.filter((j) => j.prId === prId);
    if (jobs.length === 0) return null;
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  async claimNextPendingJob(): Promise<CompileJob | null> {
    const data = readFile();
    const idx = data.compileJobs.findIndex((j) => j.status === 'pending');
    if (idx < 0) return null;
    data.compileJobs[idx] = {
      ...data.compileJobs[idx],
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    writeFile(data);
    return data.compileJobs[idx];
  }

  async updateCompileJob(
    id: string,
    updates: Partial<Pick<CompileJob, 'status' | 'startedAt' | 'completedAt' | 'error'>>,
  ): Promise<void> {
    const data = readFile();
    const idx = data.compileJobs.findIndex((j) => j.id === id);
    if (idx >= 0) data.compileJobs[idx] = { ...data.compileJobs[idx], ...updates };
    writeFile(data);
  }

  async appendCompileJobEvents(id: string, events: CompileJobEvent[]): Promise<void> {
    const data = readFile();
    const idx = data.compileJobs.findIndex((j) => j.id === id);
    if (idx >= 0) {
      const job = data.compileJobs[idx];
      job.events = [...(job.events ?? []), ...events];
      writeFile(data);
    }
  }

  async getCompileJob(id: string): Promise<CompileJob | null> {
    return readFile().compileJobs.find((j) => j.id === id) ?? null;
  }

  async countActiveJobsForUser(userId: string): Promise<number> {
    return readFile().compileJobs.filter(
      (j) => j.userId === userId && (j.status === 'pending' || j.status === 'running'),
    ).length;
  }

  async findStaleRunningJobs(startedBefore: string): Promise<CompileJob[]> {
    return readFile().compileJobs.filter(
      (j) => j.status === 'running' && j.startedAt && j.startedAt < startedBefore,
    );
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

  async getUserByHandle(handle: string): Promise<User | null> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { users } = await this.schema();
    const [row] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
    if (!row) return null;
    return { ...row, name: row.name ?? null, avatarUrl: row.avatarUrl ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async listUserProjects(handle: string): Promise<Project[]> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { projects } = await this.schema();
    const rows = await db.select().from(projects).where(eq(projects.owner, handle));
    return rows.map((r) => ({ ...r, description: r.description ?? '', visibility: (r.visibility ?? 'public') as Project['visibility'], starCount: r.starCount ?? 0, forkCount: r.forkCount ?? 0, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
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
    return { ...row, description: row.description ?? '', visibility: (row.visibility ?? 'public') as Project['visibility'], starCount: row.starCount ?? 0, forkCount: row.forkCount ?? 0, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async getProjectById(id: string): Promise<Project | null> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { projects } = await this.schema();
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) return null;
    return { ...row, description: row.description ?? '', visibility: (row.visibility ?? 'public') as Project['visibility'], starCount: row.starCount ?? 0, forkCount: row.forkCount ?? 0, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async listProjects(): Promise<Project[]> {
    const db = await this.db();
    const { projects } = await this.schema();
    const rows = await db.select().from(projects);
    return rows.map((r) => ({ ...r, description: r.description ?? '', visibility: (r.visibility ?? 'public') as Project['visibility'], starCount: r.starCount ?? 0, forkCount: r.forkCount ?? 0, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
  }

  async upsertProject(p: Project): Promise<void> {
    const { eq } = await import('drizzle-orm');
    const db = await this.db();
    const { projects } = await this.schema();
    await db.insert(projects).values({
      id: p.id, owner: p.owner, repo: p.repo, description: p.description,
      framework: p.framework ?? null,
      forkedFromId: p.forkedFromId ?? null, compiledWith: p.compiledWith ?? null,
      visibility: p.visibility ?? 'public', starCount: p.starCount ?? 0, forkCount: p.forkCount ?? 0,
      createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt),
    }).onConflictDoUpdate({
      target: projects.id,
      set: {
        description: p.description,
        framework: p.framework ?? null,
        compiledWith: p.compiledWith ?? null,
        visibility: p.visibility ?? 'public',
        starCount: p.starCount ?? 0,
        forkCount: p.forkCount ?? 0,
        updatedAt: new Date(p.updatedAt),
      },
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
      intentDiff: r.intentDiff as VibePR['intentDiff'],
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
      intentDiff: row.intentDiff as VibePR['intentDiff'],
    };
  }

  async upsertPR(pr: VibePR): Promise<void> {
    const db = await this.db();
    const { vibePullRequests } = await this.schema();
    const values: Record<string, unknown> = {
      id: pr.id, projectId: pr.projectId, title: pr.title, authorId: pr.author,
      status: pr.status, headBranch: pr.headBranch, decisionsChanged: pr.decisionsChanged,
      createdAt: new Date(pr.createdAt), updatedAt: new Date(pr.updatedAt),
    };
    if (pr.intentDiff != null) values.intentDiff = pr.intentDiff;
    await db.insert(vibePullRequests).values(values as typeof vibePullRequests.$inferInsert)
      .onConflictDoUpdate({
        target: vibePullRequests.id,
        set: {
          title: pr.title,
          status: pr.status,
          updatedAt: new Date(pr.updatedAt),
          ...(pr.intentDiff != null && { intentDiff: pr.intentDiff }),
        },
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

  // TODO: migrate these to proper Postgres tables (needs schema + migration).
  async createSnapshot(s: SpecSnapshot): Promise<SpecSnapshot> { return s; /* TODO */ }
  async listSnapshots(_projectId: string): Promise<SpecSnapshot[]> { return []; }
  async getSnapshot(_id: string): Promise<SpecSnapshot | null> { return null; }
  async getLatestSnapshot(_projectId: string): Promise<SpecSnapshot | null> { return null; }
  async createCompilation(_c: Compilation): Promise<void> { /* TODO */ }
  async listCompilations(_snapshotId: string): Promise<Compilation[]> { return []; }
  async listProjectCompilations(_projectId: string): Promise<Compilation[]> { return []; }
  async updateCompilation(_id: string, _updates: Partial<Pick<Compilation, 'status' | 'code' | 'error' | 'startedAt' | 'completedAt'>>): Promise<void> { /* TODO */ }

  async starProject(_star: Star): Promise<void> { /* TODO */ }
  async unstarProject(_projectId: string, _userId: string): Promise<void> { /* TODO */ }
  async isStarred(_projectId: string, _userId: string): Promise<boolean> { return false; }
  async getProjectFamily(_projectId: string): Promise<ProjectFamily | null> { return null; }
  async forkProject(_sourceId: string, _newOwner: string, _newRepo: string): Promise<Project> { throw new Error('Not implemented'); }

  async createCompileJob(_job: CompileJob): Promise<void> { /* TODO */ }
  async getCompileJobForPR(_prId: string): Promise<CompileJob | null> { return null; }
  async claimNextPendingJob(): Promise<CompileJob | null> { return null; }
  async updateCompileJob(_id: string, _updates: Partial<Pick<CompileJob, 'status' | 'startedAt' | 'completedAt' | 'error'>>): Promise<void> { /* TODO */ }
  async appendCompileJobEvents(_id: string, _events: CompileJobEvent[]): Promise<void> { /* TODO */ }
  async getCompileJob(_id: string): Promise<CompileJob | null> { return null; }
  async countActiveJobsForUser(_userId: string): Promise<number> { return 0; }
  async findStaleRunningJobs(_startedBefore: string): Promise<CompileJob[]> { return []; }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _store: Store | null = null;

export function getStore(): Store {
  if (!_store) {
    _store = process.env.DATABASE_URL ? new PostgresStore() : new FileStore();
  }
  return _store;
}
