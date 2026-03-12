import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0d1117',
          subtle: '#161b22',
          inset: '#010409',
        },
        border: {
          DEFAULT: '#30363d',
          muted: '#21262d',
        },
        fg: {
          DEFAULT: '#e6edf3',
          muted: '#7d8590',
          subtle: '#6e7681',
        },
        accent: {
          DEFAULT: '#7c3aed',
          emphasis: '#a78bfa',
          subtle: '#1a1040',
        },
        success: { DEFAULT: '#3fb950', subtle: '#0f2d18' },
        danger: { DEFAULT: '#f85149', subtle: '#2c1114' },
        attention: { DEFAULT: '#d29922', subtle: '#271d0b' },
      },
    },
  },
  plugins: [],
} satisfies Config;
