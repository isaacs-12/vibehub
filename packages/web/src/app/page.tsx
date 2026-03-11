import React from 'react';
import Link from 'next/link';
import { GitBranch, Zap, ArrowRight, Star } from 'lucide-react';

const DEMO_PROJECTS = [
  { owner: 'acme', repo: 'payments-service', desc: 'Stripe integration and billing flows', features: 12, coverage: 87, stars: 42 },
  { owner: 'acme', repo: 'auth-service', desc: 'OAuth2, SAML, and session management', features: 8, coverage: 64, stars: 31 },
  { owner: 'vibehub', repo: 'vibehub', desc: 'The vibe-first Git forge itself', features: 6, coverage: 42, stars: 128 },
];

export default function HomePage() {
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

      {/* Projects */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-semibold text-fg">Recent Projects</h2>
        <Link href="/explore" className="text-xs text-accent-emphasis hover:underline flex items-center gap-1">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {DEMO_PROJECTS.map((p) => (
          <ProjectCard key={`${p.owner}/${p.repo}`} {...p} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ owner, repo, desc, features, coverage, stars }: typeof DEMO_PROJECTS[number]) {
  return (
    <Link
      href={`/${owner}/${repo}`}
      className="block bg-canvas-subtle border border-border rounded-lg p-4 hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs text-fg-muted">{owner} /</div>
          <div className="font-semibold text-fg group-hover:text-accent-emphasis transition-colors">{repo}</div>
        </div>
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          <Star size={11} />
          {stars}
        </div>
      </div>
      <p className="text-sm text-fg-muted mb-3 line-clamp-2">{desc}</p>
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <span className="flex items-center gap-1"><Zap size={10} className="text-accent-emphasis" />{features} features</span>
        <VibeCoverageBadge coverage={coverage} />
      </div>
    </Link>
  );
}

function VibeCoverageBadge({ coverage }: { coverage: number }) {
  const color = coverage >= 80 ? 'text-success' : coverage >= 50 ? 'text-attention' : 'text-danger';
  return <span className={`font-mono ${color}`}>{coverage}% vibed</span>;
}
