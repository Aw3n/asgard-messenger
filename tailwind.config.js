/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Asgard Brand Colors — CSS variable-driven (theme-aware)
        asgard: {
          black: 'rgb(var(--asgard-black) / <alpha-value>)',
          'deep-black': 'rgb(var(--asgard-deep-black) / <alpha-value>)',
          'surface': 'rgb(var(--asgard-surface) / <alpha-value>)',
          'surface-alt': 'rgb(var(--asgard-surface-alt) / <alpha-value>)',
          'border': 'rgb(var(--asgard-border) / <alpha-value>)',
          'border-alt': 'rgb(var(--asgard-border-alt) / <alpha-value>)',
          // Blues
          'glacier': 'rgb(var(--asgard-glacier) / <alpha-value>)',
          'glacier-dim': 'rgb(var(--asgard-glacier-dim) / <alpha-value>)',
          'nordic': 'rgb(var(--asgard-nordic) / <alpha-value>)',
          'nordic-light': 'rgb(var(--asgard-nordic-light) / <alpha-value>)',
          'nordic-deep': 'rgb(var(--asgard-nordic-deep) / <alpha-value>)',
          // Cyan
          'cyan': 'rgb(var(--asgard-cyan) / <alpha-value>)',
          'cyan-dim': 'rgb(var(--asgard-cyan-dim) / <alpha-value>)',
          'cyan-glow': 'rgb(var(--asgard-cyan-glow) / <alpha-value>)',
          // Accent
          'accent': 'rgb(var(--asgard-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--asgard-accent-hover) / <alpha-value>)',
          'accent-dim': 'rgb(var(--asgard-accent-dim) / <alpha-value>)',
          // Status
          'online': 'rgb(var(--asgard-online) / <alpha-value>)',
          'away': 'rgb(var(--asgard-away) / <alpha-value>)',
          'busy': 'rgb(var(--asgard-busy) / <alpha-value>)',
          'offline': 'rgb(var(--asgard-offline) / <alpha-value>)',
          // Text
          'text-primary': 'rgb(var(--asgard-text-primary) / <alpha-value>)',
          'text-secondary': 'rgb(var(--asgard-text-secondary) / <alpha-value>)',
          'text-muted': 'rgb(var(--asgard-text-muted) / <alpha-value>)',
          'text-dim': 'rgb(var(--asgard-text-dim) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
        display: ['Segoe UI Variable Display', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'xxs': '0.625rem',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        'mica': '0 8px 32px rgba(0, 0, 0, 0.6)',
        'glow': '0 0 20px rgba(var(--asgard-glacier) / 0.3)',
        'glow-sm': '0 0 10px rgba(var(--asgard-glacier) / 0.2)',
        'glow-cyan': '0 0 20px rgba(var(--asgard-cyan) / 0.3)',
        'inner-glow': 'inset 0 0 20px rgba(var(--asgard-glacier) / 0.05)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'modal': '0 20px 60px rgba(0, 0, 0, 0.8)',
        'tooltip': '0 4px 16px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'mica-gradient': 'linear-gradient(135deg, rgba(var(--asgard-nordic) / 0.08) 0%, rgba(var(--asgard-cyan) / 0.04) 100%)',
        'nordic-gradient': 'linear-gradient(135deg, rgb(var(--asgard-nordic-deep)) 0%, rgb(var(--asgard-nordic)) 50%, rgb(var(--asgard-nordic-light)) 100%)',
        'aurora': 'linear-gradient(135deg, rgba(var(--asgard-glacier) / 0.1) 0%, rgba(var(--asgard-cyan) / 0.05) 50%, rgba(var(--asgard-accent) / 0.08) 100%)',
        'card-gradient': 'linear-gradient(145deg, rgba(var(--asgard-text-primary) / 0.05) 0%, rgba(var(--asgard-text-primary) / 0.02) 100%)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'aurora-shift': 'auroraShift 8s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'typing': 'typing 1.4s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 10px rgba(var(--asgard-glacier) / 0.2)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 20px rgba(var(--asgard-glacier) / 0.5)' },
        },
        auroraShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        typing: {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-6px)' },
        },
      },
      spacing: {
        '18': '4.5rem',
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
      backdropBlur: {
        'xs': '2px',
        'mica': '60px',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Custom 'light' variant for theme switching
    function({ addVariant }) {
      addVariant('light', '.light &')
    },
  ],
}
