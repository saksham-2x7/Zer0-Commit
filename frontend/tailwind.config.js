/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        risk: {
          high: "#b91c1c",
          medium: "#b45309",
          low: "#15803d",
        },
      },
    },
  },
  plugins: [],
};
