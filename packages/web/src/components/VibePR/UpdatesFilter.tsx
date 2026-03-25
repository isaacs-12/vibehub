'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { GitPullRequest, GitMerge, Ban } from 'lucide-react';

type Status = 'open' | 'merged' | 'closed';

interface VibePR {
  id: string;
  title: string;
  author: string;
  status: Status;
}

interface Props {
  prs: VibePR[];
  owner: string;
  repo: string;
}

const tabs: { key: Status | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'merged', label: 'Applied' },
  { key: 'closed', label: 'Closed' },
];

export default function UpdatesFilter({ prs, owner, repo }: Props) {
  const [filter, setFilter] = useState<Status | 'all'>('open');

  const counts = {
    all: prs.length,
    open: prs.filter((p) => p.status === 'open').length,
    merged: prs.filter((p) => p.status === 'merged').length,
    closed: prs.filter((p) => p.status === 'closed').length,
  };

  const filtered = filter === 'all' ? prs : prs.filter((p) => p.status === filter);

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border border-border rounded-lg p-1 bg-canvas-subtle w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === key
                ? 'bg-canvas-default text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className="ml-1.5 text-fg-subtle">{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* PR list */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-lg px-6 py-8 text-center">
          <p className="text-sm text-fg-muted">
            {filter === 'all' ? 'No updates yet.' : `No ${filter} updates.`}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {filtered.map((pr, i) => (
            <Link
              key={pr.id}
              href={`/${owner}/${repo}/pulls/${pr.id}`}
              className={`flex items-start gap-3 px-4 py-3 hover:bg-canvas-subtle transition-colors ${
                i !== 0 ? 'border-t border-border' : ''
              }`}
            >
              {pr.status === 'merged' ? (
                <GitMerge size={16} className="mt-0.5 shrink-0 text-accent-emphasis" />
              ) : pr.status === 'closed' ? (
                <Ban size={16} className="mt-0.5 shrink-0 text-red-400" />
              ) : (
                <GitPullRequest size={16} className="mt-0.5 shrink-0 text-success" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-fg hover:text-accent-emphasis">{pr.title}</div>
                <div className="text-xs text-fg-muted mt-0.5">
                  by {pr.author}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-fg-muted shrink-0">
                <span className={`px-1.5 py-0.5 rounded-full border text-xs ${
                  pr.status === 'open'
                    ? 'border-success/30 text-success bg-success/10'
                    : pr.status === 'merged'
                    ? 'border-accent/30 text-accent-emphasis bg-accent-subtle'
                    : 'border-red-400/30 text-red-400 bg-red-500/10'
                }`}>
                  {pr.status === 'open' ? 'In review' : pr.status === 'merged' ? 'Applied' : 'Closed'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
