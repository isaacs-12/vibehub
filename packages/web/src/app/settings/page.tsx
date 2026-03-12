import React from 'react';
import ProviderConfig from '@/components/Settings/ProviderConfig';

export default function GlobalSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fg mb-1">Settings</h1>
      <p className="text-sm text-fg-muted mb-8">
        Global defaults for all projects. Individual projects can override these in their own Sovereignty Settings.
      </p>
      <ProviderConfig />
    </div>
  );
}
