'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  params: { owner: string; repo: string };
}

export default function NewUpdatePage({ params }: Props) {
  const { owner, repo } = params;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${owner}/${repo}/prs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: 'me',
          headBranch: `feature/${title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const pr = await res.json();
      router.push(`/${owner}/${repo}/pulls/${pr.id}`);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-2 text-sm text-fg-muted">
        <Link href={`/${owner}/${repo}`} className="hover:text-fg">{owner}/{repo}</Link>
        {' / '}
        <Link href={`/${owner}/${repo}/pulls`} className="hover:text-fg">Updates</Link>
        {' / '}
        <span className="text-fg">New</span>
      </div>

      <h1 className="text-2xl font-semibold text-fg mb-2 mt-6">Describe a change</h1>
      <p className="text-sm text-fg-muted mb-8">
        Tell the AI what you want to add, change, or fix. It will update the project and generate the code.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative bg-canvas-subtle border border-border rounded-xl overflow-hidden focus-within:border-accent/60 transition-colors">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Add a dark mode toggle to the settings page"
            rows={4}
            autoFocus
            className="w-full bg-transparent px-4 pt-4 pb-12 text-sm text-fg placeholder:text-fg-subtle resize-none focus:outline-none"
          />
          <div className="absolute bottom-3 right-3">
            <span className="text-xs text-fg-subtle mr-2">Enter to submit</span>
          </div>
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href={`/${owner}/${repo}/pulls`}
            className="text-sm text-fg-muted hover:text-fg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Submitting…</>
            ) : (
              <><Sparkles size={14} /> Submit change</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
