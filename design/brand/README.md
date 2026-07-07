# schedU brand system — the "Fader U"

> Design exploration deliverable. Not production code. Companion files:
> all `.svg` variants in this folder + `preview.html` (open in a browser
> to see every variant, the loading animation, and the 16px favicon test
> at real size).

---

## 1. Where this comes from — the bhusku family DNA

The parent mark already exists in code (`frontend/src/components/branding/Logos.tsx`,
`BhuskuLogo`). Reverse-engineering it gives us hard family constants, not vibes:

| Trait | bhusku `b` value | Family rule |
|---|---|---|
| Canvas | 52 × 52 viewBox | All marks drawn on the same 52-grid |
| Stroke | 8 units, `stroke-linecap: round` | **8/52 ≈ 15.4%** monoline, round terminals |
| Stem | `rx=4` on an 8-wide bar | Fully rounded pill ends |
| Accent | Gold dot `r=4.5` at top-right (39, 10) | The dot is the family signature |
| Tile | Rounded square, radius ≈ 28% of size | 7/24, 8/28, 9/32 in existing code |
| Case | wordmark is lowercase "bhusku" | product wordmark is lowercase "sched" + the U mark |

Both names end in **U** — bhusk**U**, sched**U**. The product mark should be
that shared final letter, drawn in the parent's stroke.

---

## 2. Three explored directions (see `explorations.html`)

### Direction 1 — "Console U" (tuner sliders inside the bowl)
A monoline U whose counter (interior) holds two horizontal fader bars with
round knobs at different positions — a direct quote of the Tuner Console UI
and of the current stacked-bars logo.

**Verdict: fails the favicon test.** At 16×16 the interior bars are ~1px of
smear; the mark reads as a blurry badge, not a letter. Great at 48px+, dead
at 16. Rejected as the primary mark (the idea survives — see Direction 3
and the loading animation).

### Direction 2 — "Monoline hand U" (bhusku bowl quality)
A single 8-unit stroke U, both stems equal, gold dot floating top-right —
essentially the bhusku `b`'s bowl stroke re-bent into a U.

**Verdict: safe but mute.** It's a perfect sibling and holds at 16px, but
says nothing about *scheduling*. It's a letter, not a mark. Kept as the
fallback if maximum conservatism is wanted.

### Direction 3 — "Fader U" ★ RECOMMENDED
A monoline U where the **right stem is deliberately shorter**, and the gold
dot sits above it **on the line the stem implies** — so the dot reads as a
fader knob riding its track. The asymmetry *is* the tuner reference: no
interior detail to die at small sizes, yet anyone who has seen the Tuner
Console recognises the knob-on-track instantly.

- Left stem = a fader track at full value.
- Right stem + gold knob = a fader mid-adjustment.
- The mark is literally "a schedule being tuned," in two strokes and a dot.
- The gold dot lands in the same top-right quadrant as bhusku's dot →
  side by side, `b` and `U` are unmistakably one family.
- At 16×16: two verticals, one curve, one dot. Nothing to smear.

**Geometry (52-grid):**
```
Path:  M 16 9  L 16 30  A 10 10 0 0 0 36 30  L 36 22
       stroke-width 8 · round caps · no fill
Knob:  circle (36, 12.5) r 4.5 — gold
Gap:   dot bottom (17) → stem top (18) = 1 unit of air (knob "hovering")
```

---

## 3. Palette directions

The brief says avoid generic AI-SaaS purple *gradients*. Agreed — no
gradients anywhere in this system. But the parent brand's hue is already
Lavender Violet (#7C6FE0) with Mahua Gold: abandoning it would orphan
schedU from bhusku, which defeats the whole "family" requirement. So the
real question is *how much* violet, and what carries the document-trust
feeling.

### A — "Registrar" (ink + gold, paper-first)
| Role | Hex |
|---|---|
| Ink | `#13111E` |
| Paper | `#FAF9F5` |
| Accent (knob, highlights) | `#D4920E` |

Feels like a school registrar's ledger: authoritative, print-native,
timeless. Violet only appears on interactive states. Risk: on-screen it
can read austere next to the existing shipped app.

### B — "Lavender Modern" (incumbent, flat)
| Role | Hex |
|---|---|
| Primary | `#7C6FE0` |
| Ink | `#13111E` |
| Accent | `#D4920E` |

The current system, kept flat (no gradients). Maximum continuity, zero
migration. Risk: violet-heavy surfaces can drift toward the generic-SaaS
look the brief warns about if used as large fills.

### C — "Ink-first triad" ★ RECOMMENDED
| Role | Hex | Use |
|---|---|---|
| Ink `--su-ink` | `#13111E` | The mark's default color; all print; body text |
| Lavender `--su-brand` | `#7C6FE0` | Interactive surfaces, links, the app tile — the *family hue*, never a page-wide fill, never a gradient |
| Gold `--su-knob` | `#D4920E` | The dot/knob ONLY, plus rare highlights. Scarcity keeps it confident |
| Paper `--su-paper` | `#FAF9F5` | Print & document backgrounds |
| Mist `--su-mist` | `#EDE9FF` | Light tints, chips (existing `primaryLight`) |

**Reasoning:** the mark itself is **ink by default** (letterhead-quality,
photocopies cleanly, matches the "trusted document" positioning of a
product whose outputs are printed timetables and report cards). Lavender is
demoted from "the color of everything" to "the color of touching things" —
which keeps the parent-brand hue alive exactly where users interact, and
kills the AI-SaaS-purple-poster failure mode. Gold stays rationed to the
knob, same as bhusku rations it to the dot. Every value already exists in
`frontend/src/lib/theme.ts` / the brand-preview tokens, so adoption costs
nothing.

---

## 4. Variant inventory (files in this folder)

| File | Purpose |
|---|---|
| `u-mark.svg` | Master mark, ink + gold, 52-grid |
| `u-mark-tile.svg` | App-context tile (lavender rounded square, white U, gold knob) |
| `u-mark-mono.svg` | Single-color (all `currentColor`) — embeds/stamps |
| `u-mark-reversed.svg` | White-on-dark (dark headers, footer) |
| `u-mark-print.svg` | Print-safe 1-color: pure `#000`, knob solid black (gold → 100 K in 1-color runs; CMYK 18/45/100/6 when color print available). Thickened stroke (9) for low-DPI photocopy survival |
| `favicon-16.svg` | Optical variant for 16×16: stroke 10, knob r 6, tighter curve |
| `favicon-32.svg` | Optical variant for 32×32: stroke 9, knob r 5 |
| `app-icon.svg` | 512 rounded-square (radius 27%), PWA/mobile |
| `wordmark.svg` | "sched" + U-mark as the final letter, horizontal lockup |
| `wordmark-reversed.svg` | Same, white-on-dark |
| `og-template.svg` | 1200×630 Open Graph template (title + tagline slots) |
| `loading.svg` | Self-contained SMIL loading animation (see §5) |
| `explorations.html` | The 3 directions side by side |
| `preview.html` | Everything above on one page, incl. CSS loader + 16px test |

### Optical size rule
Below 24px rendered size, use the favicon variants (thicker stroke, larger
knob, reduced dot-gap). This is standard optical-size practice; the master
mark is *not* simply scaled down.

---

## 5. The loading animation (mark-native, not a spinner)

The gold knob **is** the loader. On loop:

1. Knob slides down the right track (12.5 → 26), ease-in-out, 650ms —
   "adjusting the fader."
2. Right stem stroke extends up to meet it (the schedule filling in), 250ms.
3. Brief settle (both stems full, knob seated) — 200ms hold.
4. Reverse to rest. Total loop ≈ 1.8s.

Semantically: *schedU is tuning*. Identical language to the Tuner Console
(Task 2, hero animation) — one motion vocabulary app-wide.

- `loading.svg` — SMIL version, zero JS, drop-in anywhere (works as an
  `<img>` src).
- `preview.html` — equivalent CSS-keyframe version for in-app use
  (respects `prefers-reduced-motion`: animation off, static mark shown).

**Reduced motion:** the static resolved mark (knob at rest position). Never
an empty box.

---

## 6. Brand tokens (compact reference)

```css
:root {
  /* color */
  --su-ink:    #13111E;
  --su-brand:  #7C6FE0;   /* interactive only — never page fills, never gradients */
  --su-knob:   #D4920E;   /* the dot/knob only */
  --su-paper:  #FAF9F5;
  --su-mist:   #EDE9FF;

  /* mark geometry (on the 52-grid) */
  --su-stroke: 8;         /* master; 9 print; 9–10 favicon optical sizes */
  --su-cap:    round;
  --su-knob-r: 4.5;       /* master; 5–6 at favicon sizes */
  --su-tile-radius: 27%;  /* rounded-square containers */
}
```

**Minimum sizes:** master mark 24px; below that switch to favicon variants;
absolute floor 16px. Wordmark lockup minimum 96px wide.

**Clearspace:** on all sides, ≥ the height of the knob's travel gap × 4 —
practically, ¼ of the mark's height. Nothing enters this zone, including
the bhusku footer mark when they appear together.

**Co-branding rule:** when `b` and `U` marks appear together (footer,
about page), same tile size, same baseline, gold dots at matching optical
height — the dots are what tie the family; never recolor them.

**Typography:** wordmark set in Plus Jakarta Sans 800, lowercase "sched",
tracking −2%; the U is always the mark, never a typed glyph. (Kills the
current italic-serif U, which borrows nothing from the parent.)

**Don'ts:** no gradients on the mark · no recoloring the knob · no
outlining the tile · no interior detail added back "because it looks empty
at 200px" (it's supposed to breathe) · never typeset "SchedU"/"Schedu" in
running copy — product name is **schedU**.
