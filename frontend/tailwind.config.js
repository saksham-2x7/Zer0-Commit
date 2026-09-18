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
    },
  },
  plugins: [],
};
