import React from 'react';
import Link from 'next/link';
import { Zap, Star, GitBranch, Search } from 'lucide-react';

const ALL_PROJECTS = [
  { owner: 'acme', repo: 'payments-service', desc: 'Stripe integration and billing flows', features: 12, coverage: 87, stars: 42, lang: 'TypeScript' },
  { owner: 'acme', repo: 'auth-service', desc: 'OAuth2, SAML, and session management', features: 8, coverage: 64, stars: 31, lang: 'TypeScript' },
  { owner: 'vibehub', repo: 'vibehub', desc: 'The vibe-first Git forge itself', features: 6, coverage: 42, stars: 128, lang: 'TypeScript' },
  { owner: 'acme', repo: 'data-pipeline', desc: 'ETL pipeline for analytics ingestion', features: 5, coverage: 30, stars: 14, lang: 'Python' },
  { owner: 'oss', repo: 'cli-toolkit', desc: 'Cross-platform CLI scaffolding library', features: 9, coverage: 71, stars: 87, lang: 'Go' },
  { owner: 'oss', repo: 'rust-cache', desc: 'High-performance in-memory cache', features: 4, coverage: 95, stars: 203, lang: 'Rust' },
];

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-fg">Explore Vibe Projects</h1>
          <p className="text-sm text-fg-muted mt-0.5">Browse projects where features lead, code follows.</p>
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
          placeholder="Search projects, features, decisions…"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-fg-subtle"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 text-sm border-b border-border mb-6">
        {['All', 'TypeScript', 'Python', 'Go', 'Rust'].map((tab, i) => (
          <button
            key={tab}
            className={`px-3 py-2 border-b-2 transition-colors ${
              i === 0
                ? 'border-accent text-fg font-medium'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Project grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_PROJECTS.map((p) => (
          <Link
            key={`${p.owner}/${p.repo}`}
            href={`/${p.owner}/${p.repo}`}
            className="block bg-canvas-subtle border border-border rounded-lg p-4 hover:border-accent/50 transition-colors group"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-xs text-fg-muted">{p.owner} /</div>
                <div className="font-semibold text-fg group-hover:text-accent-emphasis transition-colors">{p.repo}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-fg-muted">
                <Star size={11} /> {p.stars}
              </div>
            </div>

            <p className="text-sm text-fg-muted mb-4 line-clamp-2">{p.desc}</p>

            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Zap size={10} className="text-accent-emphasis" />
                  {p.features} features
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch size={10} />
                  {p.lang}
                </span>
              </div>
              <CoverageBadge coverage={p.coverage} />
            </div>

            {/* Coverage bar */}
            <div className="mt-3 h-1 bg-canvas-inset rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${p.coverage >= 80 ? 'bg-success' : p.coverage >= 50 ? 'bg-attention' : 'bg-danger'}`}
                style={{ width: `${p.coverage}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CoverageBadge({ coverage }: { coverage: number }) {
  const cls = coverage >= 80 ? 'text-success' : coverage >= 50 ? 'text-attention' : 'text-danger';
  return <span className={`font-mono ${cls}`}>{coverage}% vibed</span>;
}
