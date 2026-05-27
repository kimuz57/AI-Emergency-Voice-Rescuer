import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class', // 🟢 เพิ่มบรรทัดนี้ เพื่อบอกให้ Tailwind สลับธีมด้วย Class
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;