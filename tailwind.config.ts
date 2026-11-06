import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        alpha: {
          black: "#08090A",
          panel: "#111315",
          line: "#282B2D",
          gold: "#D9B83F",
          muted: "#9A9DA0"
        }
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
