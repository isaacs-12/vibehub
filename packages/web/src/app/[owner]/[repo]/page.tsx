import React from 'react';
import Link from 'next/link';
import { GitBranch, GitPullRequest, Settings, Zap } from 'lucide-react';
import FeatureMap from '@/components/FeatureMap/FeatureMap';
import VibeCoverage from '@/components/VibeCoverage/VibeCoverage';

interface Props {
  params: { owner: string; repo: string };
}

// Demo data — replace with DB queries via getProjectData(owner, repo)
const DEMO_FEATURES = [
  { id: 'auth', label: 'Authentication', children: [
    { id: 'oauth', label: 'OAuth2 / SSO', children: [] },
    { id: 'session', label: 'Session Mgmt', children: [] },
  ]},
  { id: 'billing', label: 'Billing', children: [
    { id: 'stripe', label: 'Stripe Integration', children: [] },
    { id: 'invoices', label: 'Invoices', children: [] },
  ]},
  { id: 'api', label: 'Public API', children: [
    { id: 'rest', label: 'REST Endpoints', children: [] },
    { id: 'webhooks', label: 'Webhooks', children: [] },
  ]},
  { id: 'infra', label: 'Infrastructure', children: [] },
];

export default function ProjectDashboard({ params }: Props) {
  const { owner, repo } = params;

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
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <GitBranch size={12} />
            <span>main</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${owner}/${repo}/pulls`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-canvas-subtle transition-colors"
          >
            <GitPullRequest size={14} />
            Vibe PRs
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
            <span className="text-xs text-fg-muted">{DEMO_FEATURES.length} top-level features</span>
          </div>
          <div className="h-96">
            <FeatureMap features={DEMO_FEATURES} />
          </div>
        </div>

        {/* Stats sidebar (1/3) */}
        <div className="space-y-4">
          <VibeCoverage coverage={64} totalFiles={120} mappedFiles={77} />
          <RecentActivity owner={owner} repo={repo} />
        </div>
      </div>
    </div>
  );
}

function RecentActivity({ owner, repo }: { owner: string; repo: string }) {
  const activity = [
    { type: 'vibe_pr', title: 'Add Google Login to Auth vibe', time: '2h ago', id: '42' },
    { type: 'import', title: 'Imported 8 features from git history', time: '1d ago', id: '41' },
    { type: 'vibe_pr', title: 'Refactor billing to support multi-currency', time: '3d ago', id: '40' },
  ];
  return (
    <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-sm font-semibold text-fg">Recent Activity</div>
      <div className="divide-y divide-border">
        {activity.map((a) => (
          <Link key={a.id} href={`/${owner}/${repo}/pulls/${a.id}`} className="block px-4 py-2.5 hover:bg-canvas-inset transition-colors">
            <div className="text-xs text-fg line-clamp-1">{a.title}</div>
            <div className="text-xs text-fg-muted mt-0.5">{a.time}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
