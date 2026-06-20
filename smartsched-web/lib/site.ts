/** Site-wide constants shared across pages, metadata, and the sitemap. */

export const SITE_URL = "https://schedu.bhusku.com";

// App entry points. The product is served from the same origin as the
// marketing site. Overridable at build time via NEXT_PUBLIC_APP_URL.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://schedu.bhusku.com";
export const REGISTER_URL = `${APP_URL}/wizard`; // "Start free" → timetable wizard
export const LOGIN_URL = `${APP_URL}/login`;
export const DEMO_URL = `${APP_URL}/demo`;

export const siteConfig = {
  name: "schedU",
  title: "schedU — AI Timetable Scheduling for Any Institution",
  description:
    "schedU uses AI to auto-generate conflict-free timetables for any institution — schools, colleges, universities, and beyond — saving weeks of manual scheduling work.",
  url: SITE_URL,
  twitter: "@schedu",
} as const;

export const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
] as const;
