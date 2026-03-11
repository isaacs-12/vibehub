import React from 'react';

const DEMO_PROOFS = [
  {
    file: 'src/auth/providers.ts',
    language: 'typescript',
    additions: 28,
    deletions: 5,
    snippet: `// Added by AI based on "Users authenticate via Google OAuth2" Vibe
import { OAuth2Client } from 'google-auth-library';

export const googleProvider = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: \`\${process.env.BASE_URL}/auth/google/callback\`,
});

export async function verifyGoogleToken(idToken: string) {
  const ticket = await googleProvider.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}`,
  },
];

export default function ImplementationProofs() {
  return (
    <div className="space-y-3">
      {DEMO_PROOFS.map((proof) => (
        <div key={proof.file} className="border border-border rounded-lg overflow-hidden opacity-80">
          <div className="flex items-center justify-between px-4 py-2 bg-canvas-subtle border-b border-border text-sm">
            <span className="font-mono text-fg-muted">{proof.file}</span>
            <span className="text-xs">
              <span className="text-success">+{proof.additions}</span>
              {' / '}
              <span className="text-danger">-{proof.deletions}</span>
            </span>
          </div>
          <pre className="px-4 py-3 text-xs font-mono text-fg-muted overflow-x-auto leading-relaxed bg-canvas-inset">
            {proof.snippet}
          </pre>
        </div>
      ))}
    </div>
  );
}
