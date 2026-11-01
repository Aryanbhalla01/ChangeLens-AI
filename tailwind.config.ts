import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#080D19",
        sidebar: "#0B1220",
        surface: "#111B2D",
        elevated: "#162238",
        line: "#263449",
        muted: "#94A3B8",
        primary: "#3B82F6",
        cyan: "#22D3EE",
      },
      boxShadow: {
        panel: "0 16px 40px rgba(0, 0, 0, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
