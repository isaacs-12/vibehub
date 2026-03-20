'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Lightbulb, Cpu, Monitor, Terminal } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/docs/getting-started', label: 'Getting Started', icon: BookOpen },
  { href: '/docs/concepts', label: 'Concepts', icon: Lightbulb },
  { href: '/docs/compilation', label: 'Compilation', icon: Cpu },
  { href: '/docs/vibestudio', label: 'VibeStudio', icon: Monitor },
  { href: '/docs/cli', label: 'CLI Reference', icon: Terminal },
] as const;

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10 flex gap-10">
      {/* Sidebar */}
      <aside className="hidden md:block w-52 shrink-0">
        <div className="sticky top-24">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-3">
            Documentation
          </h2>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href as any}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    active
                      ? 'bg-accent-subtle text-accent-emphasis font-medium'
                      : 'text-fg-muted hover:text-fg hover:bg-canvas-subtle'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-canvas border-t border-border px-2 py-2 flex gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href as any}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] rounded-md transition-colors ${
                active
                  ? 'text-accent-emphasis'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
            >
              <Icon size={14} />
              {label.split(' ')[0]}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      <article className="min-w-0 flex-1 max-w-3xl">{children}</article>
    </div>
  );
}
