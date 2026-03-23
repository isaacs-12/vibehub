import React from 'react';
import ProjectDetails from '@/components/Settings/ProjectDetails';
import VisibilitySettings from '@/components/Settings/VisibilitySettings';
import ProviderConfig from '@/components/Settings/ProviderConfig';
import ImportJobs from '@/components/Settings/ImportJobs';
import { getStore } from '@/lib/data/store';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

interface Props {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { owner, repo } = await params;
  const project = await getStore().getProject(owner, repo);
  if (!project) notFound();

  const session = await auth();
  if ((session as any)?.handle !== owner) {
    redirect(`/${owner}/${repo}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fg mb-6">Project Settings</h1>
      <p className="text-sm text-fg-muted mb-8">
        Settings for <strong className="text-fg">{owner}/{repo}</strong>.
      </p>

      <div className="space-y-8">
        <ProjectDetails owner={owner} repo={repo} description={project.description} />
        <VisibilitySettings owner={owner} repo={repo} currentVisibility={project.visibility} currentListed={project.listed ?? false} />
        <ProviderConfig />
        <ImportJobs owner={owner} repo={repo} />
      </div>
    </div>
  );
}
