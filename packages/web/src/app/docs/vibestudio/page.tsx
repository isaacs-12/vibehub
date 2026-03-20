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
        <Callout>
          VibeStudio is currently in development. Desktop downloads will be
          available soon.
        </Callout>
      </Section>

      <Section title="Features">
        <FeatureCard
          title="Spec Editor"
          description="Edit feature specs in a dedicated markdown editor with syntax highlighting for the .vibe frontmatter format (Uses, Data, Never)."
        />
        <FeatureCard
          title="Code Peek"
          description="See the generated code alongside your spec. VibeStudio uses mapping.json to show you exactly which source files correspond to each feature."
        />
        <FeatureCard
          title="Local Compile"
          description="Run the AI compiler on your machine. Choose your model, compile, and see results in the output panel — without pushing to the cloud."
        />
        <FeatureCard
          title="Dev Server"
          description="Start your project's dev server directly from VibeStudio. It reads project.json to determine the right command."
        />
        <FeatureCard
          title="Push & Pull"
          description="Sync specs with VibeHub. Push creates an update (PR) on the web. Pull fetches the latest specs from the remote and commits them locally."
        />
        <FeatureCard
          title="Chat Sidebar"
          description="Ask the AI questions about your project, get suggestions for spec improvements, or debug compilation issues."
        />
      </Section>

      <Section title="Download">
        <Callout>
          Desktop downloads for macOS, Windows, and Linux are coming soon. Check
          back here for direct download links.
        </Callout>
        {/* Build-from-source instructions will be added once the repo is public. */}
      </Section>

      <Section title="Authentication">
        <p>
          VibeStudio uses a secure OAuth flow to connect to your VibeHub
          account:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-fg-muted">
          <li>
            Click <strong className="text-fg">Sign in</strong> in VibeStudio
            &mdash; this opens your system browser.
          </li>
          <li>
            Authenticate with Google OAuth on getvibehub.com (VibeStudio uses
            its own OAuth client, separate from the web app).
          </li>
          <li>
            After login, the browser redirects to a{' '}
            <Code>vibehub://auth?token=...</Code> deep link, which hands a
            secure bearer token back to VibeStudio.
          </li>
          <li>
            VibeStudio validates the token with the server and stores it
            locally. On future launches, the token is re-validated automatically.
          </li>
        </ol>
        <p>
          The bearer token is used for all API requests (push, pull, compile).
          The server enforces ownership on every write &mdash; you can only push
          to projects you own. Tokens expire and can be revoked by signing out.
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
