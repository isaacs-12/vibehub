import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitPullRequest, GitMerge, Code2 } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import { auth } from '@/lib/auth';
import IntentDiff from '@/components/VibePR/IntentDiff';
import ImplementationProofs from '@/components/VibePR/ImplementationProofs';
import ReviewThread from '@/components/VibePR/ReviewThread';
import MergeButton from '@/components/VibePR/MergeButton';
import CompileProgress from '@/components/VibePR/CompileProgress';

interface Props {
  params: { owner: string; repo: string; id: string };
}

export default async function VibePRPage({ params }: Props) {
  const { owner, repo, id } = params;
  const store = getStore();

  const project = await store.getProject(owner, repo);
  if (!project) notFound();

  const session = await auth();
  const isOwner = (session as any)?.handle === owner;

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
        {pr.status === 'open' && isOwner && (
          <MergeButton prId={pr.id} headBranch={pr.headBranch} />
        )}
        {pr.status === 'merged' && (
          <div className="text-xs text-fg-muted bg-accent-subtle border border-accent/30 rounded-lg px-3 py-2">
            <div className="font-medium text-accent-emphasis">Applied</div>
          </div>
        )}
      </div>

      {/* Intent Diff — semantic view by default, content diff toggle */}
      <IntentDiff
        prId={pr.id}
        baseFeatures={pr.intentDiff?.baseFeatures ?? []}
        headFeatures={pr.intentDiff?.headFeatures ?? []}
        cachedSemanticDiff={pr.intentDiff?.semanticDiff ?? null}
      />

      {/* Implementation Proofs */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-sm text-fg-muted mb-3">
          <Code2 size={14} />
          <span>Generated code</span>
          <span className="bg-canvas-subtle border border-border text-xs px-1.5 py-0.5 rounded ml-1">AI-generated</span>
        </div>
        {compileJob && (
          <div className="mb-4">
            <CompileProgress jobId={compileJob.id} initialStatus={compileJob.status} />
          </div>
        )}
        <ImplementationProofs implementationProofs={pr.intentDiff?.implementationProofs ?? []} />
      </div>

      {/* Discussion — pass real comments */}
      <div className="mt-8">
        <ReviewThread prId={pr.id} initialComments={comments} />
      </div>
    </div>
  );
}
