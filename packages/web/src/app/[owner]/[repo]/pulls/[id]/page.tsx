import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, GitMerge, MessageSquare, CheckCircle2, Code2, Loader2, XCircle } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import IntentDiff from '@/components/VibePR/IntentDiff';
import ImplementationProofs from '@/components/VibePR/ImplementationProofs';
import ReviewThread from '@/components/VibePR/ReviewThread';
import MergeButton from '@/components/VibePR/MergeButton';

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
  const compileJob = await store.getCompileJobForPR(pr.id);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="text-sm text-fg-muted mb-4">
        <Link href={`/${owner}/${repo}` as any} className="hover:text-fg">{owner}/{repo}</Link>
        {' / '}
        <Link href={`/${owner}/${repo}/pulls` as any} className="hover:text-fg">Updates</Link>
        {' / '}
        <span className="text-fg">#{id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg mb-2">{pr.title}</h1>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 rounded-full text-xs font-medium ${
              pr.status === 'open'
                ? 'bg-success/10 text-success border-success/30'
                : pr.status === 'merged'
                ? 'bg-accent-subtle text-accent-emphasis border-accent/30'
                : 'bg-canvas-subtle text-fg-muted border-border'
            }`}>
              {pr.status === 'merged' ? <GitMerge size={11} /> : <GitPullRequest size={11} />}
              {pr.status}
            </span>
            <span className="text-fg-muted">
              proposed by <strong className="text-fg">{pr.author}</strong>
            </span>
          </div>
        </div>
        {pr.status === 'open' && (
          <MergeButton prId={pr.id} headBranch={pr.headBranch} />
        )}
        {pr.status === 'merged' && (
          <div className="text-xs text-fg-muted bg-accent-subtle border border-accent/30 rounded-lg px-3 py-2">
            <div className="font-medium text-accent-emphasis">Applied</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6 text-sm">
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-accent text-fg font-medium">
          <CheckCircle2 size={12} />
          What changed
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-transparent text-fg-muted">
          <Code2 size={12} />
          Generated code
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2 border-b-2 border-transparent text-fg-muted">
          <MessageSquare size={12} />
          Discussion
          {comments.length > 0 && (
            <span className="ml-1 bg-canvas-subtle border border-border rounded-full px-1.5 text-xs">{comments.length}</span>
          )}
        </div>
      </div>

      {/* Intent Diff — head branch vibe files from push */}
      <IntentDiff headFeatures={pr.intentDiff?.headFeatures ?? []} />

      {/* Implementation Proofs */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-sm text-fg-muted mb-3">
          <Code2 size={14} />
          <span>Generated code</span>
          <span className="bg-canvas-subtle border border-border text-xs px-1.5 py-0.5 rounded ml-1">AI-generated</span>
          {compileJob && compileJob.status === 'pending' && (
            <span className="flex items-center gap-1 text-xs text-fg-muted ml-2">
              <Loader2 size={11} className="animate-spin" /> Queued for cloud compile
            </span>
          )}
          {compileJob && compileJob.status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-accent-emphasis ml-2">
              <Loader2 size={11} className="animate-spin" /> Compiling…
            </span>
          )}
          {compileJob && compileJob.status === 'failed' && (
            <span className="flex items-center gap-1 text-xs text-red-400 ml-2">
              <XCircle size={11} /> Compile failed: {compileJob.error}
            </span>
          )}
        </div>
        <ImplementationProofs implementationProofs={pr.intentDiff?.implementationProofs ?? []} />
      </div>

      {/* Discussion — pass real comments */}
      <div className="mt-8">
        <ReviewThread prId={pr.id} initialComments={comments} />
      </div>
    </div>
  );
}
