# schedU — Marketing Site

The public marketing site for **schedU**, an AI-powered timetable scheduling SaaS for any institution — schools, colleges, universities, coaching institutes, and training centres. Built with Next.js 15 (App Router), TypeScript, Tailwind CSS v4, and shadcn/ui-style components.

This repo is **marketing only** — it contains no authentication or product logic. All "Start Free Trial" / "Login" links point to the schedU application (`NEXT_PUBLIC_APP_URL`).

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript strict mode)
- **Tailwind CSS v4** (`@tailwindcss/postcss`) + shadcn/ui-style primitives
- **next-mdx-remote** for the MDX-powered blog (`/content/blog/*.mdx`)
- **@vercel/analytics** for traffic insights
- Native Next metadata routes for SEO (`app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional — sensible defaults are baked in)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
# → http://localhost:3000

# 4. Production build
npm run build
npm run start
```

## Environment variables

| Variable              | Required | Default                       | Description                                                        |
| --------------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL` | No       | `https://schedu.bhusku.com`   | Base URL of the schedU app. Drives start/login/demo links.     |

The "Start free" link resolves to `${NEXT_PUBLIC_APP_URL}/wizard` and login to `${NEXT_PUBLIC_APP_URL}/login`. Because it is prefixed with `NEXT_PUBLIC_`, it is inlined at build time — set it before building for each environment.

## Project structure

```
smartsched-web/
├── app/
│   ├── layout.tsx              # Root layout: Inter font, analytics, metadata defaults
│   ├── page.tsx                # Landing page (+ SoftwareApplication JSON-LD)
│   ├── pricing/page.tsx        # Pricing + monthly/annual toggle + comparison table
│   ├── features/page.tsx       # Full feature sections
│   ├── blog/
│   │   ├── page.tsx            # Blog index
│   │   └── [slug]/page.tsx     # MDX post renderer (+ BlogPosting JSON-LD)
│   ├── sitemap.ts              # Dynamic sitemap (static routes + blog slugs)
│   ├── robots.ts               # robots.txt (references sitemap)
│   ├── opengraph-image.tsx     # Generated 1200×630 OG image (PNG via next/og)
│   ├── icon.svg                # Favicon
│   └── not-found.tsx           # 404
├── components/
│   ├── layout/                 # Navbar, Footer, Logo
│   ├── landing/                # Hero, Features, HowItWorks, Testimonials, Pricing, CTA
│   ├── ui/                     # Button, Card (shadcn-style)
│   ├── PricingCards.tsx        # Shared pricing tier cards
│   └── PricingPageClient.tsx   # Client billing toggle + comparison table
├── content/blog/               # MDX blog posts
├── lib/
│   ├── mdx.ts                  # Blog loader (frontmatter + reading time)
│   ├── marketing-data.ts       # Features, steps, testimonials, pricing tiers
│   ├── site.ts                 # Site constants + app URLs
│   └── utils.ts                # cn() helper
└── public/                     # Logo
```

## SEO

- `generateMetadata` / static `metadata` on every page (title, description, Open Graph, Twitter card, canonical).
- `metadataBase = https://schedu.bhusku.com` set in the root layout.
- JSON-LD `SoftwareApplication` on the landing page; `BlogPosting` on each post.
- Dynamic `app/sitemap.ts` includes all static routes plus every blog slug.
- `app/robots.ts` allows all crawlers and points to the sitemap.
- Real PNG Open Graph image generated at build via `app/opengraph-image.tsx`.
- Semantic HTML with one `<h1>` per page, proper heading hierarchy, and `aria-label`s on CTAs.
- Fonts via `next/font/google` and reserved image dimensions to avoid layout shift (good CLS).

> **Note on `next-sitemap`:** the original spec listed both a dynamic `app/sitemap.ts` and `next-sitemap`. These collide — `next-sitemap` writes `public/sitemap.xml`, which conflicts with the `/sitemap.xml` route produced by `app/sitemap.ts` and breaks the build. This project uses Next's native metadata routes (`app/sitemap.ts` + `app/robots.ts`) instead, which is the modern, build-safe approach and produces the same output.

## Adding a blog post

Create a new `.mdx` file in `content/blog/` with frontmatter:

```mdx
---
title: "Your post title"
description: "One-sentence summary used for SEO and the index card."
date: "2026-06-18"
author: "Your Name"
tags: ["scheduling"]
---

Your MDX content here.
```

The slug is the filename. Reading time, the blog index card, and the sitemap entry are generated automatically.

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com/new), **Import** the project and select the `smartsched-web` directory as the root.
3. Vercel auto-detects Next.js — no build settings needed (`npm run build`, output handled automatically).
4. Add the environment variable **`NEXT_PUBLIC_APP_URL`** (e.g. `https://schedu.bhusku.com`) under **Settings → Environment Variables**.
5. Set your production domain to `schedu.bhusku.com` so the sitemap, robots, and canonical URLs resolve correctly. If you use a different domain, update `SITE_URL` in `lib/site.ts`.
6. Deploy. Vercel Analytics is wired up via `@vercel/analytics` and activates automatically on Vercel.

## Scripts

| Script          | Description                       |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the dev server              |
| `npm run build` | Production build                  |
| `npm run start` | Serve the production build        |
| `npm run lint`  | Run Next.js ESLint                |
