/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#f6f4fd',
          100: '#ece8f9',
          200: '#dbd3f4',
          300: '#beaeeb',
          400: '#9b80df',
          500: '#7e57d1',
          600: '#583fa9', // LearnUp Core Brand Purple
          700: '#503795',
          800: '#3f2b7b',
          900: '#2c1e57',
          950: '#1e143d', // Deep Stage Purple
        },
        learnup: {
          primary: '#583FA9',
          dark: '#3F2B7B',
          deep: '#1E143D',
          surface: '#160D2E',
          lavender: '#ECE8F9',
          mint: '#10B981',
          mintSoft: '#D1FAE5',
          rose: '#F43F5E',
          amber: '#F59E0B',
          gold: '#FBBF24',
          sky: '#0EA5E9'
        }
      }
    },
  },
  plugins: [],
}
