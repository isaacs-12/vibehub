import React from 'react';
import { GitPullRequest, MessageSquare, CheckCircle2, Code2 } from 'lucide-react';
import IntentDiff from '@/components/VibePR/IntentDiff';
import ImplementationProofs from '@/components/VibePR/ImplementationProofs';
import ReviewThread from '@/components/VibePR/ReviewThread';

interface Props {
  params: { owner: string; repo: string; id: string };
}

export default function VibePRPage({ params }: Props) {
  const { owner, repo, id } = params;
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-fg mb-1">
          Add Google Login to Auth vibe
          <span className="ml-2 text-fg-muted font-normal text-sm">#{id}</span>
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-success/10 text-success border border-success/30 px-2.5 py-0.5 rounded-full text-xs font-medium">
            <GitPullRequest size={11} />
            Open
          </span>
          <span className="text-fg-muted">alice wants to merge 3 decisions into <code className="bg-canvas-subtle px-1 rounded">main</code></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6 text-sm">
        {['Intent Diff', 'Implementation Proofs', 'Discussion'].map((tab, i) => (
          <button
            key={tab}
            className={`px-4 py-2 border-b-2 transition-colors ${
              i === 0
                ? 'border-accent text-fg font-medium'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {tab === 'Intent Diff' && <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} />{tab}</span>}
            {tab === 'Implementation Proofs' && <span className="inline-flex items-center gap-1.5"><Code2 size={12} />{tab}</span>}
            {tab === 'Discussion' && <span className="inline-flex items-center gap-1.5"><MessageSquare size={12} />{tab}</span>}
          </button>
        ))}
      </div>

      {/* Primary: Intent Diff */}
      <IntentDiff />

      {/* Secondary: Implementation Proofs */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-sm text-fg-muted mb-3">
          <Code2 size={14} />
          <span>Implementation Proofs</span>
          <span className="bg-canvas-subtle border border-border text-xs px-1.5 py-0.5 rounded ml-1">AI-generated</span>
        </div>
        <ImplementationProofs />
      </div>

      {/* Discussion */}
      <div className="mt-8">
        <ReviewThread />
      </div>
    </div>
  );
}
