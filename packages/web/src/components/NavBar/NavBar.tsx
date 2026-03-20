'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Zap, Settings, LogOut, User } from 'lucide-react';

export default function NavBar() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const handle = (session as any)?.handle;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-canvas/95 backdrop-blur">
      <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-accent-emphasis font-bold text-lg shrink-0">
          <Zap size={20} />
          VibeHub
        </Link>

        <div className="flex-1" />

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1 text-sm">
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/docs">Docs</NavLink>
          <NavLink href="/new">New Project</NavLink>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full bg-canvas-subtle animate-pulse" />
          ) : user ? (
            <>
              <Link href={"/settings" as any} className="p-2 text-fg-muted hover:text-fg rounded-md hover:bg-canvas-subtle transition-colors">
                <Settings size={16} />
              </Link>
              <UserMenu
                name={user.name ?? handle ?? 'User'}
                avatarUrl={user.image ?? (session as any)?.avatarUrl}
                handle={handle}
              />
            </>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function UserMenu({ name, avatarUrl, handle }: { name: string; avatarUrl?: string | null; handle?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full overflow-hidden border border-border hover:border-accent/50 transition-colors"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-accent/30 flex items-center justify-center text-xs text-accent-emphasis font-bold">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-canvas-overlay border border-border rounded-lg shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b border-border">
            <div className="text-sm font-medium text-fg">{name}</div>
            {handle && <div className="text-xs text-fg-muted">@{handle}</div>}
          </div>
          {handle && (
            <Link
              href={`/${handle}` as any}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-fg-muted hover:text-fg hover:bg-canvas-subtle transition-colors"
            >
              <User size={14} />
              Your projects
            </Link>
          )}
          <Link
            href={"/settings" as any}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-fg-muted hover:text-fg hover:bg-canvas-subtle transition-colors"
          >
            <Settings size={14} />
            Settings
          </Link>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-fg-muted hover:text-fg hover:bg-canvas-subtle transition-colors border-t border-border"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as any} className="px-3 py-1.5 text-fg-muted hover:text-fg hover:bg-canvas-subtle rounded-md transition-colors">
      {children}
    </Link>
  );
}
