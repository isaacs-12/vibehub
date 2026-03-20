'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Zap, Settings, LogOut, User, X } from 'lucide-react';

export default function NavBar() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const handle = (session as any)?.handle;
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
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
                onClick={() => setShowLogin(true)}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {showLogin && <SignInModal onClose={() => setShowLogin(false)} />}
    </>
  );
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-sm mx-4 bg-canvas-overlay border border-border rounded-xl shadow-2xl p-8">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-fg-muted hover:text-fg rounded-md hover:bg-canvas-subtle transition-colors"
        >
          <X size={16} />
        </button>

        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 text-accent-emphasis font-bold text-xl mb-1">
            <Zap size={22} />
            VibeHub
          </div>
          <p className="text-fg-muted text-sm">Sign in to your account</p>
        </div>

        <button
          onClick={() => signIn('google')}
          className="w-full flex items-center justify-center gap-3 px-1 py-0.5 rounded-md border border-[#747775] bg-white hover:bg-[#f8f9fa] active:bg-[#e8e8e8] text-[#1f1f1f] font-medium transition-colors shadow-sm"
        >
          <div className="flex items-center justify-center w-10 h-10">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <span className="text-sm font-medium pr-3">Sign in with Google</span>
        </button>

        <p className="mt-5 text-center text-xs text-fg-muted">
          By signing in, you agree to our{' '}
          <a href="/privacy" className="text-accent-emphasis hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
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
