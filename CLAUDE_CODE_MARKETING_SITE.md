# SmartSched Marketing Site — Claude Code Prompt

---

## Prompt (copy-paste into Claude Code)

```
Build a production-ready Next.js 15 marketing site for SmartSched — an AI-powered school timetable scheduling SaaS for K–12 institutions.

## Stack
- Next.js 15 App Router, TypeScript strict mode
- Tailwind CSS v4 + shadcn/ui components
- next-mdx-remote for blog (MDX files in /content/blog/)
- next-sitemap for sitemap + robots.txt
- Vercel Analytics (@vercel/analytics)

## Project structure
smartsched-web/
├── app/
│   ├── layout.tsx              # Root layout: font, analytics, metadata defaults
│   ├── page.tsx                # Landing page
│   ├── pricing/page.tsx
│   ├── features/page.tsx
│   ├── blog/
│   │   ├── page.tsx            # Blog index
│   │   └── [slug]/page.tsx     # MDX post renderer
│   └── sitemap.ts              # Dynamic sitemap
├── components/
│   ├── layout/Navbar.tsx       # Sticky, logo + nav links + "Start Free" CTA
│   ├── layout/Footer.tsx
│   ├── landing/Hero.tsx
│   ├── landing/Features.tsx
│   ├── landing/HowItWorks.tsx
│   ├── landing/Testimonials.tsx
│   ├── landing/Pricing.tsx
│   └── landing/CTA.tsx
├── content/blog/               # Sample MDX posts (create 2 stubs)
├── lib/mdx.ts                  # MDX loader util
├── public/                     # Logo, OG image placeholder
├── next.config.ts
├── next-sitemap.config.js
└── tailwind.config.ts

## Pages & content

### Landing (/)
Sections in order: Hero → Features (6 cards) → How It Works (3 steps) → Testimonials (3 quotes) → Pricing (3 tiers) → CTA banner
Hero headline: "Build Perfect School Timetables in Minutes"
Hero subtext: "SmartSched uses AI to auto-generate conflict-free schedules for any K–12 school — saving weeks of manual work."
Primary CTA: "Start Free Trial" → https://app.smartsched.com/register
Secondary CTA: "See How It Works" → #how-it-works

Features (6 cards):
1. AI Auto-Schedule — Generate complete timetables in one click
2. Conflict Detection — Real-time alerts for teacher/room double-bookings
3. Elective Grouping — Smart OR/AND group management for optional subjects
4. Multi-Stream Support — Science, Commerce, Arts streams with split sections
5. Room & Resource Planning — Assign labs, halls, and shared spaces automatically
6. Export & Share — PDF timetables for staff, students, and parents

How It Works (3 steps):
1. Add your school data (teachers, subjects, rooms, sections)
2. Configure constraints and elective groups
3. Generate and export conflict-free timetables

Pricing (3 tiers):
- Starter: Free — up to 2 classes, 20 subjects
- School: $29/mo — unlimited classes, priority support
- District: $99/mo — multi-school, API access, SSO

### Features (/features)
Expand each of the 6 feature cards into a full section with icon, heading, description paragraph, and a placeholder screenshot div (bg-muted rounded-xl h-64).

### Pricing (/pricing)
Full pricing table with feature comparison checklist per tier. Annual/monthly toggle (show 20% discount for annual).

### Blog (/blog)
Index: card grid of posts with title, date, excerpt, slug link.
Post: full MDX render with reading time, author, OG meta.
Create 2 stub MDX posts:
- /content/blog/how-ai-scheduling-saves-time.mdx
- /content/blog/managing-electives-in-k12.mdx

## SEO requirements (critical)
- generateMetadata() on every page: title, description, openGraph, twitter card
- Root layout default metadata: metadataBase = https://smartsched.com
- JSON-LD SchemaOrg SoftwareApplication on landing page
- Dynamic sitemap.ts: include all static routes + blog slugs
- next-sitemap.config.js: siteUrl = https://smartsched.com, generateRobotsTxt: true
- All images: next/image with descriptive alt text
- Semantic HTML: h1 per page, proper heading hierarchy, aria-labels on CTAs
- Core Web Vitals: no layout shift — reserve image dimensions, font: next/font/google

## Design
- Color: primary blue #2563EB, neutral slate grays, white background
- Style: clean modern SaaS (think Linear/Vercel aesthetic) — no gradients overload
- Navbar: logo left, links center (Features, Pricing, Blog), "Start Free Trial" button right, mobile hamburger
- Footer: 4-column (Product, Company, Resources, Legal) + copyright
- All sections responsive: mobile-first, md: and lg: breakpoints

## App integration
- All "Start Free Trial" / "Get Started" / "Login" links → https://app.smartsched.com
- Register link → https://app.smartsched.com/register
- No auth in this repo — it is marketing only

## Deliverables
1. All files above created and wired up
2. `npm run build` passes with zero errors
3. `README.md`: setup, env vars (NEXT_PUBLIC_APP_URL), deploy to Vercel instructions
4. Lighthouse SEO score target: 95+

Do not use placeholder `lorem ipsum` — write real, concise copy throughout.
Do not add unnecessary dependencies — keep package.json minimal.
```
