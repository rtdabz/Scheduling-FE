/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'animate-toastIn',
    'animate-toastOut',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#7B1113',
          dark:    '#560b0d',
          light:   '#9e1518',
        },
        accent: {
          DEFAULT: '#C9952A',
          light:   '#F5C842',
        },
        sidebar: {
          DEFAULT: '#1C0507',
          text: '#E8D5C4',
        },
        parchment: '#F7F4F0',
        surface: '#FFFFFF',
        text: '#1A1410',
        muted: '#7A6E67',
        border: '#E2D9D0',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%':      { transform: 'translateY(-20px) rotate(5deg)' },
          '66%':      { transform: 'translateY(10px) rotate(-3deg)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        slideInLeft: {
          '0%':   { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        fadeInUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        float:        'float 8s ease-in-out infinite',
        'float-slow': 'float 12s ease-in-out infinite reverse',
        'float-med':  'float 10s ease-in-out infinite 2s',
        shimmer:      'shimmer 3s linear infinite',
        slideInLeft:  'slideInLeft 0.3s ease-out',
        fadeInUp:     'fadeInUp 0.5s ease-out',
      },
    },
  },
  plugins: [],
}
