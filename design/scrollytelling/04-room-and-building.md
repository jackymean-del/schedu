# Beat 4 · Room & building — every building, every room, synced

**Caption:** "Every building. Every room. Synced."

**Persists from Beat 3:** the dots draining off-screen at the end of Beat 3
arrive here as the first windows lighting up (same dot color → window tint
mapping). **Hands off to Beat 5:** the campus's period ticker (P1→P4) is the
same ticker that becomes the grid's column headers in Beat 5.

---

## Composition

Same minimal isometric campus as the shipped multi-building animation
(Main Block, Science Block, Sports Hall), reused directly, now also
introducing the **staggered-break highlight** flagged as a missing
differentiator in `headline-and-highlights.md` §2.1: two buildings' window
columns each carry a small sand-colored "break" band, landing at visibly
different points on the shared period ticker.

## Scroll-progress storyboard

| % | Beat |
|---|---|
| 0–9% | Campus at rest, unlit, dot under P1. |
| 9–28% | P1 assigns — 5 windows light in sequence, hopping cross-building (same as shipped animation). |
| 28–35% | Ticker slides to P2. |
| 35–55% | P2 assigns; Science Block's break band appears (sand tint) while Main Block keeps teaching — the staggered-break beat. |
| 55–70% | P3; Main Block's break band appears now, one beat later than Science's — visually proving the stagger. |
| 70–85% | Wide settle — all windows lit simultaneously. |
| 85–100% | Hold, then dim to hand off into Beat 5's grid. |

## SVG structure sketch

Identical `<g id="b-main">`/`<g id="b-sci">`/`<g id="b-hall">` structure to
the shipped `MultiBuilding` component, with one addition: each building group
gets an optional `<rect class="break-band">` toggled visible at its own
scroll-percentage window (per the table above), reusing the sand color
(`#F5E9C9`) already established for breaks elsewhere (Live/Pulse, the
timetable card).

## Interaction (bonus layer)

**Clicking a building** zooms the SVG's viewBox into that building alone
(a CSS `transform: scale()` + `transform-origin` on the clicked group,
paired with dimming the other two buildings to 20% opacity), replaying that
building's own room-by-room fill animation at 2× visual size. A second click
(or clicking outside) zooms back out. Pure CSS `:target` or a single toggled
class per building — no JS framework, one small click handler per building
(3 total) to add/remove an "zoomed" class.

## Reduced-motion static frame

Campus fully lit, both break bands visible simultaneously (even though
they'd never literally overlap in a real single-moment schedule — the
static frame's job is to *communicate* the staggering concept, not represent
one literal instant), gold dot on P4.

## Honesty

Building labels generic ("Main Block", "Science Block"). Caption:
"Illustrative demo."
