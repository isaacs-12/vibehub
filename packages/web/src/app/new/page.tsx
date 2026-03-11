'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, GitBranch, FolderPlus, Loader2 } from 'lucide-react';

type Mode = 'blank' | 'import';

export default function NewProjectPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('blank');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!owner.trim() || !repo.trim()) {
      setError('Owner and repository name are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          description: description.trim(),
          importUrl: mode === 'import' ? repoUrl.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      router.push(`/${owner.trim()}/${repo.trim()}`);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg mb-1">Create a new Vibe Project</h1>
        <p className="text-sm text-fg-muted">
          Start from a blank slate or import an existing Git repository — the Extraction Engine will read the code history and generate your initial Vibes.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-8">
        <ModeButton
          active={mode === 'blank'}
          icon={<FolderPlus size={15} />}
          label="Blank project"
          description="Start fresh with an empty .vibe/ directory"
          onClick={() => setMode('blank')}
        />
        <ModeButton
          active={mode === 'import'}
          icon={<GitBranch size={15} />}
          label="Import existing repo"
          description="Extract Vibes from a Git repository via Gemini"
          onClick={() => setMode('import')}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Owner / Repo */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1.5">Owner</label>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="acme"
              required
              className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
            />
          </div>
          <span className="text-fg-muted pb-2.5 text-lg">/</span>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1.5">Repository name</label>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="payments-service"
              required
              className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">Description <span className="text-fg-subtle">(optional)</span></label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this project do?"
            className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
          />
        </div>

        {/* Import URL (only in import mode) */}
        {mode === 'import' && (
          <div className="border border-border rounded-lg p-4 bg-canvas-subtle space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <GitBranch size={14} className="text-accent-emphasis" />
              Git Repository to Import
            </div>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo  or  /local/path/to/repo"
              className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle font-mono"
            />
            <p className="text-xs text-fg-muted">
              The Extraction Engine will scan the file tree and last 10 commits, then generate <code className="bg-canvas text-accent-emphasis px-1 rounded">.vibe/features/</code> and <code className="bg-canvas text-accent-emphasis px-1 rounded">.vibe/requirements/</code> automatically.
            </p>
          </div>
        )}

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-fg-muted hover:text-fg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !owner.trim() || !repo.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Creating…</>
            ) : (
              <><Zap size={14} /> Create Vibe Project</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeButton({
  active, icon, label, description, onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-left p-4 rounded-lg border transition-colors ${
        active
          ? 'border-accent bg-accent-subtle text-fg'
          : 'border-border hover:border-fg/20 text-fg-muted'
      }`}
    >
      <div className={`flex items-center gap-2 font-medium text-sm mb-1 ${active ? 'text-accent-emphasis' : ''}`}>
        {icon}
        {label}
      </div>
      <div className="text-xs text-fg-muted">{description}</div>
    </button>
  );
}
