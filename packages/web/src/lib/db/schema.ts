import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

// ─── Users & Auth ────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),                           // UUID
  googleId: text('google_id').notNull(),                 // Google OAuth subject
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  handle: text('handle').notNull(),                      // URL-friendly username (unique)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  googleIdIdx: uniqueIndex('users_google_id_idx').on(table.googleId),
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  handleIdx: uniqueIndex('users_handle_idx').on(table.handle),
}));

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),                           // secure random token
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  description: text('description'),
  forkedFromId: text('forked_from_id'),
  framework: text('framework'),               // nextjs | vite | express | fastapi | flask | null
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

// ─── User model preferences & API keys ───────────────────────────────────────

/**
 * Per-user model preferences.
 * Determines which model/provider is used for compilation.
 * Anonymous users fall back to the platform's cheapest free-tier model.
 */
export const userModelPreferences = pgTable('user_model_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  preferredModel: text('preferred_model').notNull().default('gemini-2.5-flash-lite'), // model ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: uniqueIndex('user_model_prefs_user_idx').on(table.userId),
}));

/**
 * Per-user API keys for external providers.
 * Encrypted at rest. Users can bring their own keys to unlock more powerful models.
 * Future: platform-managed billing replaces this for users who don't have their own keys.
 */
export const userApiKeys = pgTable('user_api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),               // 'anthropic' | 'google' | 'openai'
  encryptedApiKey: text('encrypted_api_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userProviderIdx: uniqueIndex('user_api_keys_user_provider_idx').on(table.userId, table.provider),
}));

/**
 * Usage tracking — records per-user model usage for future billing.
 * Even before billing is live, this gives us the data to build on.
 */
export const usageRecords = pgTable('usage_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // null = anonymous
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  provider: text('provider').notNull(),               // 'anthropic' | 'google' | 'openai' | 'platform'
  keySource: text('key_source').notNull(),             // 'user' | 'platform' — whose key was used
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
