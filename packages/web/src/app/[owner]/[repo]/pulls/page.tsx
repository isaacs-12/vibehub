import React from 'react';
import Link from 'next/link';
import { GitPullRequest, MessageSquare, Zap } from 'lucide-react';

interface Props {
  params: { owner: string; repo: string };
}

const DEMO_PRS = [
  { id: '42', title: 'Add Google Login to Auth vibe', author: 'alice', decisionsChanged: 3, openedAt: '2h ago', status: 'open' },
  { id: '41', title: 'Refactor billing to support multi-currency', author: 'bob', decisionsChanged: 7, openedAt: '1d ago', status: 'open' },
  { id: '40', title: 'Add rate limiting requirement to API vibe', author: 'carol', decisionsChanged: 1, openedAt: '5d ago', status: 'merged' },
];

export default function PullRequestsPage({ params }: Props) {
  const { owner, repo } = params;
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-semibold text-fg">Vibe Pull Requests</h1>
        <Link
          href={`/${owner}/${repo}/pulls/new`}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
        >
          New Vibe PR
        </Link>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {DEMO_PRS.map((pr, i) => (
          <Link
            key={pr.id}
            href={`/${owner}/${repo}/pulls/${pr.id}`}
            className={`flex items-start gap-3 px-4 py-3 hover:bg-canvas-subtle transition-colors ${
              i !== 0 ? 'border-t border-border' : ''
            }`}
          >
            <GitPullRequest
              size={16}
              className={`mt-0.5 shrink-0 ${pr.status === 'merged' ? 'text-accent-emphasis' : 'text-success'}`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-fg hover:text-accent-emphasis">{pr.title}</div>
              <div className="text-xs text-fg-muted mt-0.5">
                #{pr.id} opened {pr.openedAt} by {pr.author}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-fg-muted shrink-0">
              <span className="flex items-center gap-1">
                <Zap size={11} className="text-accent-emphasis" />
                {pr.decisionsChanged} decisions changed
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={11} />3
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
