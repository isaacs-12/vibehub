'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Zap, GitBranch, FolderPlus, Loader2, Check, Globe, Link as LinkIcon, Lock } from 'lucide-react';

type Mode = 'blank' | 'import';

const FRAMEWORKS = [
  { id: 'nextjs',   label: 'Next.js',         lang: 'TypeScript', desc: 'React + SSR' },
  { id: 'vite',     label: 'Vite + React',    lang: 'TypeScript', desc: 'SPA / frontend' },
  { id: 'express',  label: 'Express',          lang: 'TypeScript', desc: 'Node API' },
  { id: 'fastapi',  label: 'FastAPI',          lang: 'Python',     desc: 'Python API' },
  { id: 'flask',    label: 'Flask',            lang: 'Python',     desc: 'Python web' },
  { id: 'other',    label: 'Other / AI picks', lang: '',           desc: 'Let the AI decide' },
] as const;

type FrameworkId = typeof FRAMEWORKS[number]['id'];

export default function NewProjectPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const handle = (session as any)?.handle ?? '';
  const [mode, setMode] = useState<Mode>('blank');
  const [repo, setRepo] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<FrameworkId>('nextjs');
  const [repoUrl, setRepoUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle || !repo.trim()) {
      setError(handle ? 'Project name is required.' : 'You must be signed in to create a project.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: repo.trim(),
          description: description.trim(),
          framework: framework !== 'other' ? framework : undefined,
          visibility,
          importUrl: mode === 'import' ? repoUrl.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      // If an initial PR was auto-created, go straight to the compile progress page
      if (data.initialPrId) {
        router.push(`/${handle}/${repo.trim()}/pulls/${data.initialPrId}`);
      } else {
        router.push(`/${handle}/${repo.trim()}`);
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg mb-1">Create a new project</h1>
        <p className="text-sm text-fg-muted">
          Describe what you want to build — the AI handles the rest.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-8">
        <ModeButton
          active={mode === 'blank'}
          icon={<FolderPlus size={15} />}
          label="Start fresh"
          description="Blank project — describe it and build"
          onClick={() => setMode('blank')}
        />
        <ModeButton
          active={mode === 'import'}
          icon={<GitBranch size={15} />}
          label="(beta) Import existing codebase"
          description="Extract features from a Git repository"
          onClick={() => setMode('import')}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Owner / Repo */}
        <div className="flex gap-3 items-end">
          <div className="shrink-0">
            <label className="block text-xs text-fg-muted mb-1.5">Owner</label>
            <div className="bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm text-fg">
              {handle || '…'}
            </div>
          </div>
          <span className="text-fg-muted pb-2.5 text-lg">/</span>
          <div className="flex-1">
            <label className="block text-xs text-fg-muted mb-1.5">Project name</label>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="my-cool-app"
              required
              className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">
            Describe what you want to build
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"e.g. A billing dashboard that lets users manage subscriptions, view invoices, and update payment methods. Integrates with Stripe."}
            rows={3}
            className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 placeholder:text-fg-subtle resize-none"
          />
        </div>

        {/* Framework picker */}
        <div>
          <label className="block text-xs text-fg-muted mb-2">Framework</label>
          <div className="grid grid-cols-3 gap-2">
            {FRAMEWORKS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFramework(f.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  framework === f.id
                    ? 'border-accent bg-accent-subtle text-fg'
                    : 'border-border hover:border-fg/20 text-fg-muted'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-medium ${framework === f.id ? 'text-accent-emphasis' : ''}`}>
                    {f.label}
                  </span>
                  {framework === f.id && <Check size={11} className="text-accent-emphasis shrink-0" />}
                </div>
                <div className="text-[11px] text-fg-subtle">{f.lang ? `${f.lang} · ` : ''}{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div>
          <label className="block text-xs text-fg-muted mb-2">Visibility</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'public' as const, icon: <Globe size={14} />, label: 'Public', desc: 'Anyone can see this project' },
              { id: 'unlisted' as const, icon: <LinkIcon size={14} />, label: 'Unlisted', desc: 'Only people with the link' },
              { id: 'private' as const, icon: <Lock size={14} />, label: 'Private', desc: 'Only you can see it' },
            ]).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisibility(v.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  visibility === v.id
                    ? 'border-accent bg-accent-subtle text-fg'
                    : 'border-border hover:border-fg/20 text-fg-muted'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${visibility === v.id ? 'text-accent-emphasis' : ''}`}>
                    {v.icon}
                    {v.label}
                  </span>
                  {visibility === v.id && <Check size={11} className="text-accent-emphasis shrink-0" />}
                </div>
                <div className="text-[11px] text-fg-subtle">{v.desc}</div>
              </button>
            ))}
          </div>
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
              The AI will scan the file tree and generate feature descriptions automatically.
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
            disabled={loading || !handle || !repo.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Creating…</>
            ) : (
              <><Zap size={14} /> Create Project</>
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
