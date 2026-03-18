import React from 'react';
import Link from 'next/link';
import { Zap, GitFork, Search, Star, Cpu } from 'lucide-react';
import { getStore } from '@/lib/data/store';

export default async function ExplorePage() {
  const projects = await getStore().listProjects();

  // Only show public projects, sorted by stars then recency
  const visible = projects
    .filter((p) => p.visibility === 'public')
    .sort((a, b) => b.starCount - a.starCount || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-fg">Explore Tools</h1>
          <p className="text-sm text-fg-muted mt-0.5">Discover, fork, and improve tools built with VibeHub.</p>
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
          placeholder="Search tools..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-fg-subtle"
        />
      </div>

      {/* Project grid */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
          <div className="text-5xl opacity-20">{'\u25C8'}</div>
          <p className="text-sm text-fg-muted">No tools yet.</p>
          <Link href="/new" className="text-xs text-accent-emphasis hover:underline">
            Create your first project {'\u2192'}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
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
              <div className="flex items-center gap-3 text-xs text-fg-subtle">
                <span className="flex items-center gap-1">
                  <Star size={10} className={p.starCount > 0 ? 'text-yellow-400 fill-yellow-400' : ''} />
                  {p.starCount}
                </span>
                {p.forkCount > 0 && (
                  <span className="flex items-center gap-1">
                    <GitFork size={10} />
                    {p.forkCount}
                  </span>
                )}
                {p.compiledWith && (
                  <span className="flex items-center gap-1">
                    <Cpu size={9} />
                    {p.compiledWith}
                  </span>
                )}
                {p.forkedFromId && (
                  <span className="flex items-center gap-1">
                    <GitFork size={9} className="text-accent-emphasis" />
                    fork
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
