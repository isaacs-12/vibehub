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
          available soon. You can build from source in the meantime.
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

      <Section title="Building from Source">
        <p>
          VibeStudio requires{' '}
          <a
            href="https://tauri.app/start/prerequisites/"
            className="text-accent-emphasis hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tauri prerequisites
          </a>{' '}
          (Rust, system dependencies) plus Node.js.
        </p>
        <CodeBlock>{`git clone https://github.com/isaacs-12/vibehub.git
cd vibehub/packages/desktop
npm install
npm run tauri dev`}</CodeBlock>
        <p>
          For a production build:
        </p>
        <CodeBlock>{`npm run tauri build`}</CodeBlock>
        <p>
          The built app will be in{' '}
          <Code>packages/desktop/src-tauri/target/release/bundle/</Code>.
        </p>
      </Section>

      <Section title="Connecting to VibeHub">
        <p>
          On first launch, VibeStudio will prompt you to sign in. This opens
          your browser for Google OAuth, then redirects back to the app.
        </p>
        <p>
          Once signed in, you can clone any project you have access to. The
          connection config is stored in <Code>.vibe/remote.json</Code>:
        </p>
        <CodeBlock>{`{
  "owner": "your-handle",
  "repo": "my-project",
  "webUrl": "https://getvibehub.com"
}`}</CodeBlock>
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
