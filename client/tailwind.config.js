/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'mtg-white': '#F9FAF4',
        'mtg-blue': '#0E68AB',
        'mtg-black': '#150B00',
        'mtg-red': '#D3202A',
        'mtg-green': '#00733E',
        'mtg-gold': '#C8A951',
      },
    },
  },
  plugins: [],
};
