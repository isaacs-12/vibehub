import React from 'react';
import ProviderConfig from '@/components/Settings/ProviderConfig';
import ImportJobs from '@/components/Settings/ImportJobs';

interface Props {
  params: { owner: string; repo: string };
}

export default function SettingsPage({ params }: Props) {
  const { owner, repo } = params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fg mb-6">Sovereignty Settings</h1>
      <p className="text-sm text-fg-muted mb-8">
        Configure which AI providers handle Vibe-to-Code translation for <strong className="text-fg">{owner}/{repo}</strong>.
        Your data never leaves your infrastructure unless you explicitly configure a cloud provider.
      </p>

      <div className="space-y-8">
        <ProviderConfig />
        <ImportJobs owner={owner} repo={repo} />
      </div>
    </div>
  );
}
