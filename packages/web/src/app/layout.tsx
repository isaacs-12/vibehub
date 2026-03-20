import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import NavBar from '@/components/NavBar/NavBar';
import AuthProvider from '@/components/AuthProvider';
import AuroraBackground from '@/components/AuroraBackground';

export const metadata: Metadata = {
  title: 'VibeHub',
  description: 'Vibe-first Version Control — where features lead, code follows.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-EJT2M5CB4Z" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-EJT2M5CB4Z');
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-canvas">
        <AuthProvider>
          <AuroraBackground />
          <NavBar />
          <main className="relative z-10">{children}</main>
          <footer className="relative z-10 border-t border-border py-6 mt-16">
            <div className="mx-auto max-w-screen-xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-fg-muted">
              <span>&copy; {new Date().getFullYear()} VibeHub</span>
              <div className="flex items-center gap-4">
                <a href="/privacy" className="hover:text-fg transition-colors">Privacy Policy</a>
                <a href="/docs" className="hover:text-fg transition-colors">Docs</a>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
