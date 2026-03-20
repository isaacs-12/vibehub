import React from 'react';
import Link from 'next/link';
import { Zap, Star, GitFork, Cpu } from 'lucide-react';
import { getStore } from '@/lib/data/store';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function UserProfilePage({ params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const store = getStore();

  const user = await store.getUserByHandle(owner);
  if (!user) notFound();

  const allProjects = await store.listUserProjects(owner);
  const session = await auth();
  const isOwner = (session as any)?.handle === owner;
  const projects = isOwner ? allProjects : allProjects.filter((p) => p.visibility === 'public');

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name ?? owner} className="w-16 h-16 rounded-full border border-border" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-2xl font-bold text-accent-emphasis border border-border">
            {(user.name ?? owner)[0]?.toUpperCase()}
          </div>
        )}
        <div>
          {user.name && <h1 className="text-xl font-semibold text-fg">{user.name}</h1>}
          <p className="text-sm text-fg-muted">@{owner}</p>
        </div>
      </div>

      {/* Projects */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-fg">
          {isOwner ? 'Your projects' : `${user.name ?? owner}'s projects`}
        </h2>
        {isOwner && (
          <Link
            href="/new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
          >
            <Zap size={13} />
            New Project
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center gap-3 border border-border border-dashed rounded-lg">
          <p className="text-sm text-fg-muted">
            {isOwner ? "You haven't created any projects yet." : 'No projects yet.'}
          </p>
          {isOwner && (
            <Link
              href="/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors"
            >
              <Zap size={13} />
              Create your first project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/${p.owner}/${p.repo}`}
              className="block bg-canvas-subtle border border-border rounded-lg p-4 hover:border-accent/50 transition-colors group"
            >
              <div className="mb-2">
                <div className="font-semibold text-fg group-hover:text-accent-emphasis transition-colors">{p.repo}</div>
              </div>
              {p.description && (
                <p className="text-sm text-fg-muted mb-3 line-clamp-2">{p.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-fg-subtle">
                <span className="flex items-center gap-1">
                  <Star size={10} className={p.starCount > 0 ? 'text-yellow-400 fill-yellow-400' : ''} />
                  {p.starCount}
                </span>
                {p.forkCount > 0 && (
                  <span className="flex items-center gap-1">
                    <GitFork size={10} />
                    {p.forkCount}
                  </span>
                )}
                {p.compiledWith && (
                  <span className="flex items-center gap-1">
                    <Cpu size={9} />
                    {p.compiledWith}
                  </span>
                )}
                {p.forkedFromId && (
                  <span className="flex items-center gap-1">
                    <GitFork size={9} className="text-accent-emphasis" />
                    fork
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
