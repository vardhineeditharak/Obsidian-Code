/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '.dark'],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        surface: {
          DEFAULT: '#1E293B',
          hover: '#283548',
          active: '#334155',
          darker: '#0A0F1D',
          muted: '#182234',
        },
        border: 'rgba(255, 255, 255, 0.08)',
        'border-active': 'rgba(255, 255, 255, 0.16)',
        accent: {
          primary: '#3B82F6',
          'primary-hover': '#2563EB',
          secondary: '#6366F1',
          'secondary-hover': '#4F46E5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
