import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import NavBar from '@/components/NavBar/NavBar';
import AuthProvider from '@/components/AuthProvider';

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
          <NavBar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
