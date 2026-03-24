import React, { useState, useEffect } from 'react';
import { Play, Square, Settings, Package, Loader2, X, Save, Trash2, PenTool } from 'lucide-react';
import { useVibeStore } from '../../store/index.ts';
import type { ToolEntry, ToolConfig } from '../../store/index.ts';
import { useVibeProject } from '../../hooks/useVibeProject.ts';

export default function ToolsView() {
  const { tools, setTools, toolConfigs, setToolConfig, setAppMode } = useVibeStore();
  const { openProject } = useVibeProject();
  const [runningTools, setRunningTools] = useState<Record<string, boolean>>({});
  const [configuring, setConfiguring] = useState<ToolEntry | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load tools from backend on mount
  useEffect(() => {
    loadTools();
  }, []);

  async function loadTools() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const entries = await invoke<ToolEntry[]>('list_tools');
      setTools(entries);
      // Load configs for all tools
      for (const tool of entries) {
        try {
          const config = await invoke<Record<string, string>>('read_tool_config', { root: tool.root });
          setToolConfig(tool.root, config);
        } catch {
          // No config yet — that's fine
        }
      }
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  }

  async function handleRun(tool: ToolEntry) {
    setRunningTools((prev) => ({ ...prev, [tool.root]: true }));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('run_project', { root: tool.root });
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: `Run ${tool.name}`, kind: 'error' });
    } finally {
      setRunningTools((prev) => ({ ...prev, [tool.root]: false }));
    }
  }

  async function handleStop(tool: ToolEntry) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_project');
    } catch {
      // Process already gone
    }
    setRunningTools((prev) => ({ ...prev, [tool.root]: false }));
  }

  function openConfigure(tool: ToolEntry) {
    const existing = toolConfigs[tool.root] ?? {};
    const values: Record<string, string> = {};
    for (const v of tool.variables) {
      values[v.name] = existing[v.name] ?? '';
    }
    setConfigValues(values);
    setConfiguring(tool);
  }

  async function handleSaveConfig() {
    if (!configuring) return;
    setSaving(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_tool_config', { root: configuring.root, config: configValues });
      setToolConfig(configuring.root, configValues);
      setConfiguring(null);
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Save Config', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTool(tool: ToolEntry) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(
      `Remove "${tool.name}" from your tools list?\n\nThis won't delete any files.`,
      { title: 'Remove Tool', kind: 'warning' },
    );
    if (!confirmed) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('unregister_tool', { root: tool.root });
      setTools(tools.filter((t) => t.root !== tool.root));
    } catch (err) {
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(String(err), { title: 'Remove Tool', kind: 'error' });
    }
  }

  async function handleEditTool(tool: ToolEntry) {
    await openProject(tool.root);
    setAppMode('editor');
  }

  if (tools.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted text-sm gap-3 px-8 text-center">
        <Package size={32} className="opacity-40" />
        <p>No tools yet.</p>
        <p className="text-xs">
          Open a project in <span className="text-accent-light">Editor</span> mode, write feature specs, and hit <span className="text-accent-light">Vibe</span> to compile your first tool.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Your Tools</h2>
        <span className="text-xs text-muted">{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map((tool) => {
          const running = runningTools[tool.root] ?? false;
          const config = toolConfigs[tool.root] ?? {};
          const missingVars = tool.variables.filter((v) => v.required && !config[v.name]?.trim());
          const needsSetup = missingVars.length > 0;

          return (
            <div
              key={tool.root}
              className="bg-surface-raised border border-surface-border rounded-lg p-4 flex flex-col gap-3 hover:border-accent/40 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-200 truncate">{tool.name}</h3>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{tool.description}</p>
                </div>
                <button
                  onClick={() => handleRemoveTool(tool)}
                  className="text-muted hover:text-red-400 transition-colors shrink-0 ml-2"
                  title="Remove from tools"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Tags & status */}
              <div className="flex flex-wrap gap-1.5">
                {tool.connects.map((c) => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/30 text-accent-light">
                    {c}
                  </span>
                ))}
                {needsSetup && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                    Setup needed
                  </span>
                )}
              </div>

              {/* Path */}
              <p className="text-[10px] text-muted font-mono truncate" title={tool.root}>
                {tool.root}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto pt-1">
                {running ? (
                  <button
                    onClick={() => handleStop(tool)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-500/50 text-red-400 hover:border-red-400 transition-colors"
                  >
                    <Square size={11} />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleRun(tool)}
                    disabled={needsSetup}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-40"
                    title={needsSetup ? 'Configure required variables first' : `Run ${tool.name}`}
                  >
                    <Play size={11} />
                    Run
                  </button>
                )}
                <button
                  onClick={() => openConfigure(tool)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
                    needsSetup
                      ? 'border-yellow-500/50 text-yellow-400 hover:border-yellow-400'
                      : 'border-surface-border text-muted hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  <Settings size={11} />
                  Configure
                </button>
                <button
                  onClick={() => handleEditTool(tool)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-surface-border text-muted hover:text-gray-200 hover:border-gray-500 transition-colors"
                  title="Edit specs in editor"
                >
                  <PenTool size={11} />
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Configure modal */}
      {configuring && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => !saving && setConfiguring(null)}
        >
          <div
            className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Configure {configuring.name}</h3>
                <p className="text-xs text-muted mt-0.5">Set the variables this tool needs to run.</p>
              </div>
              <button onClick={() => !saving && setConfiguring(null)} className="text-muted hover:text-gray-200">
                <X size={14} />
              </button>
            </div>

            {/* Variables */}
            <div className="p-4 space-y-3 overflow-y-auto">
              {configuring.variables.length === 0 ? (
                <p className="text-xs text-muted">This tool has no configurable variables.</p>
              ) : (
                configuring.variables.map((v) => (
                  <div key={v.name}>
                    <label className="flex items-center gap-1.5 text-xs text-muted mb-1">
                      <span className="font-mono font-medium text-gray-300">{v.name}</span>
                      {v.required && <span className="text-red-400">*</span>}
                    </label>
                    {v.description && (
                      <p className="text-[10px] text-muted mb-1">{v.description}</p>
                    )}
                    <input
                      type={/secret|key|token|password/i.test(v.name) ? 'password' : 'text'}
                      value={configValues[v.name] ?? ''}
                      onChange={(e) => setConfigValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={`Enter ${v.name}…`}
                      className="w-full bg-surface border border-surface-border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent placeholder:text-muted font-mono"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-border shrink-0">
              <button
                type="button"
                onClick={() => !saving && setConfiguring(null)}
                className="px-3 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
