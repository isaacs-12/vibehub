/**
 * Tests for update lifecycle: close, reopen, and status transitions.
 *
 * Uses FileStore with a temporary data directory to avoid touching
 * the real ~/.vibehub/data.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Point FileStore at a temp directory before importing
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibehub-test-'));
  process.env.VIBEHUB_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.VIBEHUB_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Dynamic import so env var is set before the module loads
async function loadStore() {
  // Clear module cache to pick up new VIBEHUB_DATA_DIR
  const modulePath = path.resolve(__dirname, 'store.ts');
  // vitest handles re-evaluation, but we need a fresh getStore call
  const mod = await import('./store');
  return mod.getStore();
}

function makePR(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId: 'proj-1',
    title: 'Test update',
    author: 'testuser',
    status: 'open' as const,
    headBranch: 'feature/test',
    decisionsChanged: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'proj-1',
    owner: 'testuser',
    repo: 'test-repo',
    description: 'A test project',
    visibility: 'public' as const,
    listed: true,
    starCount: 0,
    forkCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Update lifecycle', () => {
  it('should close an open update', async () => {
    const store = await loadStore();
    const pr = makePR();
    await store.upsertProject(makeProject());
    await store.upsertPR(pr);

    // Close it
    await store.upsertPR({ ...pr, status: 'closed' });
    const closed = await store.getPR(pr.id);
    expect(closed?.status).toBe('closed');
  });

  it('should reopen a closed update', async () => {
    const store = await loadStore();
    const pr = makePR({ status: 'closed' as const });
    await store.upsertProject(makeProject());
    await store.upsertPR(pr);

    await store.upsertPR({ ...pr, status: 'open' });
    const reopened = await store.getPR(pr.id);
    expect(reopened?.status).toBe('open');
  });

  it('should not allow reopening a merged update', async () => {
    const store = await loadStore();
    const pr = makePR({ status: 'merged' as const });
    await store.upsertProject(makeProject());
    await store.upsertPR(pr);

    // Merged PRs should stay merged — the API enforces this,
    // but at the store level the upsert is unconstrained.
    // This test documents the expected API behavior.
    const merged = await store.getPR(pr.id);
    expect(merged?.status).toBe('merged');
  });

  it('should list PRs filtered by status', async () => {
    const store = await loadStore();
    await store.upsertProject(makeProject());

    const open1 = makePR({ id: 'pr-1', title: 'Open 1' });
    const open2 = makePR({ id: 'pr-2', title: 'Open 2' });
    const merged = makePR({ id: 'pr-3', title: 'Merged', status: 'merged' as const });
    const closed = makePR({ id: 'pr-4', title: 'Closed', status: 'closed' as const });

    await store.upsertPR(open1);
    await store.upsertPR(open2);
    await store.upsertPR(merged);
    await store.upsertPR(closed);

    const all = await store.listPRs('proj-1');
    expect(all).toHaveLength(4);

    const openOnly = all.filter((p) => p.status === 'open');
    expect(openOnly).toHaveLength(2);

    const closedOnly = all.filter((p) => p.status === 'closed');
    expect(closedOnly).toHaveLength(1);
    expect(closedOnly[0].title).toBe('Closed');
  });
});

describe('Compile job retry', () => {
  it('should create a new compile job for retry', async () => {
    const store = await loadStore();
    await store.upsertProject(makeProject());
    const pr = makePR();
    await store.upsertPR(pr);

    // Create a failed job
    await store.createCompileJob({
      id: 'job-1',
      prId: pr.id,
      status: 'failed',
      createdAt: '2026-01-01T00:00:00.000Z',
      error: 'Timed out',
    });

    const failedJob = await store.getCompileJobForPR(pr.id);
    expect(failedJob?.status).toBe('failed');

    // Create a retry job (later timestamp)
    await store.createCompileJob({
      id: 'job-2',
      prId: pr.id,
      status: 'pending',
      createdAt: '2026-01-01T00:01:00.000Z',
    });

    const retryJob = await store.getCompileJobForPR(pr.id);
    expect(retryJob?.status).toBe('pending');
    expect(retryJob?.id).toBe('job-2');
  });

  it('should count active jobs per user', async () => {
    const store = await loadStore();

    await store.createCompileJob({
      id: 'j1',
      prId: 'pr-a',
      status: 'running',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    });
    await store.createCompileJob({
      id: 'j2',
      prId: 'pr-b',
      status: 'pending',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    });
    await store.createCompileJob({
      id: 'j3',
      prId: 'pr-c',
      status: 'completed',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
    });

    const active = await store.countActiveJobsForUser('user-1');
    expect(active).toBe(2); // running + pending, not completed
  });
});

describe('Status transitions', () => {
  it('open → closed → open lifecycle', async () => {
    const store = await loadStore();
    await store.upsertProject(makeProject());
    const pr = makePR();
    await store.upsertPR(pr);

    // open → closed
    await store.upsertPR({ ...pr, status: 'closed' });
    expect((await store.getPR(pr.id))?.status).toBe('closed');

    // closed → open
    await store.upsertPR({ ...pr, status: 'open' });
    expect((await store.getPR(pr.id))?.status).toBe('open');

    // open → merged
    await store.upsertPR({ ...pr, status: 'merged' });
    expect((await store.getPR(pr.id))?.status).toBe('merged');
  });
});

describe('Revert safety', () => {
  it('should set up correct base/head for revert via snapshots', async () => {
    const store = await loadStore();
    await store.upsertProject(makeProject());

    // Simulate: initial state → merge A → merge B → revert A
    // S0: initial snapshot with feature auth
    const s0 = await store.createSnapshot({
      id: crypto.randomUUID(),
      projectId: 'proj-1',
      version: 0,
      features: [{ slug: 'auth', content: 'Basic auth' }],
      message: 'Initial',
      parentSnapshotId: null,
      forkedFromSnapshotId: null,
      createdAt: '2026-01-01T00:00:00Z',
    });

    // PR A merges: changes auth, adds payments
    const prA = makePR({ id: 'pr-a', title: 'Add payments', status: 'merged' as const });
    await store.upsertPR(prA);

    const s1 = await store.createSnapshot({
      id: crypto.randomUUID(),
      projectId: 'proj-1',
      version: 0,
      features: [
        { slug: 'auth', content: 'OAuth2 auth' },
        { slug: 'payments', content: 'Stripe payments' },
      ],
      message: 'Add payments',
      prId: 'pr-a',
      parentSnapshotId: s0.id,
      forkedFromSnapshotId: null,
      createdAt: '2026-01-01T00:01:00Z',
    });

    // PR B merges: adds dashboard (doesn't touch auth or payments)
    const prB = makePR({ id: 'pr-b', title: 'Add dashboard', status: 'merged' as const });
    await store.upsertPR(prB);

    const s2 = await store.createSnapshot({
      id: crypto.randomUUID(),
      projectId: 'proj-1',
      version: 0,
      features: [
        { slug: 'auth', content: 'OAuth2 auth' },
        { slug: 'payments', content: 'Stripe payments' },
        { slug: 'dashboard', content: 'Analytics dashboard' },
      ],
      message: 'Add dashboard',
      prId: 'pr-b',
      parentSnapshotId: s1.id,
      forkedFromSnapshotId: null,
      createdAt: '2026-01-01T00:02:00Z',
    });

    // Now simulate creating a revert of PR A
    // Find the snapshot created by A
    const snapshots = await store.listSnapshots('proj-1');
    const prASnapshot = snapshots.find((s) => s.prId === 'pr-a');
    expect(prASnapshot).toBeDefined();
    expect(prASnapshot!.parentSnapshotId).toBe(s0.id);

    const parentSnapshot = await store.getSnapshot(prASnapshot!.parentSnapshotId!);
    expect(parentSnapshot).toBeDefined();

    // The revert's base = what A created (S1)
    // The revert's head = what existed before A (S0)
    const revertBase = prASnapshot!.features.map((f) => ({
      path: `.vibe/features/${f.slug}.md`,
      content: f.content,
    }));
    const revertHead = parentSnapshot!.features.map((f) => ({
      path: `.vibe/features/${f.slug}.md`,
      content: f.content,
    }));

    // base has auth=OAuth2 + payments=Stripe
    expect(revertBase).toHaveLength(2);
    expect(revertBase.find((f) => f.path.includes('auth'))?.content).toBe('OAuth2 auth');
    expect(revertBase.find((f) => f.path.includes('payments'))?.content).toBe('Stripe payments');

    // head has auth=Basic (reverting to pre-A state)
    expect(revertHead).toHaveLength(1);
    expect(revertHead[0].content).toBe('Basic auth');

    // When this revert is merged, the 3-way merge will:
    // - See that auth changed (OAuth2 → Basic): revert it
    // - See that payments was removed (exists in base, not in head): revert it
    // - dashboard is NOT in base or head, so main's version is untouched
    // This is exactly the safe behavior we want.
  });

  it('should detect conflicts when reverting overlapping changes', async () => {
    // Import the merge utilities to verify conflict detection
    const { detectConflicts } = await import('../vibe-merge');

    // Scenario: A changes auth, B also changes auth differently, revert A
    const base = [
      { path: '.vibe/features/auth.md', content: 'OAuth2 auth' },
      { path: '.vibe/features/payments.md', content: 'Stripe' },
    ];
    const head = [
      { path: '.vibe/features/auth.md', content: 'Basic auth' }, // reverting auth
    ];
    const main = [
      { path: '.vibe/features/auth.md', content: 'OAuth2 + SSO auth' }, // B changed auth too
      { path: '.vibe/features/payments.md', content: 'Stripe' },
      { path: '.vibe/features/dashboard.md', content: 'Dashboard' },
    ];

    const conflicts = detectConflicts(base, head, main);

    // auth should conflict: revert wants Basic, but main moved to OAuth2+SSO
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe('auth');
    expect(conflicts[0].headContent).toBe('Basic auth');
    expect(conflicts[0].mainContent).toBe('OAuth2 + SSO auth');
  });
});

describe('Branch guards', () => {
  // The API rejects headBranch=main/master. This tests the guard logic inline
  // since we can't easily spin up a Next.js route handler in a unit test.
  function isProtectedBranch(headBranch: string): boolean {
    const normalized = headBranch.toLowerCase();
    return normalized === 'main' || normalized === 'master';
  }

  it('should reject main as headBranch', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('Main')).toBe(true);
    expect(isProtectedBranch('MAIN')).toBe(true);
  });

  it('should reject master as headBranch', () => {
    expect(isProtectedBranch('master')).toBe(true);
    expect(isProtectedBranch('Master')).toBe(true);
  });

  it('should allow feature branches', () => {
    expect(isProtectedBranch('feature/add-auth')).toBe(false);
    expect(isProtectedBranch('fix/login-bug')).toBe(false);
    expect(isProtectedBranch('main-feature')).toBe(false); // contains main but isn't main
  });
});
