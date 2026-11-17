/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Arc Dark tokens. Hex values (not CSS variables) so opacity modifiers like bg-success/15 work.
      colors: {
        canvas: '#0d1b2f',
        surface: 'rgba(255, 255, 255, 0.07)',
        'surface-strong': 'rgba(255, 255, 255, 0.11)',
        'surface-muted': '#1f2f44',
        ink: '#f9faf3',
        'ink-2': '#e3ecf9',
        muted: '#cbd5e1',
        subtle: '#94a3b8',
        line: 'rgba(255, 255, 255, 0.12)',
        accent: '#acc6e9',
        'accent-hover': '#cbdbf2',
        success: '#8dd89f',
        danger: '#e86d7a',
        warn: '#f2c879',
      },
      fontFamily: {
        sans: ["'DM Sans'", 'sans-serif'],
        display: ["'Space Grotesk'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
