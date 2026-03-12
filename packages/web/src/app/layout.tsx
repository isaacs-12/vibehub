import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar/NavBar';

export const metadata: Metadata = {
  title: 'Vibe Forge',
  description: 'Vibe-first Git Forge — where features lead, code follows.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas">
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
