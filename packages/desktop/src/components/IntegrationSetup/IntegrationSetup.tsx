import React, { useState } from 'react';
import { Loader2, Plug, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

interface GeneratedIntegration {
  service_name: string;
  content: string;       // full .md file: frontmatter + prose
  empty_fields: string[]; // env var names the user must supply
}

interface Props {
  projectRoot: string;
  onClose: () => void;
  onSaved: (serviceName: string) => void;
}

export default function IntegrationSetup({ projectRoot, onClose, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedIntegration | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    if (!description.trim() || generating) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<GeneratedIntegration>('generate_integration', {
        root: projectRoot,
        description,
      });
      setResult(res);
      const initial: Record<string, string> = {};
      for (const f of res.empty_fields) initial[f] = '';
      setEnvValues(initial);
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!result || saving) return;
    setSaving(true);
    setError('');
    try {
      // Inject user-supplied env values into the content (replace empty quoted strings)
      let content = result.content;
      for (const [key, value] of Object.entries(envValues)) {
        if (value.trim()) {
          // Replace `KEY: ""` or `KEY: ''` with the actual value
          content = content.replace(
            new RegExp(`(${key}:\\s*)["']["']`, 'g'),
            `$1"${value.trim()}"`,
          );
        }
      }
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_integration_file', {
        root: projectRoot,
        serviceName: result.service_name,
        content,
      });
      onSaved(result.service_name);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-surface-border bg-surface-raised flex flex-col max-h-[70%] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
          <Plug size={13} className="text-accent-light" />
          Generate Integration
        </div>
        <button onClick={onClose} className="text-muted hover:text-gray-200">
          <X size={13} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {!result && (
          <>
            <p className="text-xs text-muted">
              Describe what you want to connect to. We'll generate an integration spec your features can reference via <code className="text-accent-light">Connects:</code>.
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }
              }}
              placeholder="e.g. Google Sheets to read and write rows, Stripe for payments"
              rows={3}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent placeholder:text-muted"
            />
            <button
              onClick={generate}
              disabled={!description.trim() || generating}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white text-sm transition-colors"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
              {generating ? 'Generating…' : 'Generate integration'}
            </button>
          </>
        )}

        {result && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-200">{result.service_name}</span>
              <button
                type="button"
                onClick={() => { setResult(null); setEnvValues({}); }}
                className="text-xs text-muted hover:text-gray-300"
              >
                ← Back
              </button>
            </div>

            {/* Env var fields */}
            {result.empty_fields.length > 0 ? (
              <>
                <p className="text-xs text-muted">Set your credentials (stored in the integration file):</p>
                <div className="space-y-2">
                  {result.empty_fields.map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-muted mb-0.5 font-mono">{field}</label>
                      <input
                        type={/secret|key|token|password/i.test(field) ? 'password' : 'text'}
                        value={envValues[field] ?? ''}
                        onChange={(e) => setEnvValues((p) => ({ ...p, [field]: e.target.value }))}
                        placeholder={`Enter ${field}…`}
                        className="w-full bg-surface border border-surface-border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent placeholder:text-muted font-mono"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">No credentials required. Ready to save.</p>
            )}

            {/* Spec preview */}
            <div className="border border-surface-border rounded overflow-hidden">
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted hover:text-gray-300 bg-surface"
              >
                <span>Preview spec</span>
                {previewExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {previewExpanded && (
                <pre className="px-3 py-2 text-xs text-gray-400 bg-surface overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {result.content}
                </pre>
              )}
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white text-sm transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : `Save .vibe/integrations/${result.service_name}.md`}
            </button>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
