import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0a0a",
        surface: "#141414",
        "surface-hover": "#1a1a1a",
        border: {
          DEFAULT: "#242424",
          strong: "#333333",
        },
        text: {
          primary: "#fafafa",
          secondary: "#a1a1aa",
          muted: "#6b6b6b",
        },
        accent: {
          DEFAULT: "#f97316",
          dim: "#7c3a10",
        },
        status: {
          "al-dia": "#22c55e",
          "al-dia-dim": "#0f3a20",
          pendientes: "#f59e0b",
          "pendientes-dim": "#4a3208",
          atrasado: "#ef4444",
          "atrasado-dim": "#4a1414",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
