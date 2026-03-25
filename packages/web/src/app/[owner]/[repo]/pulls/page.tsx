import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import UpdatesFilter from '@/components/VibePR/UpdatesFilter';

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
            <Link href={`/${owner}/${repo}` as any} className="hover:text-fg">{owner}/{repo}</Link>
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
        <UpdatesFilter prs={prs} owner={owner} repo={repo} />
      )}
    </div>
  );
}
