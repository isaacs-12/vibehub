import React from 'react';

/**
 * Segment layout so Next.js resolves /[owner]/[repo] routes.
 * Passthrough — no UI.
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
