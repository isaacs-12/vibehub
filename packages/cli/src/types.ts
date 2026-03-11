// ─── .vibe/ Structure Types ───────────────────────────────────────────────────

/** A single feature description stored in .vibe/features/<name>.md */
export interface VibeFeature {
  name: string;       // filename stem, e.g. "authentication"
  content: string;    // full Markdown body
}

/** A requirements document stored in .vibe/requirements/<name>.yaml */
export interface VibeRequirement {
  name: string;       // filename stem, e.g. "tech-stack"
  data: Record<string, unknown>;  // parsed YAML object
}

/** .vibe/mapping.json — maps vibe file paths to source code paths */
export interface VibeMapping {
  [vibeFile: string]: string[];   // e.g. "features/auth.md" -> ["src/auth/**"]
}

/** In-memory snapshot of a full VibeProject */
export interface VibeSnapshot {
  name: string;
  features: VibeFeature[];
  requirements: VibeRequirement[];
  mapping: VibeMapping;
}

// ─── Storage Abstraction ──────────────────────────────────────────────────────

export interface StorageProvider {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

// ─── Repository Pattern ───────────────────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRepository {
  save(project: ProjectRecord): Promise<void>;
  findById(id: string): Promise<ProjectRecord | null>;
  findAll(): Promise<ProjectRecord[]>;
  delete(id: string): Promise<void>;
}
