import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, Settings, Plus, FolderOpen } from 'lucide-react';
import { getStore } from '@/lib/data/store';

interface Props {
  params: { owner: string; repo: string };
}

/** Extract a human-readable title and blurb from a feature's markdown content. */
function featureInfo(name: string, content: string): { title: string; blurb: string } {
  const lines = content.split('\n');

  // Title: first # heading, or humanize the slug
  let title = name.replace(/-/g, ' ');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) { title = m[1]; break; }
  }

  // Blurb: first non-empty, non-heading line after the first heading
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

  const [features, prs] = await Promise.all([
    store.listFeatures(project.id),
    store.listPRs(project.id),
  ]);

  const recentPRs = prs.slice(0, 5);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {project.description
              ? project.description.replace(/^\[.*?\]\s*/, '')
              : `${owner}/${repo}`}
          </h1>
          {project.description && (
            <div className="text-xs text-fg-subtle font-mono mt-0.5">{owner}/{repo}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Link
            href={`/${owner}/${repo}/settings`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
          >
            <Settings size={14} />
            Settings
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Feature cards (2/3) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-fg">Your project</h2>
            <Link
              href={`/${owner}/${repo}/pulls/new`}
              className="flex items-center gap-1 text-xs text-accent-emphasis hover:underline"
            >
              <Plus size={11} /> Describe a change
            </Link>
          </div>

          {features.length === 0 ? (
            <div className="border border-border rounded-xl flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="text-5xl opacity-20">◈</div>
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
