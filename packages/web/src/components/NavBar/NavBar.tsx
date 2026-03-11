import React from 'react';
import Link from 'next/link';
import { Zap, GitBranch, Search, Bell, Settings } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-canvas/95 backdrop-blur">
      <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-accent-emphasis font-bold text-lg shrink-0">
          <Zap size={20} />
          VibeForge
        </Link>

        {/* Search */}
        <div className="flex-1 max-w-sm">
          <div className="flex items-center gap-2 bg-canvas-subtle border border-border rounded-md px-3 py-1.5 text-sm text-fg-muted hover:border-accent/50 transition-colors cursor-text">
            <Search size={13} />
            <span>Search features, decisions…</span>
            <kbd className="ml-auto text-xs bg-canvas border border-border rounded px-1.5">/</kbd>
          </div>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1 text-sm">
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/new">New Project</NavLink>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          <button className="p-2 text-fg-muted hover:text-fg rounded-md hover:bg-canvas-subtle transition-colors">
            <Bell size={16} />
          </button>
          <Link href="/settings" className="p-2 text-fg-muted hover:text-fg rounded-md hover:bg-canvas-subtle transition-colors">
            <Settings size={16} />
          </Link>
          <div className="w-8 h-8 rounded-full bg-accent/30 border border-accent/50 flex items-center justify-center text-xs text-accent-emphasis font-bold">
            V
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 text-fg-muted hover:text-fg hover:bg-canvas-subtle rounded-md transition-colors">
      {children}
    </Link>
  );
}
