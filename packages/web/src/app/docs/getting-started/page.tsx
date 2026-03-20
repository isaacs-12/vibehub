export default function GettingStartedPage() {
  return (
    <div className="docs-content">
      <h1 className="text-3xl font-bold text-fg mb-2">Getting Started</h1>
      <p className="text-fg-muted mb-8">
        Set up your first VibeHub project in a few minutes.
      </p>

      <Section title="What is VibeHub?">
        <p>
          VibeHub is a spec-first development platform. Instead of writing code
          and documenting it afterward, you write feature specs in plain English
          and let an AI compiler generate the implementation.
        </p>
        <p>
          Your specs live in a <Code>.vibe/</Code> directory inside your
          project. They are version-controlled, reviewable, and portable &mdash;
          just like code, but readable by anyone.
        </p>
      </Section>

      <Section title="1. Install the CLI">
        <p>
          The <Code>vibe</Code> CLI initializes projects, runs the compiler, and
          syncs with VibeHub.
        </p>
        <CodeBlock>{`# macOS / Linux
curl -fsSL https://getvibehub.com/install.sh | sh`}</CodeBlock>
        {/* Build-from-source instructions will be added once the repo is public. */}
      </Section>

      <Section title="2. Initialize a project">
        <CodeBlock>{`mkdir my-app && cd my-app
vibe init my-app`}</CodeBlock>
        <p>This creates a <Code>.vibe/</Code> directory with starter files:</p>
        <CodeBlock>{`.vibe/
├── meta.json          # Project name, version
├── project.json       # Build/dev/test commands
├── features/
│   └── overview.md    # Your first feature spec
└── requirements/      # Tech stack & constraints`}</CodeBlock>
      </Section>

      <Section title="3. Write a feature spec">
        <p>
          Feature specs are markdown files with YAML frontmatter. Open{' '}
          <Code>.vibe/features/overview.md</Code> and describe what your app
          should do:
        </p>
        <CodeBlock>{`---
Uses: []
Data: [User, Task]
Never:
  - Allow unauthenticated access to tasks
Connects: []
---

# Task Management

## What it does
Users can create, edit, and delete tasks. Each task has a
title, description, due date, and status (todo, in-progress, done).

## Behavior
- Tasks are scoped to the authenticated user
- Overdue tasks are highlighted in the UI
- Completing a task moves it to the bottom of the list

## Acceptance criteria
- User can create a task and see it in their list
- Changing status updates the UI immediately
- Deleting a task requires confirmation`}</CodeBlock>
      </Section>

      <Section title="4. Compile">
        <p>
          Run the compiler to generate code from your specs. You&apos;ll need a
          Gemini API key:
        </p>
        <CodeBlock>{`export GEMINI_API_KEY=your-key-here
vibe compile`}</CodeBlock>
        <p>
          The compiler runs four phases: code generation, type checking, tests,
          and requirement validation. You&apos;ll see a report at the end showing
          what was generated and whether it passes.
        </p>
      </Section>

      <Section title="5. Push to VibeHub">
        <p>
          Create an account at{' '}
          <a href="/" className="text-accent-emphasis hover:underline">
            getvibehub.com
          </a>{' '}
          and create a project through the web UI. Then clone it locally:
        </p>
        <CodeBlock>{`vibe clone your-handle/my-app`}</CodeBlock>
        <p>
          Your specs sync between VibeStudio (desktop), the CLI, and VibeHub
          (web). Changes you push appear as reviewable updates on the web.
        </p>
      </Section>

      <Section title="Local config files">
        <p>
          When you clone a project or connect VibeStudio to VibeHub, a few
          local config files are created inside your <Code>.vibe/</Code>{' '}
          directory:
        </p>
        <DefinitionList
          items={[
            {
              term: 'remote.json',
              definition:
                'Stores the connection to VibeHub: your owner handle, repo name, and the web URL. Created automatically by vibe clone or when you connect VibeStudio.',
            },
            {
              term: 'project.json',
              definition:
                'Build manifest — language, framework, and commands for install, dev, build, and test. Used by both the CLI compiler and VibeStudio.',
            },
            {
              term: 'meta.json',
              definition:
                'Project name, creation date, and version. Created by vibe init.',
            },
          ]}
        />
        <p>
          Authentication tokens for the desktop app are stored securely in your
          system&apos;s local storage (managed by VibeStudio). The CLI uses{' '}
          <Code>VIBEHUB_WEB_URL</Code> to know where to connect. All API
          requests from the desktop app and CLI use bearer token authentication,
          and the server verifies project ownership before allowing any writes.
        </p>
      </Section>

      <Section title="Next steps">
        <ul className="list-disc list-inside space-y-1 text-sm text-fg-muted">
          <li>
            Read about{' '}
            <a href="/docs/concepts" className="text-accent-emphasis hover:underline">
              core concepts
            </a>{' '}
            like specs, snapshots, and lineage
          </li>
          <li>
            Set up{' '}
            <a href="/docs/vibestudio" className="text-accent-emphasis hover:underline">
              VibeStudio
            </a>{' '}
            for a local editing experience
          </li>
          <li>
            See the full{' '}
            <a href="/docs/cli" className="text-accent-emphasis hover:underline">
              CLI reference
            </a>
          </li>
        </ul>
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

function DefinitionList({ items }: { items: { term: string; definition: string }[] }) {
  return (
    <dl className="space-y-2">
      {items.map(({ term, definition }) => (
        <div key={term} className="flex gap-2 text-sm">
          <dt className="shrink-0 font-medium text-fg w-28">{term}</dt>
          <dd className="text-fg-muted">{definition}</dd>
        </div>
      ))}
    </dl>
  );
}
