import React, { useState } from 'react';
import { Loader2, Plug, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

interface GeneratedIntegration {
  service_name: string;
  yaml: string;
  empty_fields: string[];
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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [yamlExpanded, setYamlExpanded] = useState(false);
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
      setFieldValues(initial);
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
      // Inject user-supplied values back into the YAML
      let yaml = result.yaml;
      for (const [key, value] of Object.entries(fieldValues)) {
        if (value.trim()) {
          yaml = yaml.replace(
            new RegExp(`(${key}:\\s*)""`, 'g'),
            `$1"${value.trim()}"`,
          );
        }
      }
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_integration_file', {
        root: projectRoot,
        serviceName: result.service_name,
        yamlContent: yaml,
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
        {/* Description input */}
        {!result && (
          <>
            <p className="text-xs text-muted">
              Describe what you want to connect to and we'll generate a config.
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }
              }}
              placeholder="e.g. Google Sheets integration to read and write rows"
              rows={3}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent placeholder:text-muted"
            />
            <button
              onClick={generate}
              disabled={!description.trim() || generating}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white text-sm transition-colors"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
              {generating ? 'Generating…' : 'Generate config'}
            </button>
          </>
        )}

        {/* Generated form */}
        {result && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-200">
                {result.service_name}
              </span>
              <button
                type="button"
                onClick={() => { setResult(null); setFieldValues({}); }}
                className="text-xs text-muted hover:text-gray-300"
              >
                ← Back
              </button>
            </div>

            {result.empty_fields.length > 0 ? (
              <>
                <p className="text-xs text-muted">Fill in your credentials:</p>
                <div className="space-y-2">
                  {result.empty_fields.map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-muted mb-0.5">{field}</label>
                      <input
                        type={field.toLowerCase().includes('secret') || field.toLowerCase().includes('key') || field.toLowerCase().includes('token') || field.toLowerCase().includes('password') ? 'password' : 'text'}
                        value={fieldValues[field] ?? ''}
                        onChange={(e) => setFieldValues((p) => ({ ...p, [field]: e.target.value }))}
                        placeholder={`Enter ${field}…`}
                        className="w-full bg-surface border border-surface-border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent placeholder:text-muted"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">No credentials required. Ready to save.</p>
            )}

            {/* YAML preview */}
            <div className="border border-surface-border rounded overflow-hidden">
              <button
                type="button"
                onClick={() => setYamlExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted hover:text-gray-300 bg-surface"
              >
                <span>Preview YAML</span>
                {yamlExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {yamlExpanded && (
                <pre className="px-3 py-2 text-xs text-gray-400 bg-surface overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {result.yaml}
                </pre>
              )}
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-40 rounded text-white text-sm transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : `Save .vibe/integrations/${result.service_name}.yaml`}
            </button>
          </>
        )}

        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}
