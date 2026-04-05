'use client';

import React, { useState, useRef, useEffect } from 'react';
import AuroraBackground from '@/components/AuroraBackground';
import SignInModal from '@/components/SignInModal';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Loader2,
  Sparkles,
  FileText,
  Cpu,
  GitPullRequest,
  Download,
  GitFork,
  Users,
  History,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || creating) return;

    // Require sign-in before creating a project
    if (!session) {
      setShowSignIn(true);
      return;
    }

    setCreating(true);

    const stopWords = new Set([
      'a','an','the','that','this','where','which','with','and','or','for',
      'to','in','on','my','our','is','are','can','do','app','application','i','we','lets','let',
    ]);
    const words = prompt.trim().toLowerCase().split(/\s+/).filter((w) => !stopWords.has(w));
    const repo =
      words
        .slice(0, 3)
        .join('-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'my-project';
    const handle = (session as any)?.handle ?? 'my';

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, description: prompt.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        // If an initial PR was auto-created, go straight to it so the user
        // can watch the ideation + compile progress in real time.
        if (data.initialPrId) {
          router.push(`/${handle}/${repo}/pulls/${data.initialPrId}`);
        } else {
          router.push(`/${handle}/${repo}`);
        }
      } else {
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate(e as unknown as React.FormEvent);
    }
  }

  return (
    <>
      <AuroraBackground />
      <div className="mx-auto max-w-screen-lg px-4">
      {/* ── Hero ── */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-bold text-fg leading-tight">
          git for vibes, based on intent
          <br />
          <span className="text-accent-emphasis">the human language compiler</span>
        </h1>
        <p className="mt-4 text-lg text-fg-muted max-w-2xl mx-auto leading-relaxed">
          Code? That's so last century. VibeHub allows you to collaborate on Vibes, in
          plain English. Make a feature, review it like a PR with diffs that highlight intent,
          and let our bespoke AI compiler build it into working software &mdash; all version-controlled and forkable.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
          <a
            href="#get-started"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors"
          >
            <Sparkles size={15} />
            Try in browser
          </a>
          <Link
            href={"/docs" as any}
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-border text-fg-muted text-sm font-medium rounded-lg hover:border-accent/50 hover:text-fg transition-colors"
          >
            Read the docs
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 border-t border-border">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide text-center mb-10">
          How it works
        </h2>
        <div className="space-y-24 max-w-5xl mx-auto">
          <StepShowcase
            number="1"
            title="Write vibes"
            description="Describe features in plain-English markdown files with structured frontmatter. These are your source of truth — not code. VibeStudio gives you a dedicated editor with syntax highlighting, code peek, and a sidebar to navigate all your specs."
            icon={<FileText size={22} />}
            media={
              <Image
                src="/vibestudio-codepeek.png"
                alt="VibeStudio IDE with code peek open"
                width={720}
                height={450}
                className="rounded-xl"
              />
            }
            imageRight
          />
          <StepShowcase
            number="2"
            title="AI compiles"
            description="Hit the Vibe button and our custom agentic AI reads your specs and generates a complete, working implementation. Choose your model, watch progress in real time, and iterate until it's right."
            icon={<Cpu size={22} />}
            media={<StepVideo src="/vibe.webm" />}
            imageRight={false}
          />
          <StepShowcase
            number="3"
            title="Review & ship"
            description="Review changes at the intent level, not the code level. VibeHub shows you exactly what changed in your specs — the decisions, not the implementation details. Merge when the spec is right."
            icon={<GitPullRequest size={22} />}
            media={
              <Image
                src="/intent_diff.png"
                alt="Intent-level diff showing spec changes"
                width={720}
                height={450}
                className="rounded-xl"
              />
            }
            imageRight
          />
        </div>
      </section>

      {/* ── Differentiators ── */}
      <section className="py-16 border-t border-border">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide text-center mb-10">
          Why spec-first?
        </h2>
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Differentiator
            icon={<FileText size={18} />}
            title="Decisions are first-class"
            description="Design choices live in our version-controlled Vibe primitive — reviewable, diffable, and portable."
          />
          <Differentiator
            icon={<Users size={18} />}
            title="Anyone can contribute"
            description="Non-technical stakeholders read and propose changes in plain English. No coding required."
          />
          <Differentiator
            icon={<GitFork size={18} />}
            title="Fork with lineage"
            description="Fork any public project. VibeHub tracks lineage so you can pull upstream spec changes."
          />
          <Differentiator
            icon={<History size={18} />}
            title="Immutable snapshots"
            description="Every spec change creates a snapshot. Recompile any version with any model, anytime."
          />
        </div>
      </section>

      {/* ── Get started form ── */}
      <section id="get-started" className="py-16 border-t border-border">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-fg">Start building</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Describe your idea and we'll set up the project for you.
          </p>
        </div>

        <form onSubmit={handleCreate} className="max-w-2xl mx-auto mb-6">
          <div className="relative bg-canvas-subtle border border-border rounded-xl overflow-hidden focus-within:border-accent/60 transition-colors shadow-sm">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. A task management app where my team can track projects and deadlines"
              rows={3}
              className="w-full bg-transparent px-4 pt-4 pb-12 text-sm text-fg placeholder:text-fg-subtle resize-none focus:outline-none"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <span className="text-xs text-fg-subtle">Enter to create</span>
              <button
                type="submit"
                disabled={creating || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 disabled:opacity-40 transition-colors"
              >
                {creating ? (
                  <><Loader2 size={13} className="animate-spin" /> Building&hellip;</>
                ) : (
                  <><Sparkles size={13} /> Create</>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-fg-subtle text-center mt-3">
            Or{' '}
            <Link href="/new" className="text-accent-emphasis hover:underline">
              configure manually
            </Link>{' '}
            to choose a framework, import a repo, and more.
          </p>
        </form>
      </section>

      {/* ── Desktop download CTA ── */}
      <section className="py-16 border-t border-border mb-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-subtle border border-border mb-4">
            <Download size={22} className="text-accent-emphasis" />
          </div>
          <h2 className="text-2xl font-bold text-fg">VibeStudio</h2>
          <p className="mt-2 text-sm text-fg-muted max-w-md mx-auto">
            Edit specs locally, run the AI compiler on your machine, and sync
            with VibeHub. Available for macOS, Windows, and Linux.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href={"/download" as any}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors"
            >
              <Download size={15} />
              Download for macOS
            </Link>
            <span className="text-xs text-fg-subtle">or</span>
            <code className="px-3 py-2 bg-canvas-inset border border-border rounded-lg text-xs text-fg">
              curl -fsSL https://getvibehub.com/install.sh | sh
            </code>
          </div>
        </div>
      </section>
    </div>
    {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
    </>
  );
}

/* ── Sub-components ── */

function StepShowcase({
  number,
  title,
  description,
  icon,
  media,
  imageRight,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  media: React.ReactNode;
  imageRight: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const textBlock = (
    <div className="flex flex-col justify-center">
      <div className="inline-flex items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent-subtle border border-border text-accent-emphasis">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-fg">
          <span className="text-accent-emphasis mr-1">{number}.</span>
          {title}
        </h3>
      </div>
      <p className="text-sm text-fg-muted leading-relaxed max-w-md">{description}</p>
    </div>
  );

  const mediaBlock = (
    <div className="flex items-center justify-center">{media}</div>
  );

  return (
    <div
      ref={ref}
      className={`grid md:grid-cols-2 gap-10 items-center transition-all duration-700 ease-out ${
        visible
          ? 'opacity-100 translate-y-0'
          : `opacity-0 ${imageRight ? '-translate-x-8' : 'translate-x-8'}`
      }`}
    >
      {imageRight ? (
        <>{textBlock}{mediaBlock}</>
      ) : (
        <>{mediaBlock}{textBlock}</>
      )}
    </div>
  );
}

function StepVideo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <video
      src={src}
      autoPlay
      loop
      muted
      playsInline
      onError={() => setFailed(true)}
      className="rounded-xl w-full"
    />
  );
}

function Differentiator({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-border bg-canvas-subtle">
      <div className="shrink-0 mt-0.5 text-accent-emphasis">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-fg mb-1">{title}</h3>
        <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
