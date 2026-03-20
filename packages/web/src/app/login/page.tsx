'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const isDesktop = searchParams.get('desktop') === '1';
  const error = searchParams.get('error');

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-accent-emphasis font-bold text-2xl mb-2">
            <Image src="/logo.png" alt="" width={28} height={28} />
            VibeHub
          </div>
          <p className="text-fg-muted text-sm">
            {isDesktop ? 'Sign in to connect your desktop app' : 'Sign in to your account'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error === 'OAuthAccountNotLinked'
              ? 'This email is already associated with another account.'
              : 'Something went wrong. Please try again.'}
          </div>
        )}

        <button
          onClick={() => signIn('google', {
            callbackUrl: isDesktop ? '/api/auth/desktop-callback' : callbackUrl,
          })}
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

        <p className="mt-6 text-center text-xs text-fg-muted">
          By signing in, you agree to our{' '}
          <a href="/privacy" className="text-accent-emphasis hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-canvas-subtle animate-pulse" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
