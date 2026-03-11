import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, MessageSquare, CheckCircle2, Code2, Zap } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import IntentDiff from '@/components/VibePR/IntentDiff';
import ImplementationProofs from '@/components/VibePR/ImplementationProofs';
import ReviewThread from '@/components/VibePR/ReviewThread';

interface Props {
  params: { owner: string; repo: string; id: string };
}

export default async function VibePRPage({ params }: Props) {
  const { owner, repo, id } = params;
  const store = getStore();

  const project = await store.getProject(owner, repo);
  if (!project) notFound();

  const pr = await store.getPR(id);
  if (!pr || pr.projectId !== project.id) notFound();

  const comments = await store.listComments(pr.id);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="text-sm text-fg-muted mb-4">
        <Link href={`/${owner}/${repo}`} className="hover:text-fg">{owner}/{repo}</Link>
        {' / '}
        <Link href={`/${owner}/${repo}/pulls`} className="hover:text-fg">Pull Requests</Link>
        {' / '}
        <span className="text-fg">#{id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-fg mb-2">{pr.title}</h1>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 rounded-full text-xs font-medium ${
            pr.status === 'open'
              ? 'bg-success/10 text-success border-success/30'
              : pr.status === 'merged'
              ? 'bg-accent-subtle text-accent-emphasis border-accent/30'
              : 'bg-canvas-subtle text-fg-muted border-border'
          }`}>
            <GitPullRequest size={11} />
            {pr.status}
          </span>
          <span className="text-fg-muted">
            {pr.author} wants to merge into{' '}
            <code className="bg-canvas-subtle px-1 rounded">main</code>
            {' '}from{' '}
            <code className="bg-canvas-subtle px-1 rounded">{pr.headBranch}</code>
          </span>
          {pr.decisionsChanged > 0 && (
            <span className="flex items-center gap-1 text-fg-muted">
              <Zap size={12} className="text-accent-emphasis" />
              {pr.decisionsChanged} decision{pr.decisionsChanged !== 1 ? 's' : ''} changed
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6 text-sm">
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-accent text-fg font-medium">
          <CheckCircle2 size={12} />
          Intent Diff
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-transparent text-fg-muted">
          <Code2 size={12} />
          Implementation Proofs
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-transparent text-fg-muted">
          <MessageSquare size={12} />
          Discussion
          {comments.length > 0 && (
            <span className="ml-1 bg-canvas-subtle border border-border rounded-full px-1.5 text-xs">{comments.length}</span>
          )}
        </div>
      </div>

      {/* Intent Diff */}
      <IntentDiff />

      {/* Implementation Proofs */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-sm text-fg-muted mb-3">
          <Code2 size={14} />
          <span>Implementation Proofs</span>
          <span className="bg-canvas-subtle border border-border text-xs px-1.5 py-0.5 rounded ml-1">AI-generated</span>
        </div>
        <ImplementationProofs />
      </div>

      {/* Discussion — pass real comments */}
      <div className="mt-8">
        <ReviewThread prId={pr.id} initialComments={comments} />
      </div>
    </div>
  );
}
