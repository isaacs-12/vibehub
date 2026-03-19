import React from 'react';
import ProviderConfig from '@/components/Settings/ProviderConfig';
import ImportJobs from '@/components/Settings/ImportJobs';
import VisibilitySettings from '@/components/Settings/VisibilitySettings';
import { getStore } from '@/lib/data/store';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { owner, repo } = await params;
  const project = await getStore().getProject(owner, repo);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fg mb-6">Project Settings</h1>
      <p className="text-sm text-fg-muted mb-8">
        Settings for <strong className="text-fg">{owner}/{repo}</strong>.
      </p>

      <div className="space-y-8">
        <VisibilitySettings owner={owner} repo={repo} currentVisibility={project.visibility} />
        <ProviderConfig />
        <ImportJobs owner={owner} repo={repo} />
      </div>
    </div>
  );
}
