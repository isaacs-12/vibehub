import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  repo: text('repo').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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

export const providerSettings = pgTable('provider_settings', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // gemini-flash | claude-sonnet | gpt-4o | local-ollama
  encryptedApiKey: text('encrypted_api_key'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
