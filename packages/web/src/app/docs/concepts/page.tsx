export default function ConceptsPage() {
  return (
    <div className="docs-content">
      <h1 className="text-3xl font-bold text-fg mb-2">Concepts</h1>
      <p className="text-fg-muted mb-8">
        The core ideas behind spec-first development.
      </p>

      <Section title="Feature Specs">
        <p>
          A feature spec is a markdown file that describes <em>what</em> a piece
          of your software should do, without prescribing <em>how</em>. Specs
          live in <Code>.vibe/features/</Code> and are the source of truth for
          your project.
        </p>
        <p>Each spec has YAML frontmatter with structured metadata:</p>
        <DefinitionList
          items={[
            {
              term: 'Uses',
              definition:
                'Dependencies on other features. Controls compilation order (topological sort).',
            },
            {
              term: 'Data',
              definition:
                'Data entities this feature touches (e.g., User, Task). Helps the compiler understand the data model.',
            },
            {
              term: 'Never',
              definition:
                'Hard constraints the compiler must respect. These are treated as invariants during code generation.',
            },
            {
              term: 'Connects',
              definition:
                'External integrations this feature depends on (e.g., Stripe, Google Sheets). References integration specs in .vibe/integrations/. VibeStudio can generate these for you.',
            },
          ]}
        />
        <p>
          The body of the spec uses free-form markdown: what the feature does,
          its behavior rules, and acceptance criteria. Write for a human reader
          &mdash; the AI compiler understands natural language.
        </p>
      </Section>

      <Section title="The .vibe Directory">
        <p>
          Every VibeHub project has a <Code>.vibe/</Code> directory at its root.
          This is where all spec-level information lives:
        </p>
        <DefinitionList
          items={[
            {
              term: 'meta.json',
              definition: 'Project name, creation date, and version.',
            },
            {
              term: 'project.json',
              definition:
                'Build manifest — language, framework, and commands for install, dev, build, and test.',
            },
            {
              term: 'features/',
              definition:
                'Feature spec markdown files. Supports nested directories for grouping.',
            },
            {
              term: 'requirements/',
              definition:
                'YAML files defining tech stack, infrastructure, and environment constraints.',
            },
            {
              term: 'mapping.json',
              definition:
                'Maps each feature spec to its corresponding source file globs. Updated during compilation.',
            },
            {
              term: 'remote.json',
              definition:
                'Remote connection config — links this local project to a VibeHub project for push/pull. See Remote Config below.',
            },
          ]}
        />
      </Section>

      <Section title="Remote Config">
        <p>
          The <Code>.vibe/remote.json</Code> file links a local project to its
          VibeHub counterpart. It&apos;s what enables push and pull between your
          machine and the web.
        </p>
        <CodeBlock>{`{
  "owner": "your-handle",
  "repo": "my-project",
  "webUrl": "https://getvibehub.com"
}`}</CodeBlock>
        <p>
          <strong className="text-fg">How it gets created:</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-fg-muted">
          <li>
            <strong className="text-fg">vibe clone</strong> &mdash; automatically
            created with the correct owner, repo, and web URL.
          </li>
          <li>
            <strong className="text-fg">VibeStudio</strong> &mdash; created when
            you connect an existing local project to a VibeHub project through
            the app.
          </li>
          <li>
            <strong className="text-fg">Manually</strong> &mdash; you can create
            this file yourself if you initialized with{' '}
            <Code>vibe init</Code> and later created a matching project on
            VibeHub. Just set <Code>owner</Code> to your VibeHub handle and{' '}
            <Code>repo</Code> to the project name.
          </li>
        </ul>
        <p>
          The <Code>owner</Code> field must match the authenticated user when
          pushing. The server rejects writes where the bearer token&apos;s user
          doesn&apos;t match the project owner &mdash; editing{' '}
          <Code>remote.json</Code> to point at someone else&apos;s project
          won&apos;t grant write access.
        </p>
      </Section>

      <Section title="Compilation">
        <p>
          Compilation is the process of turning specs into working code. The
          compiler runs in four phases:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-fg-muted">
          <li>
            <strong className="text-fg">Code generation</strong> &mdash; An AI
            model reads each feature spec plus existing source files and
            generates or updates the implementation.
          </li>
          <li>
            <strong className="text-fg">Type checking</strong> &mdash; Runs{' '}
            <Code>tsc --noEmit</Code> (or equivalent) to catch type errors in
            the generated code.
          </li>
          <li>
            <strong className="text-fg">Tests</strong> &mdash; Auto-detects and
            runs your test suite (Vitest, Jest, pytest, Go test, etc.).
          </li>
          <li>
            <strong className="text-fg">Requirement validation</strong> &mdash;
            AI scores each feature 0&ndash;100 against its spec. Below 75 is
            flagged.
          </li>
        </ol>
        <p>
          You can compile locally via the CLI (<Code>vibe compile</Code>) or
          trigger a cloud compile from the VibeHub web UI. Cloud compiles use a
          two-phase agentic loop that can iterate up to 25 times to fix issues.
        </p>
      </Section>

      <Section title="Snapshots">
        <p>
          A snapshot is an immutable capture of all your feature specs at a point
          in time. Snapshots are created automatically when you:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-fg-muted">
          <li>Merge an update (PR)</li>
          <li>Edit a feature on the web</li>
          <li>Create or fork a project</li>
        </ul>
        <p>
          Each snapshot can be compiled independently. This means you can
          recompile an older version of your specs with a newer model, or compare
          outputs across models for the same spec version.
        </p>
      </Section>

      <Section title="Updates (Pull Requests)">
        <p>
          Updates are VibeHub&apos;s equivalent of pull requests, but at the spec
          level. When someone proposes a change, the diff shows intent changes in
          plain English &mdash; not code changes.
        </p>
        <p>
          Each update includes implementation proofs: the AI-generated code that
          would result from the spec change. Reviewers can evaluate whether the
          intent is right without reading implementation details.
        </p>
        <p>
          If specs have been modified on both sides, VibeHub detects conflicts
          and offers AI-assisted resolution at the spec level.
        </p>
      </Section>

      <Section title="Lineage & Forking">
        <p>
          Any public project on VibeHub can be forked. Forks maintain lineage
          &mdash; a link back to the original snapshot they were created from.
        </p>
        <p>
          Lineage tracking enables two things: understanding where a project came
          from, and pulling upstream spec changes into your fork. This works at
          the spec level, not the code level, so even projects compiled with
          different models can share spec improvements.
        </p>
      </Section>

      <Section title="Model Selection">
        <p>
          VibeHub is model-agnostic. You choose which AI model compiles your
          specs. Currently supported:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-fg-muted">
          <li>Gemini (default for CLI)</li>
          <li>Claude (available for cloud compiles)</li>
        </ul>
        <p>
          Model selection is per-project and can be changed in project settings.
          Different models may produce different implementations from the same
          spec &mdash; that&apos;s expected and useful for comparison.
        </p>
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
