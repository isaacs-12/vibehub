import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';

interface UpdateInfo {
  current: string;
  latest: string;
  update_available: boolean;
  release_url?: string;
  message?: string;
}

interface Props {
  onClose: () => void;
}

export default function UpdateCheckDialog({ onClose }: Props) {
  const [state, setState] = useState<'checking' | 'up-to-date' | 'update-available' | 'error'>('checking');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<UpdateInfo>('check_for_updates')
        .then((result) => {
          setInfo(result);
          setState(result.update_available ? 'update-available' : 'up-to-date');
        })
        .catch((err) => {
          setError(String(err));
          setState('error');
        });
    });
  }, []);

  async function openRelease() {
    if (!info?.release_url) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      // Use shell open to launch in default browser
      window.open(info.release_url, '_blank');
    } catch {
      window.open(info.release_url, '_blank');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-80 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-200 mb-4">Check for Updates</h2>

        {state === 'checking' && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            <span>Checking for updates…</span>
          </div>
        )}

        {state === 'up-to-date' && (
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <div>
              <p className="text-gray-200">You're up to date!</p>
              <p className="text-xs text-muted mt-0.5">
                VibeStudio {info?.current} is the latest version.
                {info?.message && <span className="block mt-1">{info.message}</span>}
              </p>
            </div>
          </div>
        )}

        {state === 'update-available' && (
          <div>
            <div className="flex items-start gap-3 text-sm">
              <Download size={16} className="text-accent-light shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-200">Update available!</p>
                <p className="text-xs text-muted mt-0.5">
                  A new version of VibeStudio is available.
                </p>
                <p className="text-xs mt-2">
                  <span className="text-muted">Current:</span>{' '}
                  <span className="text-gray-300 font-mono">{info?.current}</span>
                  <span className="text-muted mx-2">→</span>
                  <span className="text-accent-light font-mono">{info?.latest}</span>
                </p>
              </div>
            </div>
            {info?.release_url && (
              <button
                type="button"
                onClick={openRelease}
                className="mt-4 w-full px-4 py-2 text-xs rounded bg-accent text-white font-medium hover:bg-accent/80 transition-colors"
              >
                Download Update
              </button>
            )}
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-200">Could not check for updates</p>
              <p className="text-xs text-muted mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded border border-surface-border text-muted hover:text-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
