/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        token: "0 12px 30px rgba(0, 0, 0, 0.38), inset 0 0 0 1px rgba(246, 201, 121, 0.18)",
      },
      colors: {
        ember: {
          50: "#fff6dc",
          100: "#fbe7b0",
          200: "#e9c476",
          300: "#c99641",
          400: "#9c6c2b",
          500: "#65441f",
        },
        ink: {
          900: "#100b13",
          850: "#171019",
          800: "#211521",
          700: "#2f1f2f",
        },
        veil: {
          500: "#315d63",
          600: "#264c55",
        },
      },
    },
  },
  plugins: [],
};

