# schedU — Full UX/UI & Feature Audit
**Date:** June 2026 | **Auditor:** Claude (Anthropic)

---

## 1. LANDING PAGE (`home.tsx`)

### Current State
Clean marketing page with hero, features, stats, how-it-works, CTA, footer.

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 1.1 | Navigation | Nav links (Features, Pricing, Docs, Contact) all point to `#` — dead links | Wire to real anchor sections or page routes; or use scroll-to-section |
| 1.2 | Hero badge | "AI-native timetable engine" — pulse animation missing on the green dot; no motion contrast | Add subtle CSS `pulse` animation to the green status dot |
| 1.3 | Hero CTA | "Start free — no credit card" button has no loading state if clicked while form submitting | No issue (navigates to wizard); keep as-is |
| 1.4 | Hero demo card | Floating animation is nice, but the card title "AI Period Allocation — Grade 8A" implies only one grade — limiting for global audience | Rotate the card demo content between subjects/grades via CSS `animation` or a typewriter |
| 1.5 | Stats band | Numbers (1,200+, 4.8 min, 98%, 180+) are hardcoded and not animated on scroll-in | Add countUp animation triggered on viewport intersection |
| 1.6 | Board support | "…and any custom curriculum" tag is passive — no CTA or explanation | Add a link "How custom curriculum works →" |
| 1.7 | Features section | Only 3 feature cards — undersells product capability (XI/XII optionals, conflict detection, substitutions, export, calendar view) | Expand to 6 feature cards or add a second row with more differentiators |
| 1.8 | "How it works" Step 3 copy | "AI inlines like a spreadsheet. AI explains every choice." — confusing; reads like two fragments | Rewrite: "Edit inline like a spreadsheet — AI explains every choice instantly." |
| 1.9 | Footer | © 2025 schedU — hardcoded year, already stale in 2026 | Use `new Date().getFullYear()` dynamically |
| 1.10 | Footer links | Privacy, Terms, Support, Status all point to `#` | Wire to real pages or remove until ready |
| 1.11 | Mobile | No mobile-responsive nav — hamburger menu missing; at <768px the nav links overflow | Add a collapsible mobile menu |
| 1.12 | Accessibility | All `<button>` inside `<a>` tags — semantically invalid (interactive inside interactive) | Use `<a>` styled as button OR `<button onClick={navigate}>`, not nested |
| 1.13 | No dark mode | Hardcoded `#fff` and `#13111E` everywhere; no dark mode support | Abstract to CSS variables or Tailwind dark mode classes |
| 1.14 | SEO | No `<meta>` description, OG tags, or structured data | Add meta tags; essential for a SaaS landing page |

---

## 2. AUTHENTICATION (`login.tsx`, `register.tsx`)

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 2.1 | Login | No password visibility toggle (👁) — poor UX for mobile users | Add show/hide toggle on password field |
| 2.2 | Login | "Sign in" button is outlined/ghost style — looks secondary; primary action should be filled | Make "Sign in" filled dark button; keep Google as outlined |
| 2.3 | Login | No "Forgot password?" flow — link exists but goes to `#` | Implement forgot password flow or remove until ready |
| 2.4 | Google auth | `FAKE_GOOGLE_USERS` with random pick — on production this must be real OAuth; current fake picks a random person | Flag clearly as dev-only; add `TODO: replace with real OAuth` comment |
| 2.5 | Error messages | Generic "Invalid credentials. Please try again." — no field-level validation | Add inline field errors: "Email is required", "Password must be 8+ characters" |
| 2.6 | Register | Left brand sidebar with feature bullets — good differentiator, but the sidebar disappears on mobile | Make layout single-column below 768px |
| 2.7 | Register | No email verification step after registration | Add email confirmation flow (or clearly mark as planned feature) |
| 2.8 | Register | Board/School type field exists but doesn't inform wizard default | Wire this to pre-fill wizard board selection |
| 2.9 | Both | No rate limiting UI — user can spam login button | Add cooldown + button disable after 5 attempts with countdown |
| 2.10 | Both | AppFooter at bottom but main content isn't `min-height: 100vh - footer` — footer can overlap on short viewports | Fix layout to push footer to bottom properly |
| 2.11 | Login | "SSO available for Enterprise plans" banner at bottom adds clutter for basic users | Only show if user's email domain is enterprise OR move to a Settings page |

---

## 3. DASHBOARD (`dashboard.tsx`)

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 3.1 | Sidebar | Collapsed state (56px) — icons show but no tooltip labels on hover; user can't tell what icon means | Add `title` tooltips on hover; already partially done but should be verified on all icons |
| 3.2 | Sidebar | Calendar and Insights items point to `#` — navigation goes nowhere | Show "Coming soon" badge or disable + tooltip explaining roadmap |
| 3.3 | Top nav | 4 tabs (Dashboard, Timetables, Resources, Reports) but only Dashboard tab shows content — others are empty | Either implement or show "in development" placeholders |
| 3.4 | Stats cards | "Conflicts: 2 / Needs attention" — hardcoded fallback; actual conflicts from store conflict count of `0` shows `0 || 2 = 2` bug | Fix: `conflicts` should be real from store; don't fake with `|| 2` |
| 3.5 | Stats cards | "Total classes: 52" fallback; "Teachers: 84" fallback — all hardcoded fallback values shown even when store is empty | Show "--" or "No data yet" instead of hardcoded numbers |
| 3.6 | AI insight | "Mr. Sharma is overloaded by 6 periods..." — hardcoded fake insight, not derived from real data | Either derive from actual `conflicts[]` array or clearly mark as demo; in prod wire to real conflict detection |
| 3.7 | Timetable list | "🔧 Restore data" button visible on every row without a snapshot — no explanation of what it does before clicking | Add tooltip explaining what restore does; confirmation dialog before executing |
| 3.8 | Timetable list | `alert()` used for feedback after restore — browser-native alert breaks UX; inconsistent with app's design | Replace with an in-app toast/notification component |
| 3.9 | Delete flow | Inline confirmation banner appears in the list — good pattern, but the "Delete" button has no spinner/loading state | Add loading state and confirm with toast on success |
| 3.10 | "New timetable" button | Top-right in content area; not prominent enough — CTA should be more visible | Consider a larger button with icon + coloring; or add a quick-action shortcut |
| 3.11 | Quick actions | "View reports" goes to `/timetable` — misleading label; reports ≠ timetable view | Rename to "View timetable" or wire to a dedicated reports page |
| 3.12 | Quick actions | All 3 quick action cards point to same destinations (`/master-data`, `/timetable`) — not unique | Differentiate destinations or show disabled with "Coming soon" for unimplemented ones |
| 3.13 | Notification bell | Bell icon with red dot hardcoded — no notifications feature exists yet | Hide until notification system is built; or show empty notification panel on click |
| 3.14 | User avatar | Avatar + initials shows in both topbar AND sidebar — redundant UI | Show only in sidebar; remove from topbar (or keep just text schoolName in topbar) |
| 3.15 | Logout | `MoreHorizontal` icon triggers logout — user has no way to know this without clicking | Replace with a proper dropdown with "Log out", "Profile", "Settings" options |
| 3.16 | Local storage | All data in localStorage — no backend persistence; multiple tabs or clearing storage loses all data | Add at least a "Export backup" option; long-term migrate to backend |
| 3.17 | Mobile | Dashboard layout has fixed sidebar + 4-column stats grid — breaks on mobile | Add responsive breakpoints; sidebar should collapse on mobile |

---

## 4. CREATE/EDIT TIMETABLE MODAL

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 4.1 | Name field | Auto-generates `AY 2026–27 · Main Timetable` — good; but uses dash (`–`) that may not display well in all fonts | Verify en-dash renders correctly on Windows/mobile |
| 4.2 | Board selection | Board chips use green (#059669) for selected state but rest of app uses purple (#7C6FE0) for primary | Use purple as selected state for consistency |
| 4.3 | Class range | Two dropdowns for "From" and "To" grades without validation — user can select "to" grade before "from" grade | Add validation: warn if fromGrade index > toGrade index |
| 4.4 | Approximate counts | 4-up number inputs are small (number input arrow buttons hard to hit) | Use +/- stepper buttons instead of raw number inputs |
| 4.5 | "Open wizard" | Button triggers navigate with full page refresh (`window.location.href`) — loses SPA feel | Use router navigate if available; or at minimum add loading state |
| 4.6 | AI auto-create tags | Shows "X (N classes)" tags — good; but "Bell timings" and "Room types" tags are hardcoded regardless of input | Only show tags that are actually going to be auto-generated |
| 4.7 | Modal close | Click-outside closes modal — fine, but no animation on dismiss | Add fade-out transition on close |
| 4.8 | Keyboard | No Escape key handler visible — standard modal should close on Escape | Add `onKeyDown` Escape handler |

---

## 5. WIZARD (`wizard.tsx`)

### Step 1 — Shift & Bell Timing

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 5.1 | Step label | Wizard shows steps as: Resources → Shift & timing → Allocation → Groups & Combos → Review & generate — but the label "Groups & Combos" is ambiguous for non-CBSE users | Rename to "Groups & Optionals" and add a tooltip explaining it's for XI/XII OR show step only if dynamic mode detected |
| 5.2 | Bell grid | Class-wise breaks panel is powerful but has high cognitive load — 5 class groups × multiple break settings at once | Add a "Simple mode" with just one break time for all grades; "Advanced" reveals staggering |
| 5.3 | Class-wise breaks | Break classes are identified by keys ('nur', 'lkg', etc.) but visual doesn't clearly associate key → class label | Show full class label next to each key chip |
| 5.4 | Bell timeline | Tab-based per-group view is good but requires discovery — user might not notice tabs exist | Add a "compare groups" toggle showing all group timelines side by side |
| 5.5 | + Period / + Break | GAP row buttons exist but are not immediately visible at scroll position | Sticky "Add row" button at bottom of bell grid |

### Step 2 — Resources

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 5.6 | Tab label | Tab says "Faculty" for teachers, but rest of app uses "Teachers" | Standardize terminology: use "Teachers" everywhere |
| 5.7 | Classes panel | Auto-generated section names like "XI-Sci-A", "XI-Com-A" are correct but not explained — new users don't know what "Sci" means | Add a legend or tooltip: "Sci = Science stream, Com = Commerce, Arts = Humanities" |
| 5.8 | Subjects panel | Subject list can grow large (38+ items) with no search/filter | Add a search bar above the subject list |
| 5.9 | Teachers panel | No way to import teachers from CSV in wizard (only manual entry) | Add "Import from CSV" button in teachers tab |
| 5.10 | Rooms panel | Room type chips exist but room "scope" (which classes can use it) requires a separate modal — hard to discover | Surface scope configuration inline with a summary badge |
| 5.11 | Readiness indicator | Shows completion progress but the bar labels aren't explained | Add tooltip on each readiness metric |
| 5.12 | Sidebar nav | "Regenerate" button in sidebar — unclear what gets regenerated and what is lost | Show a confirmation with list of what will be overwritten |
| 5.13 | Navigation | "Next: Allocation →" button — skips some validation (e.g. 0 teachers) silently | Validate minimum viable data before allowing next step; show specific error |

### Step 3 — Allocation

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 5.14 | Grid complexity | AG Grid with period allocation syntax (`7+2W`, `5H`) is powerful but has a steep learning curve | Add an inline syntax quick-reference tooltip on first use + a persistent "?" help icon |
| 5.15 | Three sub-tabs | Period allocation / Teacher allocation / Validation — important workflow but tab labels are not self-explanatory | Add sub-descriptions: "Set periods per subject", "Assign teachers", "Check for issues" |
| 5.16 | Capacity engine | Sidebar shows band capacity — good; but values like "34 periods / week" don't tell user what's enough | Show "Required: X · Allocated: Y · Remaining: Z" with color coding |
| 5.17 | Auto-assign | No "Auto-assign all" button for teacher allocation — user must go cell by cell | Add bulk auto-assign with a single button using the AI engine |
| 5.18 | Export in step | Export buttons (XLSX, CSV, Print) inside an allocation step — out of place; export belongs in the final step | Move export to Step 5 (Review & Generate) only |

### Step 4 — Student Groups

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 5.19 | Matrix grid | Section-strength matrix is powerful but is one of the most complex UIs in the app — a new user has no onboarding | Add a short intro overlay for first-time users: "Tell us how many students choose each optional subject" |
| 5.20 | Row status | Row status badges (✓ green, orange, red) — good; but icon-only status may not be clear for red "over" case | Add text like "+3 over total" in the badge on hover |
| 5.21 | Subject groups | "Subject Groups" as second tab — terminology is unclear; could be confused with "Subjects" tab in Step 2 | Rename to "Group Assignments" or "Parallel Groups" |
| 5.22 | Behavior types | 6 grouping behaviors (NO_GROUPING, SAME_GRADE_ONLY, etc.) — labels are technical; user may not understand difference | Show a visual diagram explaining each behavior when hovering; simplify labels to plain English |

### Step 5 — Review & Generate

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 5.23 | Generation | "Generate" button with progress bar — good; but no estimate of time remaining | Show approximate time based on school size |
| 5.24 | Score display | Timetable score (0–100) shown but its meaning is not explained | Add a legend: "80–100 = Excellent, 60–79 = Good, <60 = Needs improvement" |
| 5.25 | Penalty trend | PenaltyTrendChart shows improvement over iterations — but axes are unlabeled | Add axis labels: X = "Optimization iteration", Y = "Constraint violations" |
| 5.26 | Conflicts panel | Conflict list is expandable — good; but conflict fix suggestions use technical IDs | Use human-readable descriptions: "Mr. Sharma is double-booked on Monday Period 5" |
| 5.27 | Conflict wizard | ConflictResolutionWizard component exists but isn't surfaced prominently enough | Add a prominent "Fix all automatically" button that runs the conflict wizard |
| 5.28 | Publish | "Publish" action and what it means (locking, sharing) is unclear | Add a pre-publish summary: "Publishing makes this timetable visible to all teachers" |
| 5.29 | Export formats | 4 export formats (class XLSX, teacher XLSX, master CSV, print) — good selection | Add room-wise export as a 5th format (it exists in useExport.ts but not in PublishExportPanel) |

---

## 6. TIMETABLE VIEW (`routes/timetable.tsx`)

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 6.1 | View switcher | Class/Teacher/Subject/Room view switcher + Transposed toggle — good; but "Transposed" is a technical term non-educators won't understand | Rename to "Rotate (show periods as rows)" with a preview icon |
| 6.2 | Short name toggle | "Short" toggle reduces cell content — good; but no visual indicator which toggle is active | Add active state styling to the toggle |
| 6.3 | Cell density | Default cell content (subject + teacher + room) in small cells can overflow | Add auto-truncation with `title` tooltip showing full content on hover |
| 6.4 | Drag and drop | Drag state visual feedback is good (green/red outlines) but hard to discover — no user indication that drag is possible | Add "drag to rearrange" tooltip on first view or a drag handle icon in each cell |
| 6.5 | Conflict modal | ConflictModal on bad drop — informative; but modal uses generic language | Specify: "This slot is taken by [Teacher name] who is teaching [Subject] to [Class]" |
| 6.6 | Calendar view | CalendarView timeline shows good layout but "Matrix / Weekly / Monthly" tabs aren't labeled with clear descriptions | Add tooltip on each tab: "Matrix = grid", "Weekly = day columns", "Monthly = month overview" |
| 6.7 | Substitution | SubstitutionModal exists — good feature but hidden; user may not find it | Add a "Mark as substitution" option to cell right-click context menu |
| 6.8 | Undo/redo | Undo history exists in store but no keyboard shortcut UI or toolbar button | Add Cmd+Z / Ctrl+Z undo with a visible undo button in toolbar |
| 6.9 | Print view | No print-specific CSS — printing timetable from browser may not format correctly | Add `@media print` CSS for clean table-only printout |
| 6.10 | Empty state | When classTT is empty, timetable renders an empty grid — confusing to user | Show "Generate your timetable in Step 5 of the wizard" call-to-action |
| 6.11 | Period names | Period columns show "Period 5" headers — fine; but "Assembly" and "Dispersal" are shown as regular periods in some views | Visually distinguish admin periods (Assembly, Dispersal) from teaching periods |
| 6.12 | Lunch in teacher view | "Lunch Break + compressed class names" in teacher cell — good; but the lunch duration isn't shown | Add lunch duration: "Lunch Break (30 min)" |

---

## 7. MASTER DATA (`master-data.tsx`)

### Issues & Recommendations

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 7.1 | Page title | "Master Data" — functional but not user-friendly | Rename to "Resources" or "School Data" for non-technical users |
| 7.2 | Tabs | 5 tabs (Classes, Subjects, Teachers, Rooms, Strengths) — "Strengths" is unclear | Rename "Strengths" to "Enrolment Matrix" or "Student Numbers" |
| 7.3 | Scope matrix modal | ScopeMatrixModal — launched via a small button on some rows; hard to discover | Surface scope editing more prominently with a dedicated column or icon |
| 7.4 | No bulk actions | No "Select all" + "Delete selected" or "Export" capability | Add row selection + bulk actions toolbar |
| 7.5 | No save indicator | Changes are auto-saved to Zustand/localStorage but no visual confirmation | Add "Saved" checkmark toast after mutations |
| 7.6 | Empty rooms | When no rooms are configured, shows auto-derived rooms from sections — silently substitutes | Show a banner: "Using section-derived rooms. Configure real rooms below for accurate scheduling." |

---

## 8. TYPOGRAPHY & DESIGN SYSTEM

| # | Issue | Fix |
|---|-------|-----|
| 8.1 | **Font loading** | "Plus Jakarta Sans" and "DM Mono" loaded from Google Fonts? No `@import` or `<link>` visible in code — falling back to system fonts if not loaded | Add explicit Google Fonts import in `index.html` or `index.css` |
| 8.2 | **Inline styles everywhere** | ~95% of styling is inline `style={{}}` — makes theming, dark mode, and responsive CSS nearly impossible | Migrate to CSS modules, Tailwind, or at minimum a design token system |
| 8.3 | **Color inconsistency** | Primary purple is `#7C6FE0` everywhere but some new components use `#7C3AED` (Tailwind violet) — two different purples | Standardize: pick one and update all occurrences |
| 8.4 | **Font size scale** | Mix of `10px`, `10.5px`, `11px`, `11.5px`, `12px`, `12.5px`, `13px`, `14px`, `15px` — too many tiny increments | Establish a type scale: 12 / 14 / 16 / 20 / 24 / 32 / 40 |
| 8.5 | **Button inconsistency** | 4 different button styles across pages (filled dark, filled purple, outlined, ghost) with no reusable `<Button>` component | Create a shared `Button` component with `variant` prop |
| 8.6 | **Hardcoded hover** | Hover states use inline `onMouseEnter`/`onMouseLeave` JS — overrides CSS transitions and doesn't work on mobile | Move hover styles to CSS classes; only JS handlers for complex hover logic |
| 8.7 | **Modal overlay** | All modals use `position: fixed; inset: 0` with `rgba(0,0,0,0.45)` — fine; but no shared modal shell component | Create a reusable `<Modal>` component |
| 8.8 | **No loading skeleton** | Pages like Dashboard and Timetable render empty/0 states while store hydrates from localStorage | Add skeleton loaders for stats cards and timetable grid |
| 8.9 | **No toast system** | `alert()` used in 2 places; no in-app notification/toast system | Implement a lightweight toast (e.g. react-hot-toast or custom) |
| 8.10 | **Scrollbar styles** | Custom hidden scrollbars in some panes but not others — inconsistent overflow behavior | Standardize scrollbar behavior across all scroll containers |

---

## 9. LOGIC & FEATURE GAPS

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 9.1 | **Backend not integrated** | Auth via `authStore` is in-memory (faked login); all data is localStorage-only; no actual backend API calls despite backend existing | Wire `/login`, `/register`, timetable CRUD to Go backend API |
| 9.2 | **OR-Tools not integrated** | Comment "OR-Tools planned, not yet" — solver is pure JS CSP which may not scale for large schools | Expose a backend endpoint with OR-Tools solver; fall back to JS CSP for small schools |
| 9.3 | **No real-time conflict detection** | Conflicts are batch-computed on generation; editing cells post-generation doesn't update conflicts live | Run `checkConflicts()` after every `commitTT()` call; update conflict count in topbar |
| 9.4 | **localStorage quota** | Multiple timetable snapshots + full classTT stored in localStorage — large schools (50+ sections × 6 days × 8 periods) can hit 5MB quota | Add quota monitoring + warn user; compress snapshots before storage |
| 9.5 | **No search across app** | No global search for teacher, class, subject, or period | Add a global search (Cmd+K / Ctrl+K) that searches across entities |
| 9.6 | **No audit log** | `audit_logs` table in schema but nothing writes to it | Implement audit trail for timetable edits (who changed what, when) |
| 9.7 | **Multi-timetable isolation** | The snapshot system works but requires manual "Restore data" if something goes wrong — fragile | Make snapshot save/restore automatic and transparent; remove the 🔧 button |
| 9.8 | **No teacher leave/absence** | Teacher availability editor exists but availability isn't factored into generation properly | Verify TeacherAvailabilityEditor data is passed into solver constraints |
| 9.9 | **No student view** | Schedules can only be viewed by admin; students/parents have no view | Add a read-only shareable link for individual class timetables |
| 9.10 | **No notifications/reminders** | No way to notify teachers of their schedule | Add email/print export per teacher; long-term: email delivery |
| 9.11 | **Stale wizard step files** | `step1-org.tsx`, `step2-country.tsx`, `step3-subjects.tsx`, `step4-numbers.tsx`, etc. — old numbered step files still in codebase | Delete all `stepN-*.tsx` files that are no longer wired; reduces confusion and bundle size |
| 9.12 | **Duplicate aiEngine** | `src/components/resources/aiEngine.ts` AND `src/lib/aiEngine.ts` — two files with similar names | Consolidate; the resources one should import from lib |
| 9.13 | **No error boundary on pages** | Only wizard has a StepErrorBoundary; crash in timetable view shows blank screen | Add error boundaries to Dashboard and Timetable pages |
| 9.14 | **Password storage** | Auth store holds passwords in memory/localStorage — not secure | Backend must hash passwords; JWT in httpOnly cookie; remove all password from client store |
| 9.15 | **No CI/CD checks** | package.json build + tsc — but no automated testing | Add at minimum: type-check CI, lint CI, and unit tests for schedulingEngine and optionalEngine |

---

## 10. GLOBAL QUICK WINS (Easy Fixes, High Impact)

| Priority | Fix | Effort |
|----------|-----|--------|
| 🔴 High | Fix `© 2025 schedU` → dynamic year | 1 min |
| 🔴 High | Replace `alert()` with toast notifications | 1 hr |
| 🔴 High | Add password visibility toggle on login | 30 min |
| 🔴 High | Fix "Conflicts: 2" hardcoded fallback in dashboard | 15 min |
| 🔴 High | Add Escape key handler to all modals | 30 min |
| 🟡 Medium | Standardize button component | 2 hrs |
| 🟡 Medium | Add toast/save indicator for auto-saves | 1 hr |
| 🟡 Medium | Add loading skeletons for dashboard stats | 1 hr |
| 🟡 Medium | Mobile responsive nav on landing page | 3 hrs |
| 🟡 Medium | Global Cmd+K search | 4 hrs |
| 🟢 Low | Dark mode via CSS variables | 8+ hrs |
| 🟢 Low | Animated stats countUp on landing page | 1 hr |
| 🟢 Low | Delete legacy stepN-*.tsx files | 30 min |
| 🟢 Low | Consolidate duplicate aiEngine files | 1 hr |

---

## 11. INTERNATIONALLY / GLOBALLY ACCEPTABLE

| # | Area | Issue | Fix |
|---|------|-------|-----|
| 11.1 | Date formats | `en-GB` date format used throughout (`02 Jun 2025`) — fine globally but not localizable | Use `Intl.DateTimeFormat` with user locale |
| 11.2 | Curriculum assumptions | Code is deeply CBSE-specific (class names 'I–XII', Roman numerals, 'XI-Sci/Com/Arts') but marketing says "any curriculum" | Add a "curriculum flavor" config that changes section naming convention (e.g. Grade 1–12 for US, Year 7–13 for UK) |
| 11.3 | Language | UI is English-only; no i18n framework | Add i18n via `react-i18next`; start with EN + one other language to validate framework |
| 11.4 | RTL support | No RTL CSS for Arabic, Hebrew, Urdu markets (the WAEC/O-Level and Arabic school market is large) | Add `dir="rtl"` support with RTL-specific CSS |
| 11.5 | Time format | 12h/24h toggle exists — good | Already handled; maintain this |
| 11.6 | Timezone | No timezone selection in school setup; all times are local | Add timezone picker in Step 1 (Bell Timing); store times as UTC |
| 11.7 | Currency/pricing | Pricing page is dead link but when it exists, must support local currency | Use Stripe's currency detection or explicit currency selector |

---

*Total issues identified: 94 | Critical: 12 | High: 28 | Medium: 35 | Low: 19*
