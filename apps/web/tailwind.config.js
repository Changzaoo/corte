/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // X/Twitter "Lights Out" palette mapped onto the slate scale.
        slate: {
          50: '#ffffff',
          100: '#e7e9ea',
          200: '#d6d9db',
          300: '#a6abaf',
          400: '#8b9096',
          500: '#71767b',
          600: '#4d5155',
          700: '#3e4144',
          800: '#2f3336',
          850: '#16181c',
          925: '#0a0c0f',
          900: '#000000',
          950: '#000000',
        },
        primary: {
          50: '#e8f5fe', 100: '#d2ecfc', 200: '#a3d9f9', 300: '#6bc0f5',
          400: '#4ab3f4', 500: '#1d9bf0', 600: '#1a8cd8', 700: '#177cc0',
          800: '#1467a1', 900: '#114d78',
        },
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
          400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24', 500: '#eab308', 600: '#ca8a04', 700: '#a16207',
        },
        error: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
          400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['"TwitterChirp"', '-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px', letterSpacing: '0.2px' }],
        sm: ['13px', { lineHeight: '18px', letterSpacing: '0.1px' }],
        base: ['15px', { lineHeight: '20px', letterSpacing: '0px' }],
        lg: ['17px', { lineHeight: '24px', letterSpacing: '0px' }],
        xl: ['20px', { lineHeight: '26px', letterSpacing: '0px' }],
        '2xl': ['24px', { lineHeight: '30px', letterSpacing: '-0.2px' }],
        '3xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.5px' }],
        '4xl': ['36px', { lineHeight: '40px', letterSpacing: '-1px' }],
      },
      borderRadius: {
        xs: '4px', sm: '6px', base: '8px', md: '10px', lg: '14px', xl: '16px', '2xl': '24px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.3)',
        base: '0 2px 8px 0 rgba(0, 0, 0, 0.35)',
        md: '0 4px 16px 0 rgba(0, 0, 0, 0.4)',
        lg: '0 8px 24px 0 rgba(0, 0, 0, 0.45)',
        xl: '0 12px 32px 0 rgba(0, 0, 0, 0.5)',
        glow: '0 0 0 1px rgba(29, 155, 240, 0.2), 0 0 24px -4px rgba(29, 155, 240, 0.35)',
      },
      spacing: {
        xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px',
        '2xl': '32px', '3xl': '48px', '4xl': '64px',
      },
      keyframes: {
        shimmer: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(200%)' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        fadeInUp: 'fadeInUp 0.25s ease-out',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
