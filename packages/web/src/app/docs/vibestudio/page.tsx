import Image from 'next/image';

export default function VibeStudioPage() {
  return (
    <div className="docs-content">
      <h1 className="text-3xl font-bold text-fg mb-2">VibeStudio</h1>
      <p className="text-fg-muted mb-8">
        The desktop app for editing specs and running the compiler locally.
      </p>

      <Section title="Overview">
        <p>
          VibeStudio is a Tauri-based desktop application that gives you a local
          editing environment for your VibeHub projects. It&apos;s designed for
          the day-to-day workflow of writing specs, previewing generated code,
          and syncing with the web.
        </p>
        <Image
          src="/vibestudio-codepeek.png"
          alt="VibeStudio IDE showing the spec editor with code peek open"
          width={800}
          height={500}
          className="rounded-xl border border-border shadow-lg my-4"
        />
        <p>
          VibeStudio is available for macOS.{' '}
          <a href="/download" className="text-accent-emphasis hover:underline">
            Download the latest release
          </a>{' '}
          or install the CLI:
        </p>
      </Section>

      <Section title="Features">
        <FeatureCard
          title="Spec Editor"
          description="Edit feature specs in a dedicated markdown editor with syntax highlighting for the .vibe frontmatter format (Uses, Data, Never, Connects). The editor lives in the main panel — click any spec in the left sidebar to open it. Changes are saved automatically."
        />
        <FeatureCard
          title="Code Peek"
          description="Toggle Code Peek in the top bar to see the generated source files alongside your spec. VibeStudio reads mapping.json to resolve which files belong to each feature, so you can instantly see how your plain-English spec translates into working code."
        />
        <FeatureCard
          title="Top Bar Abstractions"
          description="The top bar surfaces the key abstractions from your spec — Data models, Uses (dependencies), and Never (constraints) — as clickable pills. This gives you an at-a-glance view of what a feature touches without scrolling through the markdown."
        />
        <Image
          src="/topbar-abstractions.png"
          alt="Top bar showing Data, Uses, and Never abstractions as pills"
          width={800}
          height={100}
          className="rounded-lg border border-border shadow-sm my-2"
        />
        <FeatureCard
          title="Local Compile"
          description="Click the Vibe button to run the AI compiler on your machine. Choose your model from the dropdown (Gemini, Claude, GPT), watch the four-phase progress (codegen → typecheck → tests → validation) in the output panel, and iterate without pushing to the cloud."
        />
        <FeatureCard
          title="Dev Server"
          description="Start your project's dev server directly from VibeStudio by clicking the play button. It reads your project.json to determine the right command (npm run dev, etc.) and streams output in the bottom panel."
        />
        <FeatureCard
          title="Push & Pull"
          description="Sync specs with VibeHub using the push/pull buttons in the top bar. Push creates an update (like a PR) on the web for your team to review. Pull fetches the latest specs from the remote and commits them to your local .vibe/ directory."
        />
        <FeatureCard
          title="Chat Sidebar"
          description="Open the chat panel to ask the AI questions about your project, get suggestions for spec improvements, or debug compilation issues. The chat is context-aware — it knows about your specs and generated code."
        />
      </Section>

      <Section title="Download">
        <p>
          Download the latest VibeStudio DMG from the{' '}
          <a href="/download" className="text-accent-emphasis hover:underline">
            download page
          </a>
          , or install the CLI:
        </p>
        <CodeBlock>{`curl -fsSL https://getvibehub.com/install.sh | sh`}</CodeBlock>
        <p>
          Windows and Linux desktop builds are coming soon.
        </p>
      </Section>

      <Section title="Authentication & API Keys">
        <p>
          VibeStudio has no secrets or API keys built in &mdash; it&apos;s a
          thin client that authenticates against the VibeHub web backend. The
          only config compiled into the app is the web URL
          (<Code>https://getvibehub.com</Code>).
        </p>
        <p>
          <strong className="text-fg">Sign-in flow:</strong>
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-fg-muted">
          <li>
            Click <strong className="text-fg">Sign in</strong> in VibeStudio
            &mdash; this opens your system browser to the VibeHub web app.
          </li>
          <li>
            Authenticate with Google OAuth on getvibehub.com.
          </li>
          <li>
            After login, the web backend issues a long-lived bearer token
            (valid for 365 days) and redirects to a{' '}
            <Code>vibehub://auth?token=...</Code> deep link, which hands the
            token back to VibeStudio.
          </li>
          <li>
            VibeStudio stores the token locally. On future launches, it&apos;s
            used automatically &mdash; no need to sign in again until it
            expires.
          </li>
        </ol>
        <p>
          <strong className="text-fg">Provider API keys:</strong>
        </p>
        <p>
          When the cloud agent compiles your specs, it needs API keys for the
          AI provider (Anthropic, Google, OpenAI). These keys are configured in
          your account settings on the web app &mdash; not in VibeStudio
          itself. Keys are encrypted at rest (AES-256-CBC) and never sent to
          the desktop app. VibeStudio calls the web backend, which decrypts
          and uses your keys server-side.
        </p>
        <p>
          If you haven&apos;t configured your own keys, the platform&apos;s
          default Gemini keys are used with reduced concurrency limits (1
          active compile vs. 3 for BYOK users).
        </p>
        <p>
          <strong className="text-fg">In short:</strong> sign in once via the
          desktop app, configure your API keys on the web, and VibeStudio uses
          them transparently through the backend.
        </p>
      </Section>

      <Section title="Local Config">
        <p>
          Each project&apos;s connection to VibeHub is stored in{' '}
          <Code>.vibe/remote.json</Code>:
        </p>
        <CodeBlock>{`{
  "owner": "your-handle",
  "repo": "my-project",
  "webUrl": "https://getvibehub.com"
}`}</CodeBlock>
        <p>
          This file is created automatically when you clone a project or connect
          an existing project to VibeHub. It tells VibeStudio (and the CLI)
          where to push and pull specs.
        </p>
        <p>
          The <Code>owner</Code> field must match your authenticated account.
          The server rejects pushes where the token&apos;s user doesn&apos;t
          match the project owner, preventing unauthorized modifications.
        </p>
      </Section>

      <Section title="Workflow">
        <ol className="list-decimal list-inside space-y-2 text-sm text-fg-muted">
          <li>
            <strong className="text-fg">Open a project</strong> &mdash; Point
            VibeStudio at a directory with a <Code>.vibe/</Code> folder, or
            clone from VibeHub.
          </li>
          <li>
            <strong className="text-fg">Edit specs</strong> &mdash; Use the
            editor to modify features. The sidebar shows all specs in your
            project.
          </li>
          <li>
            <strong className="text-fg">Compile</strong> &mdash; Hit compile to
            generate code. Watch progress in the output panel.
          </li>
          <li>
            <strong className="text-fg">Preview</strong> &mdash; Start the dev
            server to see your changes live. Use Code Peek to inspect generated
            files.
          </li>
          <li>
            <strong className="text-fg">Push</strong> &mdash; When you&apos;re
            happy with the specs, push to VibeHub to create an update for
            review.
          </li>
        </ol>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-fg mb-3 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-fg-muted leading-relaxed">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-canvas-subtle border border-border rounded text-xs text-accent-emphasis">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-canvas-inset border border-border rounded-lg p-4 text-xs text-fg overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-attention/10 border border-attention/30 rounded-lg px-4 py-3 text-sm text-attention">
      {children}
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-canvas-subtle">
      <h3 className="text-sm font-semibold text-fg mb-1">{title}</h3>
      <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
    </div>
  );
}
