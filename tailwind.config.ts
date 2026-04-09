import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#1D9E75",
        "primary-dark": "#0F1F1A",
        "primary-light": "#162E2A",
        "primary-mid": "#5DCAA5",
        background: "#0A0D0F",
        "card-bg": "#131618",
        "card-border": "#26292B",
        elevated: "#1C2025",
        "text-primary": "#F0F0F0",
        "text-secondary": "#8A8F98",
        "text-muted": "#4A4F58",
        warning: "#EF9F27",
        "warning-surface": "#1C1608",
        danger: "#E05252",
        "danger-surface": "#1A0D0D",
        success: "#1D9E75",
      },
    },
  },
  plugins: [],
};
export default config;
