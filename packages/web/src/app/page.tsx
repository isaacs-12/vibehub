import React from 'react';
import Link from 'next/link';
import { Zap, ArrowRight } from 'lucide-react';
import { getStore } from '@/lib/data/store';

export default async function HomePage() {
  const projects = await getStore().listProjects();
  const recentProjects = projects.slice(0, 3);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 bg-accent-subtle border border-accent/30 text-accent-emphasis text-xs px-3 py-1 rounded-full mb-4">
          <Zap size={11} />
          Vibe-First Development
        </div>
        <h1 className="text-4xl font-bold text-fg mb-3">
          Where Features Lead,<br />Code Follows.
        </h1>
        <p className="text-lg text-fg-muted max-w-xl mx-auto">
          VibeForge replaces file browsers with Feature Maps. Review intent, not syntax. Ship decisions, not diffs.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Link href="/new" className="px-5 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/80 transition-colors">
            New Vibe Project
          </Link>
          <Link href="/explore" className="px-5 py-2 border border-border text-fg-muted rounded-md text-sm hover:border-fg/30 hover:text-fg transition-colors">
            Explore Projects
          </Link>
        </div>
      </div>

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-semibold text-fg">Recent Projects</h2>
            <Link href="/explore" className="text-xs text-accent-emphasis hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentProjects.map((p) => (
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
                  <p className="text-sm text-fg-muted line-clamp-2">{p.description}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
