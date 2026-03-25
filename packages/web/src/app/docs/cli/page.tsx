export default function CLIPage() {
  return (
    <div className="docs-content">
      <h1 className="text-3xl font-bold text-fg mb-2">CLI Reference</h1>
      <p className="text-fg-muted mb-8">
        The <Code>vibe</Code> command-line tool for managing VibeHub projects.
      </p>

      <Section title="Installation">
        <CodeBlock>{`# macOS / Linux
curl -fsSL https://getvibehub.com/install.sh | sh`}</CodeBlock>
        {/* Build-from-source instructions will be added once the repo is public. */}
      </Section>

      <CommandSection
        name="vibe init"
        usage="vibe init [name]"
        description="Initialize a new VibeHub project. Creates a .vibe/ directory with starter files including meta.json, project.json, and a template feature spec."
        flags={[{ flag: '-d, --dir', default: '.', description: 'Target directory' }]}
        example={`$ vibe init my-app
Created .vibe/ in ./my-app
  1 feature, 0 requirements`}
      />

      <CommandSection
        name="vibe clone"
        usage="vibe clone <owner/repo>"
        description="Clone a VibeHub project from the remote. Fetches all feature specs and requirements, and creates a remote.json for syncing."
        flags={[{ flag: '-d, --dir', default: '.', description: 'Parent directory' }]}
        example={`$ vibe clone ims/task-manager
Cloned ims/task-manager → ./ims-task-manager
  4 features, 1 requirement file`}
        notes={[
          'Fetches from VIBEHUB_WEB_URL (default: https://getvibehub.com)',
          'Creates .vibe/remote.json with connection config',
        ]}
      />

      <CommandSection
        name="vibe import"
        usage="vibe import"
        description="Extract feature specs from an existing codebase using AI. Analyzes your source code and generates .vibe/ feature files that describe what the code does."
        flags={[
          { flag: '-r, --repo', default: '.', description: 'Path to existing Git repository' },
          { flag: '-k, --api-key', default: '$GEMINI_API_KEY', description: 'Gemini API key' },
        ]}
        example={`$ vibe import --repo ./my-existing-project
Analyzing codebase...
Extracted 6 features, 2 requirement files`}
        notes={['Requires a Gemini API key', 'Best for TypeScript/JavaScript and Go codebases']}
      />

      <CommandSection
        name="vibe read"
        usage="vibe read"
        description="Print a summary of the project's vibes — features, requirements, and source mappings."
        flags={[{ flag: '-d, --dir', default: '.', description: 'Project directory' }]}
        example={`$ vibe read
my-app (v0.1.0)
  Features:
    auth.md          → src/auth/**
    dashboard.md     → src/dashboard/**
    payments.md      → src/payments/**, src/billing/**
  Requirements:
    tech-stack.yaml`}
      />

      <CommandSection
        name="vibe compile"
        usage="vibe compile"
        description="Compile feature specs into code, then validate. Runs a four-phase pipeline: code generation, type checking, tests, and requirement validation."
        flags={[
          { flag: '-d, --dir', default: '.', description: 'Project directory' },
          { flag: '-k, --api-key', default: '$GEMINI_API_KEY', description: 'Gemini API key' },
          { flag: '--json', default: 'false', description: 'Output as JSON (CompilationReport)' },
        ]}
        example={`$ vibe compile
Compiling 4 features...

Phase 1/4: Codegen
  ✓ auth.md → 3 files generated
  ✓ dashboard.md → 2 files generated
  • payments.md → unchanged

Phase 2/4: Typecheck
  ✓ No type errors

Phase 3/4: Tests
  ✓ 12 passed, 0 failed

Phase 4/4: Requirements
  auth.md         92/100
  dashboard.md    87/100
  payments.md     95/100

Status: success`}
        notes={[
          'Exit code 1 if status is "failed" (typecheck or test errors)',
          'Status "partial" means avg requirement score < 75',
          'Uses gemini-2.5-flash-lite by default',
        ]}
      />

      <CommandSection
        name="vibe check"
        usage="vibe check"
        description="Validate specs without generating code. Runs typechecking and tests against the existing codebase. Safe for CI pipelines."
        flags={[
          { flag: '-d, --dir', default: '.', description: 'Project directory' },
          { flag: '-k, --api-key', default: '$GEMINI_API_KEY', description: 'Gemini API key' },
        ]}
        example={`$ vibe check
Checking 4 features...
  ✓ Typecheck passed
  ✓ 12 tests passed

Status: success`}
        notes={[
          'Does not generate or modify any code',
          'Useful in CI to verify specs are still valid after changes',
        ]}
      />

      <CommandSection
        name="vibe updates"
        usage="vibe updates [subcommand] [flags]"
        description="Manage updates (pull requests) for your project from the command line. Requires authentication and a .vibe/remote.json to know which project to target."
        flags={[
          { flag: 'list', default: '(default)', description: 'List updates. Supports --status open|merged|closed' },
          { flag: 'close <id>', default: '', description: 'Close an open update without merging' },
          { flag: 'reopen <id>', default: '', description: 'Reopen a previously closed update' },
          { flag: 'retry <id>', default: '', description: 'Retry compilation for a failed update' },
          { flag: 'revert <id>', default: '', description: 'Create a revert update for a merged update' },
        ]}
        example={`$ vibe updates
Open updates:
  c2d4ef29  Add payment flow    2 features changed
  a81b3c02  Fix auth redirect   1 feature changed

$ vibe updates close c2d4ef
Closed update c2d4ef29

$ vibe updates --status merged
Merged updates:
  f19e8a31  Dashboard v2        3 features changed`}
        notes={[
          'Requires VIBEHUB_TOKEN for authentication',
          'Update IDs support prefix matching — "c2d4ef" works like the full UUID',
          'Reads .vibe/remote.json to determine the target project',
        ]}
      />

      <Section title="Environment Variables">
        <div className="space-y-2">
          <EnvVar name="GEMINI_API_KEY" description="API key for Gemini. Used by compile, check, and import commands." />
          <EnvVar name="VIBEHUB_TOKEN" description="Authentication token (JWT) for commands that talk to the VibeHub backend. Required by vibe updates." />
          <EnvVar name="VIBEHUB_WEB_URL" description="VibeHub web URL for clone/sync. Default: https://getvibehub.com" />
        </div>
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

function CommandSection({
  name,
  usage,
  description,
  flags,
  example,
  notes,
}: {
  name: string;
  usage: string;
  description: string;
  flags: { flag: string; default: string; description: string }[];
  example: string;
  notes?: string[];
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-fg mb-1 pb-2 border-b border-border">
        {name}
      </h2>
      <div className="space-y-3 text-sm text-fg-muted leading-relaxed">
        <CodeBlock>{usage}</CodeBlock>
        <p>{description}</p>

        {flags.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-fg-subtle">
                  <th className="pb-1 pr-4 font-medium">Flag</th>
                  <th className="pb-1 pr-4 font-medium">Default</th>
                  <th className="pb-1 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-fg-muted">
                {flags.map(({ flag, default: def, description: desc }) => (
                  <tr key={flag} className="border-t border-border">
                    <td className="py-1.5 pr-4">
                      <Code>{flag}</Code>
                    </td>
                    <td className="py-1.5 pr-4 text-fg-subtle">{def}</td>
                    <td className="py-1.5">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <p className="text-xs text-fg-subtle mb-1">Example:</p>
          <CodeBlock>{example}</CodeBlock>
        </div>

        {notes && notes.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-xs text-fg-subtle">
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
      </div>
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

function EnvVar({ name, description }: { name: string; description: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <Code>{name}</Code>
      <span className="text-fg-muted">{description}</span>
    </div>
  );
}
