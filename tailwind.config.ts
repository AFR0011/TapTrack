import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
        'gradient-card': 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.7) 100%)',
      },
      keyframes: {
        'count-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'count-up': 'count-up 0.4s ease-out both',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      boxShadow: {
        glass: '0 4px 24px -4px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
        'glass-lg': '0 8px 40px -8px rgba(15,23,42,0.12), 0 2px 4px rgba(15,23,42,0.06)',
        highlight: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
