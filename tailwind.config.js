/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // K-level badge colors (K1-K6 in ObjectivesModule)
    { pattern: /bg-(sky|teal|emerald|amber|orange|rose)-(100|200)/ },
    { pattern: /text-(sky|teal|emerald|amber|orange|rose)-700/ },
    { pattern: /border-(sky|teal|emerald|amber|orange|rose)-200/ },
    // Domain card colors
    { pattern: /bg-(blue|green|pink|purple)-50/ },
    { pattern: /text-(blue|green|pink|purple)-800/ },
    { pattern: /border-(blue|green|pink|purple)-200/ },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
