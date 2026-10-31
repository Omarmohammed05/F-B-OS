/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        card: '20px',
        field: '12px',
        sheet: '28px',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'IBM Plex Sans Arabic',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
