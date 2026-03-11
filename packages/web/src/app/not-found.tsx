import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-7xl font-bold text-fg-subtle mb-4">404</div>
      <h1 className="text-xl font-semibold text-fg mb-2">Page not found</h1>
      <p className="text-sm text-fg-muted mb-6">
        This page doesn&apos;t exist. If you just created a project, make sure the URL matches the owner and repo name you entered.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 transition-colors">
          Go home
        </Link>
        <Link href="/new" className="px-4 py-2 border border-border text-fg-muted text-sm rounded-md hover:text-fg transition-colors">
          New project
        </Link>
      </div>
    </div>
  );
}
