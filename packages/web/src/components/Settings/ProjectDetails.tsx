'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';

interface Props {
  owner: string;
  repo: string;
  description: string;
}

export default function ProjectDetails({ owner, repo: initialRepo, description: initialDescription }: Props) {
  const router = useRouter();
  const [repo, setRepo] = useState(initialRepo);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const hasChanges = repo !== initialRepo || description !== initialDescription;

  async function handleSave() {
    if (!repo.trim()) {
      setError('Project name cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const res = await fetch(`/api/projects/${owner}/${initialRepo}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(repo !== initialRepo ? { repo: repo.trim() } : {}),
          ...(description !== initialDescription ? { description: description.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // If repo name changed, redirect to new URL
      if (repo.trim() !== initialRepo) {
        const data = await res.json().catch(() => null);
        const newRepo = data?.repo ?? repo.trim();
        router.replace(`/${owner}/${newRepo}/settings`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-fg mb-3">Project Details</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">Project name</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-muted">{owner} /</span>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="flex-1 bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What does this project do?"
            className="w-full bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent/50 resize-none"
          />
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {saving ? (
              <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Saving…</span>
            ) : saved ? (
              <span className="flex items-center gap-1.5"><Check size={12} /> Saved</span>
            ) : (
              'Save Changes'
            )}
          </button>
          {repo !== initialRepo && (
            <span className="text-xs text-fg-subtle">Renaming will change the project URL.</span>
          )}
        </div>
      </div>
    </section>
  );
}
