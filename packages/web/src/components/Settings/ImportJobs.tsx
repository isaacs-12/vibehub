'use client';

import React, { useState } from 'react';
import { GitBranch, Loader2, CheckCircle2, XCircle, Play } from 'lucide-react';

interface ImportJob {
  id: string;
  repoUrl: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  featuresExtracted: number;
  startedAt: string;
}

const DEMO_JOBS: ImportJob[] = [
  { id: '1', repoUrl: 'github.com/acme/legacy-monolith', status: 'done', featuresExtracted: 14, startedAt: '2d ago' },
  { id: '2', repoUrl: 'github.com/acme/payment-service', status: 'running', featuresExtracted: 0, startedAt: '5m ago' },
];

export default function ImportJobs({ owner, repo }: { owner: string; repo: string }) {
  const [jobs, setJobs] = useState<ImportJob[]>(DEMO_JOBS);
  const [newUrl, setNewUrl] = useState('');

  function startJob() {
    if (!newUrl.trim()) return;
    const job: ImportJob = {
      id: crypto.randomUUID(),
      repoUrl: newUrl.trim(),
      status: 'pending',
      featuresExtracted: 0,
      startedAt: 'just now',
    };
    setJobs((prev) => [job, ...prev]);
    setNewUrl('');
    // In production: POST /api/import-jobs
  }

  return (
    <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-fg text-sm">
          <GitBranch size={14} />
          Self-Hosting Import Jobs
        </div>
        <p className="text-xs text-fg-muted mt-1">
          Translate legacy Git repositories into Vibe projects using the Extraction Engine.
        </p>
      </div>

      {/* New job form */}
      <div className="p-5 border-b border-border">
        <label className="block text-xs text-fg-muted mb-1.5">Import a Git repository</label>
        <div className="flex gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className="flex-1 bg-canvas border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
          />
          <button
            onClick={startJob}
            disabled={!newUrl.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            <Play size={12} />
            Start
          </button>
        </div>
      </div>

      {/* Job list */}
      <div className="divide-y divide-border">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center gap-3 px-5 py-3">
            <StatusIcon status={job.status} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-fg truncate">{job.repoUrl}</div>
              <div className="text-xs text-fg-muted">Started {job.startedAt}</div>
            </div>
            {job.status === 'done' && (
              <span className="text-xs text-success">{job.featuresExtracted} features extracted</span>
            )}
            {job.status === 'running' && (
              <span className="text-xs text-attention">Running…</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: ImportJob['status'] }) {
  if (status === 'done') return <CheckCircle2 size={15} className="text-success shrink-0" />;
  if (status === 'failed') return <XCircle size={15} className="text-danger shrink-0" />;
  if (status === 'running') return <Loader2 size={15} className="text-attention animate-spin shrink-0" />;
  return <div className="w-3.5 h-3.5 rounded-full border-2 border-fg-subtle shrink-0" />;
}
