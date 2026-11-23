/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Hind Siliguri"', 'system-ui', 'sans-serif'],
      },
      colors: {
        sanzar: {
          emerald: '#176B4B',
          jade: '#247754',
          forest: '#12392A',
          success: '#19B46B',
          warning: '#F5A524',
          danger: '#EF4444',
          gold: '#C6A46A',
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          surface2: 'var(--surface2)',
          text: 'var(--text)',
          text2: 'var(--text2)',
          muted: 'var(--muted)',
          border: 'var(--border)',
          primary: 'var(--primary)',
          onPrimary: 'var(--on-primary)',
          primarySoft: 'var(--primary-soft)',
        },
        subject: {
          math: '#3D6BFF',
          physics: '#3E8092',
          chemistry: '#D97A3E',
          biology: '#258A5C',
          english: '#D95D72',
          ict: '#1A86A0',
          bangla: '#B28A45',
          others: '#66786D',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0B523B 0%, #146C4D 55%, #247754 100%)',
        'hero-gradient': 'linear-gradient(135deg, #0B1D14 0%, #12402D 55%, #1D6044 100%)',
      },
    },
  },
  plugins: [],
};
