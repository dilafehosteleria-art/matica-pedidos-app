import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        matica: {
          green: "#145c3a",
          leaf: "#4f8f62",
          mint: "#ecf7ef",
          lime: "#d8ef7f",
          ink: "#18211c",
          soft: "#f7f8f5",
          line: "#dce6db",
          amber: "#f4b65d"
        }
      },
      boxShadow: {
        soft: "0 18px 45px rgba(24, 33, 28, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
