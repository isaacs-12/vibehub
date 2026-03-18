import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  description: text('description'),
  forkedFromId: text('forked_from_id'),
  compiledWith: text('compiled_with'),        // model used for last compile (e.g. "claude-opus-4")
  visibility: text('visibility').notNull().default('public'), // public | unlisted | private
  starCount: integer('star_count').notNull().default(0),
  forkCount: integer('fork_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stars = pgTable('stars', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const features = pgTable('features', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const requirements = pgTable('requirements', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const vibePullRequests = pgTable('vibe_pull_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
  baseBranch: text('base_branch').notNull().default('main'),
  headBranch: text('head_branch').notNull(),
  status: text('status').notNull().default('open'), // open | merged | closed
  decisionsChanged: integer('decisions_changed').notNull().default(0),
  intentDiff: jsonb('intent_diff'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const prComments = pgTable('pr_comments', {
  id: text('id').primaryKey(),
  prId: text('pr_id').notNull().references(() => vibePullRequests.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  content: text('content').notNull(),
  featureRef: text('feature_ref'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const importJobs = pgTable('import_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  repoUrl: text('repo_url').notNull(),
  status: text('status').notNull().default('pending'), // pending | running | done | failed
  featuresExtracted: integer('features_extracted').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ─── Version control: immutable spec snapshots & compilation records ─────────

export const specSnapshots = pgTable('spec_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),             // auto-incrementing per project (1, 2, 3…)
  features: jsonb('features').notNull(),              // Array<{ slug: string; content: string }>
  message: text('message'),                           // human-readable change summary (PR title, "initial import", etc.)
  author: text('author'),                             // who triggered this snapshot
  prId: text('pr_id'),                                // the PR that produced this snapshot, if any
  parentSnapshotId: text('parent_snapshot_id'),       // previous snapshot in this project's history
  forkedFromSnapshotId: text('forked_from_snapshot_id'), // snapshot this project was forked from (cross-project)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const compilations = pgTable('compilations', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id').notNull().references(() => specSnapshots.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),                     // "claude-opus-4", "gemini-2.5-flash", etc.
  status: text('status').notNull().default('pending'), // pending | running | completed | failed
  code: jsonb('code'),                                // Array<{ path: string; content: string }> — generated files
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const providerSettings = pgTable('provider_settings', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // gemini-flash | claude-sonnet | gpt-4o | local-ollama
  encryptedApiKey: text('encrypted_api_key'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
