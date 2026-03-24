/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          900: "#0f1115",
          800: "#161a22",
          700: "#212733"
        }
      }
    }
  },
  plugins: []
};
