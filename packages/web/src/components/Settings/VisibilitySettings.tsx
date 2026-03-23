'use client';

import React, { useState } from 'react';
import { Globe, Link as LinkIcon, Lock, Check, Loader2, Search, AlertTriangle } from 'lucide-react';

const OPTIONS = [
  { id: 'public' as const, icon: Globe, label: 'Public', desc: 'Anyone with the link can view' },
  { id: 'unlisted' as const, icon: LinkIcon, label: 'Unlisted', desc: 'Only accessible via direct link' },
  { id: 'private' as const, icon: Lock, label: 'Private', desc: 'Only visible to you' },
];

interface Props {
  owner: string;
  repo: string;
  currentVisibility: string;
  currentListed: boolean;
}

export default function VisibilitySettings({ owner, repo, currentVisibility, currentListed }: Props) {
  const [visibility, setVisibility] = useState(currentVisibility);
  const [listed, setListed] = useState(currentListed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(updates: { visibility?: string; listed?: boolean }) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${owner}/${repo}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to update');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Revert on failure
      setVisibility(currentVisibility);
      setListed(currentListed);
    } finally {
      setSaving(false);
    }
  }

  function handleVisibilityChange(v: string) {
    if (v === visibility) return;
    setVisibility(v);
    // If switching away from public, auto-unlist
    if (v !== 'public' && listed) {
      setListed(false);
      save({ visibility: v, listed: false });
    } else {
      save({ visibility: v });
    }
  }

  function handleListedToggle() {
    const next = !listed;
    setListed(next);
    save({ listed: next });
  }

  const isPublic = visibility === 'public';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-fg">Visibility</h2>
        {saving && <Loader2 size={12} className="animate-spin text-fg-muted" />}
        {saved && <span className="text-xs text-green-500">Saved</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = visibility === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleVisibilityChange(opt.id)}
              disabled={saving}
              className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                active
                  ? 'border-accent bg-accent-subtle text-fg'
                  : 'border-border hover:border-fg/20 text-fg-muted'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-accent-emphasis' : ''}`}>
                  <Icon size={14} />
                  {opt.label}
                </span>
                {active && <Check size={11} className="text-accent-emphasis shrink-0" />}
              </div>
              <div className="text-[11px] text-fg-subtle">{opt.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Listed toggle */}
      <div className="mt-4">
        <button
          type="button"
          onClick={handleListedToggle}
          disabled={saving || !isPublic}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
            listed && isPublic
              ? 'border-accent bg-accent-subtle'
              : 'border-border hover:border-fg/20'
          } ${!isPublic ? 'opacity-50 cursor-not-allowed' : ''} disabled:opacity-50`}
        >
          <Search size={16} className={listed && isPublic ? 'text-accent-emphasis' : 'text-fg-muted'} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${listed && isPublic ? 'text-accent-emphasis' : 'text-fg'}`}>
                List on Explore
              </span>
              {listed && isPublic && <Check size={11} className="text-accent-emphasis" />}
            </div>
            <div className="text-[11px] text-fg-subtle">
              {isPublic
                ? 'Share this project on the Explore marketplace so others can discover and fork it.'
                : 'Only public projects can be listed on Explore.'}
            </div>
          </div>
        </button>

        {/* Warning when private/unlisted overrules listed */}
        {!isPublic && currentListed && (
          <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle size={13} className="text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-yellow-200/80">
              This project was previously listed on Explore. It won&apos;t appear there while visibility is set to {visibility}. Switch back to public to re-list it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
