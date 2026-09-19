/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        risk: {
          high: "#991b1b",
          medium: "#92400e",
          low: "#166534",
        },
      },
      fontFamily: {
        // Inter for the Latin UI; the Noto Sans family backs the Indic
        // scripts (Devanagari/Tamil/Telugu/Bengali) so glyphs fall through
        // to a matching script font.
        sans: [
          "Inter",
          "Noto Sans",
          "Noto Sans Devanagari",
          "Noto Sans Tamil",
          "Noto Sans Telugu",
          "Noto Sans Bengali",
          "system-ui",
          "-apple-system",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
