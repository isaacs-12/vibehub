import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e1e1e',
          raised: '#252526',
          overlay: '#2d2d2d',
          border: '#3e3e3e',
        },
        accent: { DEFAULT: '#7c3aed', light: '#a78bfa' },
        muted: '#6b7280',
      },
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
