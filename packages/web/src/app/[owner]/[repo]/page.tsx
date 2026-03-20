import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, Settings, Plus, FolderOpen, Star, GitFork, Cpu, History, Check, Loader, X } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import { auth } from '@/lib/auth';
import CloneButton from '@/components/CloneButton/CloneButton';

interface Props {
  params: { owner: string; repo: string };
}

/** Extract a human-readable title and blurb from a feature's markdown content. */
function featureInfo(name: string, content: string): { title: string; blurb: string } {
  const lines = content.split('\n');

  let title = name.replace(/-/g, ' ');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) { title = m[1]; break; }
  }

  let blurb = '';
  let pastHeading = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#')) { pastHeading = true; continue; }
    if (pastHeading && t && !t.startsWith('##') && !t.startsWith('*') && !t.startsWith('-')) {
      blurb = t.slice(0, 120);
      break;
    }
  }

  return { title, blurb };
}

function statusLabel(status: string) {
  if (status === 'open') return { label: 'In review', cls: 'text-success bg-success/10 border-success/20' };
  if (status === 'merged') return { label: 'Applied', cls: 'text-accent-emphasis bg-accent-subtle border-accent/20' };
  return { label: status, cls: 'text-fg-muted bg-canvas-subtle border-border' };
}

export default async function ProjectDashboard({ params }: Props) {
  const { owner, repo } = params;
  const store = getStore();

  const project = await store.getProject(owner, repo);
  if (!project) notFound();

  const session = await auth();
  const isOwner = (session as any)?.handle === owner;

  const [features, prs, family, snapshots] = await Promise.all([
    store.listFeatures(project.id),
    store.listPRs(project.id),
    store.getProjectFamily(project.id),
    store.listSnapshots(project.id),
  ]);

  // Enrich snapshots with their compilations
  const snapshotsWithCompilations = await Promise.all(
    snapshots.slice(-10).map(async (s) => ({
      ...s,
      compilations: await store.listCompilations(s.id),
    })),
  );

  const recentPRs = prs.slice(0, 5);

  // If this is a fork, get the parent project info
  let forkedFrom: { owner: string; repo: string } | null = null;
  if (project.forkedFromId) {
    const allProjects = await store.listProjects();
    const parent = allProjects.find((p) => p.id === project.forkedFromId);
    if (parent) forkedFrom = { owner: parent.owner, repo: parent.repo };
  }

  // Other versions = family variants excluding current project
  const otherVersions = family?.variants.filter((v) => v.id !== project.id) ?? [];

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Forked-from banner */}
      {forkedFrom && (
        <div className="mb-4 text-xs text-fg-muted flex items-center gap-1.5">
          <GitFork size={12} />
          Forked from{' '}
          <Link href={`/${forkedFrom.owner}/${forkedFrom.repo}` as any} className="text-accent-emphasis hover:underline">
            {forkedFrom.owner}/{forkedFrom.repo}
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-fg">{owner}/{repo}</h1>
          {project.description && (
            <p className="text-sm text-fg-muted mt-0.5">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {(project as any).framework && (
              <span className="text-[10px] text-fg-muted flex items-center gap-1 bg-canvas-subtle border border-border rounded-full px-2 py-0.5">
                {(project as any).framework}
              </span>
            )}
            {project.compiledWith && (
              <span className="text-[10px] text-fg-muted flex items-center gap-1 bg-canvas-subtle border border-border rounded-full px-2 py-0.5">
                <Cpu size={9} />
                {project.compiledWith}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Star count */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md">
            <Star size={14} className={project.starCount > 0 ? 'text-yellow-400 fill-yellow-400' : 'text-fg-muted'} />
            <span className="text-fg-muted">{project.starCount}</span>
          </div>

          {/* Fork button */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md">
            <GitFork size={14} className="text-fg-muted" />
            <span className="text-fg-muted">{project.forkCount}</span>
          </div>

          <CloneButton owner={owner} repo={repo} />
          <Link
            href={`/${owner}/${repo}/pulls`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
          >
            <GitPullRequest size={14} />
            Updates
            {prs.filter((p) => p.status === 'open').length > 0 && (
              <span className="ml-1 bg-canvas text-fg-muted border border-border rounded-full px-1.5 text-xs">
                {prs.filter((p) => p.status === 'open').length}
              </span>
            )}
          </Link>
          {isOwner && (
            <Link
              href={`/${owner}/${repo}/settings`}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
            >
              <Settings size={14} />
              Settings
            </Link>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Feature cards (2/3) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-fg">Features</h2>
            <Link
              href={`/${owner}/${repo}/pulls/new`}
              className="flex items-center gap-1 text-xs text-accent-emphasis hover:underline"
            >
              <Plus size={11} /> Describe a change
            </Link>
          </div>

          {features.length === 0 ? (
            <div className="border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="text-5xl opacity-20">{'\u25C8'}</div>
              <p className="text-sm text-fg-muted">Nothing here yet.</p>
              <p className="text-xs text-fg-subtle max-w-xs">
                Describe what you want to build and the AI will start working on it.
              </p>
              <Link
                href={`/${owner}/${repo}/pulls/new`}
                className="mt-1 text-xs text-accent-emphasis hover:underline"
              >
                + Describe a change
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((f) => {
                const { title, blurb } = featureInfo(f.name, f.content);
                return (
                  <div
                    key={f.id}
                    className="bg-canvas-subtle border border-border rounded-xl p-4 hover:border-accent/40 transition-colors"
                  >
                    <div className="font-medium text-sm text-fg mb-1">{title}</div>
                    {blurb && (
                      <p className="text-xs text-fg-muted line-clamp-2">{blurb}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          {/* Open in desktop */}
          <div className="bg-canvas-subtle border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold text-fg">
              <FolderOpen size={14} className="text-accent-emphasis" />
              Open in Vibe Studio
            </div>
            <div className="px-4 py-3 text-xs text-fg-muted space-y-2">
              <p>Use the desktop app to edit features, run the AI, and preview your project locally.</p>
              <p className="text-fg-subtle">
                In Vibe Studio, choose <strong className="text-fg">Open Project</strong> and select your local{' '}
                <strong className="text-fg">{owner}/{repo}</strong> folder.
              </p>
            </div>
          </div>

          {/* Other versions (lineage) */}
          {(otherVersions.length > 0 || forkedFrom) && (
            <div className="bg-canvas-subtle border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-semibold text-fg flex items-center gap-2">
                  <GitFork size={14} className="text-fg-muted" />
                  Other versions
                </span>
                {family && (
                  <span className="text-[10px] text-fg-muted flex items-center gap-1">
                    <Star size={9} className="text-yellow-400 fill-yellow-400" />
                    {family.totalStars} total
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {/* Show root if current project is a fork */}
                {family && family.root.id !== project.id && (
                  <Link
                    href={`/${family.root.owner}/${family.root.repo}`}
                    className="block px-4 py-2.5 hover:bg-canvas-inset transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-fg font-medium flex items-center gap-1.5">
                        {family.root.owner}/{family.root.repo}
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent-subtle text-accent-emphasis rounded-full border border-accent/20">original</span>
                      </div>
                      <span className="text-[10px] text-fg-muted flex items-center gap-0.5">
                        <Star size={8} className={family.root.starCount > 0 ? 'text-yellow-400 fill-yellow-400' : ''} />
                        {family.root.starCount}
                      </span>
                    </div>
                    {family.root.compiledWith && (
                      <div className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1">
                        <Cpu size={8} />
                        {family.root.compiledWith}
                      </div>
                    )}
                  </Link>
                )}

                {/* Show variants */}
                {otherVersions.slice(0, 10).map((v) => (
                  <Link
                    key={v.id}
                    href={`/${v.owner}/${v.repo}`}
                    className="block px-4 py-2.5 hover:bg-canvas-inset transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-fg">{v.owner}/{v.repo}</div>
                      <span className="text-[10px] text-fg-muted flex items-center gap-0.5">
                        <Star size={8} className={v.starCount > 0 ? 'text-yellow-400 fill-yellow-400' : ''} />
                        {v.starCount}
                      </span>
                    </div>
                    {v.compiledWith && (
                      <div className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1">
                        <Cpu size={8} />
                        {v.compiledWith}
                      </div>
                    )}
                  </Link>
                ))}

                {otherVersions.length > 10 && (
                  <div className="px-4 py-2 text-[10px] text-fg-subtle text-center">
                    +{otherVersions.length - 10} more versions
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Version history (snapshots + compilations) */}
          {snapshotsWithCompilations.length > 0 && (
            <div className="bg-canvas-subtle border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold text-fg">
                <History size={14} className="text-fg-muted" />
                Version history
              </div>
              <div className="divide-y divide-border">
                {[...snapshotsWithCompilations].reverse().map((snap) => (
                  <div key={snap.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-fg font-medium">
                        v{snap.version}
                        {snap.forkedFromSnapshotId && (
                          <span className="ml-1.5 text-[10px] text-accent-emphasis">(forked)</span>
                        )}
                      </div>
                      <span className="text-[10px] text-fg-subtle">
                        {new Date(snap.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {snap.message && (
                      <div className="text-[10px] text-fg-muted mt-0.5 line-clamp-1">{snap.message}</div>
                    )}
                    {snap.compilations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {snap.compilations.map((c) => (
                          <span
                            key={c.id}
                            className="text-[10px] px-1.5 py-0.5 rounded-full border border-border flex items-center gap-1"
                          >
                            {c.status === 'completed' && <Check size={7} className="text-success" />}
                            {c.status === 'running' && <Loader size={7} className="text-accent-emphasis animate-spin" />}
                            {c.status === 'failed' && <X size={7} className="text-danger" />}
                            <Cpu size={7} className="text-fg-subtle" />
                            {c.model}
                          </span>
                        ))}
                      </div>
                    )}
                    {snap.compilations.length === 0 && (
                      <div className="text-[10px] text-fg-subtle mt-0.5 italic">Not yet compiled</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent updates */}
          <div className="bg-canvas-subtle border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-fg">Recent updates</span>
              <Link
                href={`/${owner}/${repo}/pulls/new`}
                className="text-xs text-accent-emphasis hover:underline flex items-center gap-1"
              >
                <Plus size={11} /> New
              </Link>
            </div>
            {recentPRs.length === 0 ? (
              <div className="px-4 py-4 text-xs text-fg-muted text-center">No updates yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {recentPRs.map((pr) => {
                  const { label, cls } = statusLabel(pr.status);
                  return (
                    <Link
                      key={pr.id}
                      href={`/${owner}/${repo}/pulls/${pr.id}`}
                      className="block px-4 py-2.5 hover:bg-canvas-inset transition-colors"
                    >
                      <div className="text-xs text-fg line-clamp-1">{pr.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}>{label}</span>
                        <span className="text-[10px] text-fg-subtle">{pr.author}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
