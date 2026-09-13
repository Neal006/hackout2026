/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F9FAFB",
        surface: "#FFFFFF",
        border: "#E5E7EB",
        ink: "#111827",
        "ink-muted": "#6B7280",
        solar: "#98B62D",
        "grid-blue": "#008080",
        danger: "#008080",
        saved: "#98B62D",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        serif: ["Source Serif 4", "serif"],
      },
      boxShadow: {
        DEFAULT: "none",
        sm: "none",
        md: "none",
        lg: "none",
        xl: "none",
        "2xl": "none",
        inner: "none",
        none: "none",
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "2px",
        md: "4px",
        lg: "4px",
        xl: "4px",
        "2xl": "4px",
        "3xl": "4px",
        full: "4px",
      },
    },
  },
  plugins: [],
}
