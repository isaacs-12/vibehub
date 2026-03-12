import React from 'react';
import Link from 'next/link';
import { Zap, GitBranch, Search } from 'lucide-react';
import { getStore } from '@/lib/data/store';

export default async function ExplorePage() {
  const projects = await getStore().listProjects();

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-fg">Explore Projects</h1>
          <p className="text-sm text-fg-muted mt-0.5">Browse projects built with VibeHub.</p>
        </div>
        <Link
          href="/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
        >
          <Zap size={13} />
          New Project
        </Link>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 bg-canvas-subtle border border-border rounded-md px-3 py-2 mb-6 max-w-md">
        <Search size={14} className="text-fg-muted shrink-0" />
        <input
          placeholder="Search projects…"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-fg-subtle"
        />
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="text-5xl opacity-20">◈</div>
          <p className="text-sm text-fg-muted">No projects yet.</p>
          <Link href="/new" className="text-xs text-accent-emphasis hover:underline">
            Create your first project →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/${p.owner}/${p.repo}`}
              className="block bg-canvas-subtle border border-border rounded-lg p-4 hover:border-accent/50 transition-colors group"
            >
              <div className="mb-2">
                <div className="text-xs text-fg-muted">{p.owner} /</div>
                <div className="font-semibold text-fg group-hover:text-accent-emphasis transition-colors">{p.repo}</div>
              </div>
              {p.description && (
                <p className="text-sm text-fg-muted mb-3 line-clamp-2">{p.description}</p>
              )}
              <div className="text-xs text-fg-subtle flex items-center gap-1">
                <GitBranch size={10} />
                {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
