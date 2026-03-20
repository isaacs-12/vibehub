'use client';

import React, { useState } from 'react';
import { Globe, Link as LinkIcon, Lock, Check, Loader2 } from 'lucide-react';

const OPTIONS = [
  { id: 'public' as const, icon: Globe, label: 'Public', desc: 'Visible on Explore and your profile' },
  { id: 'unlisted' as const, icon: LinkIcon, label: 'Unlisted', desc: 'Only accessible via direct link' },
  { id: 'private' as const, icon: Lock, label: 'Private', desc: 'Only visible to you' },
];

interface Props {
  owner: string;
  repo: string;
  currentVisibility: string;
}

export default function VisibilitySettings({ owner, repo, currentVisibility }: Props) {
  const [visibility, setVisibility] = useState(currentVisibility);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleChange(v: string) {
    if (v === visibility) return;
    setVisibility(v);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${owner}/${repo}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: v }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to update');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setVisibility(currentVisibility);
    } finally {
      setSaving(false);
    }
  }

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
              onClick={() => handleChange(opt.id)}
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
    </section>
  );
}
