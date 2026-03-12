import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest } from 'lucide-react';
import { getStore } from '@/lib/data/store';

interface Props {
  params: { owner: string; repo: string };
}

export default async function PullRequestsPage({ params }: Props) {
  const { owner, repo } = params;
  const store = getStore();

  const project = await store.getProject(owner, repo);
  if (!project) notFound();

  const prs = await store.listPRs(project.id);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-fg-muted mb-1">
            <Link href={`/${owner}/${repo}`} className="hover:text-fg">{owner}/{repo}</Link>
            {' / '}
            <span className="text-fg">Updates</span>
          </div>
          <h1 className="font-semibold text-fg">Updates</h1>
        </div>
        <Link
          href={`/${owner}/${repo}/pulls/new`}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
        >
          Describe an update
        </Link>
      </div>

      {prs.length === 0 ? (
        <div className="border border-border rounded-lg px-6 py-12 text-center">
          <GitPullRequest size={32} className="text-fg-subtle mx-auto mb-3" />
          <p className="text-sm text-fg-muted mb-1">No updates yet.</p>
          <p className="text-xs text-fg-subtle">
            Describe a change to your project to get started.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {prs.map((pr, i) => (
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
                  by {pr.author}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-fg-muted shrink-0">
                <span className={`px-1.5 py-0.5 rounded-full border text-xs ${
                  pr.status === 'open'
                    ? 'border-success/30 text-success bg-success/10'
                    : pr.status === 'merged'
                    ? 'border-accent/30 text-accent-emphasis bg-accent-subtle'
                    : 'border-border text-fg-muted'
                }`}>
                  {pr.status === 'open' ? 'In review' : pr.status === 'merged' ? 'Applied' : pr.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
