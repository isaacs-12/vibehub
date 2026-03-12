import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, Settings, Zap, Plus, FolderOpen } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import FeatureMap from '@/components/FeatureMap/FeatureMap';
import type { FeatureNode } from '@/components/FeatureMap/FeatureMap';

interface Props {
  params: { owner: string; repo: string };
}

export default async function ProjectDashboard({ params }: Props) {
  const { owner, repo } = params;
  const store = getStore();

  const project = await store.getProject(owner, repo);
  if (!project) notFound();

  const [features, prs] = await Promise.all([
    store.listFeatures(project.id),
    store.listPRs(project.id),
  ]);

  // Map flat features to the tree shape FeatureMap expects
  const featureNodes: FeatureNode[] = features.map((f) => ({
    id: f.id,
    label: f.name,
    children: [],
  }));

  const recentPRs = prs.slice(0, 5);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Repo header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-fg-muted mb-1">
            <Link href="/" className="hover:text-fg">{owner}</Link>
            <span className="mx-1">/</span>
            <span className="text-fg font-semibold">{repo}</span>
          </div>
          {project.description && (
            <p className="text-sm text-fg-muted">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${owner}/${repo}/pulls`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
          >
            <GitPullRequest size={14} />
            Changes
            {prs.length > 0 && (
              <span className="ml-1 bg-canvas text-fg-muted border border-border rounded-full px-1.5 text-xs">
                {prs.filter((p) => p.status === 'open').length}
              </span>
            )}
          </Link>
          <Link
            href={`/${owner}/${repo}/settings`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
          >
            <Settings size={14} />
            Settings
          </Link>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Feature Map (2/3) */}
        <div className="lg:col-span-2 bg-canvas-subtle border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-fg">
              <Zap size={14} className="text-accent-emphasis" />
              Feature Map
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">{featureNodes.length} features</span>
            </div>
          </div>

          {featureNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3 p-6">
              <div className="text-5xl opacity-20">◈</div>
              <p className="text-sm text-fg-muted">Nothing here yet.</p>
              <p className="text-xs text-fg-subtle max-w-xs">
                Describe what you want to build — open a Change to get started.
              </p>
              <Link
                href={`/${owner}/${repo}/pulls/new`}
                className="text-xs text-accent-emphasis hover:underline"
              >
                + Describe a change
              </Link>
            </div>
          ) : (
            <div className="h-96">
              <FeatureMap features={featureNodes} />
            </div>
          )}
        </div>

        {/* Stats sidebar (1/3) */}
        <div className="space-y-4">
          {/* Open locally */}
          <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold text-fg">
              <FolderOpen size={14} className="text-accent-emphasis" />
              Open in Vibe Studio
            </div>
            <div className="px-4 py-3 text-xs text-fg-muted space-y-2">
              <p>Use the desktop app to edit features, run the AI, and preview your project locally.</p>
              <p className="text-fg-subtle">In Vibe Studio, choose <strong className="text-fg">Open Project</strong> and select your local <strong className="text-fg">{owner}/{repo}</strong> folder.</p>
            </div>
          </div>

          {/* Recent Changes */}
          <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-fg">Recent Changes</span>
              <Link
                href={`/${owner}/${repo}/pulls/new`}
                className="text-xs text-accent-emphasis hover:underline flex items-center gap-1"
              >
                <Plus size={11} /> New
              </Link>
            </div>
            {recentPRs.length === 0 ? (
              <div className="px-4 py-4 text-xs text-fg-muted text-center">No changes yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {recentPRs.map((pr) => (
                  <Link
                    key={pr.id}
                    href={`/${owner}/${repo}/pulls/${pr.id}`}
                    className="block px-4 py-2.5 hover:bg-canvas-inset transition-colors"
                  >
                    <div className="text-xs text-fg line-clamp-1">{pr.title}</div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      #{pr.id.slice(0, 8)} · {pr.author} · {pr.status}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
