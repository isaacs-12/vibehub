'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import ProviderConfig from '@/components/Settings/ProviderConfig';
import { Settings, User } from 'lucide-react';

export default function GlobalSettingsPage() {
  const { data: session } = useSession();
  const handle = (session as any)?.handle;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fg mb-1">Settings</h1>
      <p className="text-sm text-fg-muted mb-8">
        {handle
          ? `Configure your account and compilation preferences.`
          : 'Sign in to save your preferences across sessions.'}
      </p>

      {session?.user && (
        <section className="bg-canvas-subtle border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 font-semibold text-fg text-sm">
              <User size={14} />
              Account
            </div>
          </div>
          <div className="p-5 flex items-center gap-4">
            {session.user.image && (
              <img src={session.user.image} alt="" className="w-12 h-12 rounded-full border border-border" />
            )}
            <div>
              <div className="text-sm font-medium text-fg">{session.user.name}</div>
              <div className="text-xs text-fg-muted">{session.user.email}</div>
              {handle && <div className="text-xs text-fg-subtle font-mono mt-0.5">@{handle}</div>}
            </div>
          </div>
        </section>
      )}

      <ProviderConfig />
    </div>
  );
}
