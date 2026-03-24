import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#C9963F',
          light: '#FDF3DC',
          mid: '#F5D78E',
          dark: '#8B6914',
        },
        'aop-dark': '#1A1A2E',
        'aop-navy': '#0D2B55',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      keyframes: {
        'price-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'price-pulse': 'price-pulse 1.5s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
