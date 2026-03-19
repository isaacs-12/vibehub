'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

interface Project {
  id: string;
  owner: string;
  repo: string;
  description: string;
  createdAt: string;
}

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setProjects(data.slice(0, 3)))
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || creating) return;
    setCreating(true);

    // Auto-derive a repo slug from the description
    const words = prompt.trim().toLowerCase().split(/\s+/);
    const repo =
      words
        .slice(0, 5)
        .join('-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'my-project';
    const handle = (session as any)?.handle ?? 'my';

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, description: prompt.trim() }),
      });
      router.push(`/${handle}/${repo}`);
    } catch {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-16">
      {/* Hero prompt */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-fg mb-3">
          What do you want to build?
        </h1>
        <p className="text-lg text-fg-muted max-w-lg mx-auto">
          Describe your idea and the AI builds it for you.
        </p>
      </div>

      <form onSubmit={handleCreate} className="max-w-2xl mx-auto mb-16">
        <div className="relative bg-canvas-subtle border border-border rounded-xl overflow-hidden focus-within:border-accent/60 transition-colors shadow-sm">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. A task management app where my team can track projects and deadlines"
            rows={3}
            className="w-full bg-transparent px-4 pt-4 pb-12 text-sm text-fg placeholder:text-fg-subtle resize-none focus:outline-none"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="text-xs text-fg-subtle">Enter to create</span>
            <button
              type="submit"
              disabled={creating || !prompt.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 disabled:opacity-40 transition-colors"
            >
              {creating ? (
                <><Loader2 size={13} className="animate-spin" /> Building…</>
              ) : (
                <><Sparkles size={13} /> Create</>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-fg-subtle text-center mt-3">
          Or{' '}
          <Link href="/new" className="text-accent-emphasis hover:underline">
            configure manually
          </Link>{' '}
          to choose a framework, import a repo, and more.
        </p>
      </form>

      {/* Recent projects */}
      {projects.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">Recent projects</h2>
            <Link href="/explore" className="text-xs text-accent-emphasis hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/${p.owner}/${p.repo}`}
                className="flex items-center justify-between bg-canvas-subtle border border-border rounded-lg px-4 py-3 hover:border-accent/40 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg group-hover:text-accent-emphasis transition-colors truncate">
                    {p.description
                      ? p.description.replace(/^\[.*?\]\s*/, '')
                      : `${p.owner}/${p.repo}`}
                  </div>
                  {p.description && (
                    <div className="text-xs text-fg-subtle mt-0.5 font-mono">{p.owner}/{p.repo}</div>
                  )}
                </div>
                <ArrowRight size={13} className="text-fg-subtle group-hover:text-accent-emphasis transition-colors shrink-0 ml-3" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
