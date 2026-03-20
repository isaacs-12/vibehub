import React, { useEffect, useState } from 'react';
import appIcon from '../assets/icon.png';

interface Props {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState('');

  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('get_app_version').then(setVersion).catch(() => setVersion('unknown'));
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface-overlay border border-surface-border rounded-lg shadow-xl w-80 p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <img src={appIcon} alt="VibeStudio" className="w-16 h-16 rounded-2xl" />
        </div>

        <h2 className="text-lg font-semibold text-gray-100">VibeStudio</h2>
        <p className="text-xs text-muted mt-1">Version {version || '…'}</p>

        <p className="text-xs text-muted mt-4 leading-relaxed">
          Spec-first desktop editor for VibeHub.
          <br />
          Define features as markdown specs, compile them into working code.
        </p>

        <div className="mt-4 pt-4 border-t border-surface-border">
          <p className="text-[10px] text-muted">
            &copy; {new Date().getFullYear()} VibeHub. All rights reserved.
          </p>
          <p className="text-[10px] text-muted mt-1">
            Built with Tauri + React
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 px-4 py-1.5 text-xs rounded bg-surface border border-surface-border text-gray-200 hover:bg-surface-raised transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
