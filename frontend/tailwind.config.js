/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ci-blue': '#1270db',
        'ci-blue-dark': '#0d55a8',
        'ci-blue-soft': '#e8f2ff',
        'ci-yellow': '#ffae00',
        'sidebar': '#18212f',
        'sidebar-hover': '#243248',
        'background-light': '#eef2f6',
      }
    },
  },
  plugins: [],
}
