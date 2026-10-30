/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // "Parchment & Ink" palette — aged paper, dark ink, oxblood seal.
      colors: {
        paper:    { DEFAULT: '#f3ecdc', 2: '#eadfc8' },
        panel:    { DEFAULT: '#fbf6ea', 2: '#f0e7d2' },
        line:     { DEFAULT: '#cdbd9a', 2: '#b89f6e' },
        ink:      { DEFAULT: '#2a2117', 2: '#5a4b36' },
        muted:    '#8a7a5e',
        accent:   { DEFAULT: '#9b2c23', hover: '#7f221b', fg: '#fff6ea' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:    ['Lora', 'Georgia', 'serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-14px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        float:       'float 6s ease-in-out infinite',
        'float-slow':'float-slow 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
