import type { Config } from "tailwindcss";

// Tailwind CSS v4 resolves theme tokens from `app/globals.css` (@theme).
// This file is referenced via the `@config` directive in globals.css and
// holds content globs + dark-mode strategy for editor/tooling support.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx,md,mdx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
};

export default config;
