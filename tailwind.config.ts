import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#10b981',
          600: '#059669'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
