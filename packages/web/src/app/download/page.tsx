'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Monitor, Terminal, Apple, ArrowRight } from 'lucide-react';

const REPO = 'isaacs-12/vibehub';

type ReleaseAsset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; assets: ReleaseAsset[] };

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function detectPlatform(): 'mac-arm' | 'mac-intel' | 'linux' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) {
    // Check for Apple Silicon via GPU or platform hints
    if (
      ua.includes('arm') ||
      (navigator as any).userAgentData?.architecture === 'arm' ||
      // Most modern Macs are Apple Silicon
      (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency >= 8)
    ) {
      return 'mac-arm';
    }
    return 'mac-intel';
  }
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

export default function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPlatform>>('unknown');

  useEffect(() => {
    setPlatform(detectPlatform());
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tag_name) setRelease(data);
      })
      .catch(() => {});
  }, []);

  const dmg = release?.assets.find((a) => a.name.endsWith('.dmg'));
  const cliAssets = release?.assets.filter((a) => a.name.startsWith('vibe-') && a.name.endsWith('.tar.gz')) ?? [];

  const primaryDownload = dmg;

  return (
    <div className="mx-auto max-w-screen-md px-4 py-20">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-subtle border border-border mb-5">
          <Download size={26} className="text-accent-emphasis" />
        </div>
        <h1 className="text-4xl font-bold text-fg">Download VibeStudio</h1>
        <p className="mt-3 text-fg-muted max-w-md mx-auto">
          Edit specs locally, run the AI compiler on your machine, and sync with VibeHub.
        </p>
        {release && (
          <p className="mt-2 text-xs text-fg-subtle">{release.tag_name}</p>
        )}
      </div>

      {/* ── Desktop app ── */}
      <section className="mb-12">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4 flex items-center gap-2">
          <Monitor size={14} /> Desktop App
        </h2>

        {primaryDownload ? (
          <div className="border border-border rounded-xl bg-canvas-subtle p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <Apple size={18} /> VibeStudio for macOS
                </h3>
                <p className="text-sm text-fg-muted mt-1">
                  {primaryDownload.name} &middot; {formatSize(primaryDownload.size)}
                </p>
              </div>
              <a
                href={primaryDownload.browser_download_url}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors"
              >
                <Download size={15} />
                {platform === 'mac-arm' || platform === 'mac-intel' ? 'Download' : 'Download for macOS'}
              </a>
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-xl bg-canvas-subtle p-6 text-center text-sm text-fg-muted">
            Loading latest release&hellip;
          </div>
        )}

        <p className="text-xs text-fg-subtle mt-3">
          Windows and Linux desktop builds coming soon.
        </p>
      </section>

      {/* ── CLI ── */}
      <section className="mb-12">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4 flex items-center gap-2">
          <Terminal size={14} /> CLI
        </h2>

        <div className="border border-border rounded-xl bg-canvas-subtle p-6">
          <p className="text-sm text-fg mb-3">Install with a single command:</p>
          <pre className="bg-canvas-inset border border-border rounded-lg p-4 text-sm text-fg overflow-x-auto">
            <code>curl -fsSL https://getvibehub.com/install.sh | sh</code>
          </pre>

          {cliAssets.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-fg-muted cursor-pointer hover:text-fg">
                Or download manually
              </summary>
              <div className="mt-3 space-y-2">
                {cliAssets.map((a) => (
                  <a
                    key={a.name}
                    href={a.browser_download_url}
                    className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-canvas-inset transition-colors"
                  >
                    <span className="text-accent-emphasis">{a.name}</span>
                    <span className="text-xs text-fg-subtle">{formatSize(a.size)}</span>
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ── Next steps ── */}
      <section className="text-center">
        <p className="text-sm text-fg-muted">
          New to VibeHub?{' '}
          <Link href={'/docs/getting-started' as any} className="text-accent-emphasis hover:underline inline-flex items-center gap-1">
            Getting started guide <ArrowRight size={12} />
          </Link>
        </p>
      </section>
    </div>
  );
}
