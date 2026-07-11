# Scene 9 — Calendar, Live view + scrubber drag

**Caption:** "See who's free. Right now."
**Duration:** 3200ms
**Source of truth:** `frontend/src/pages/calendar.tsx` — `LiveBoard`
(~1184+), scrub state & "following" mode (203, 728-734, 999-1000: dragging
pins to a minute; "Now" returns to live), teach/break band colors
`#B9AFF0`/`#F7D9A0`, red now-line `#EF4444`, "In session · N" / "Free now ·
N" sections, LiveCard progress rings, load-sorted free chips
(Lightest/Heaviest first).

## Real mechanics (verified)

Live view is a scrubbable moment-in-time: a horizontal day track (teaching
bands violet `#B9AFF0`, breaks amber `#F7D9A0`) with a **red playhead at the
actual current time**; the board below lists who's **in session** (cards
with % progress rings) and who's **free now** (chips with today's load
count). Dragging the track's handle pins the board to any minute — both
lists re-derive live for that moment; clicking **Now** snaps back to
real time (following mode).

## Mockup structure

```
10:25:14 AM   Period 3 · 18 min left        ● Live   [Now]
┌ day track ─────────────────────────────────────────────┐
│ ▮▮▮▮▮░░▮▮▮▮▮▮░░▮▮▮▮▮▮▮░░▮▮▮▮  ← bands              │
│              │← red playhead (real ticking time badge) │
└─────────────────────────────────────────────────────────┘
 ▪ Teaching  ▪ Break / free
● In session · 2
  (VIII-A · Maths · Mr. Rao · ◔62%)  (IX-C · Science · Ms. Iyer · ◔38%)
● Free now · 3            [Lightest first]* [Heaviest first]
  (Mr. Das · 2 today · +) (Mrs. Paul · 4 today · +) (Mr. Sharma · 1 · +)
```

The header clock and playhead badge use the **genuinely live wall clock**
(same real-clock pattern already shipped in the marketing HeroMovie) — the
one element here that is real data, clearly consistent with the product's
own live semantics.

## Cursor path & timing

| ms | action |
|---|---|
| 0–500 | board settles; playhead ticking at real time |
| 500–800 | cursor to the playhead handle; swaps to **grab hand** at 850 |
| 850–1500 | **drag right** (+2 hours): playhead + time badge move WITH the cursor; below, one "In session" card swaps out, a different teacher chip enters "Free now" — the lists visibly re-derive |
| 1500–2000 | **drag back left** past start point (the back-and-forth scrub the product supports — pinned mode) |
| 2100–2350 | cursor to **[Now]**, **click** at 2400 |
| 2500 | **outcome:** playhead snaps back to the real current time, badge shows the live clock again, lists restore |
| 2600–3200 | hold |

## RM frame

Board at "Now": ticking clock allowed only if RM permits (it's a 1Hz text
swap — keep it, it's not motion), playhead static at the real-time position,
both lists populated.

## Fidelity notes

- Drag-then-Now is exactly the real interaction (scrub → pinned; Now →
  following). This directly answers the earlier feedback that dragging must
  go "back and forth" and the playhead must show real ongoing time.
- Board data (names/percentages) is illustrative; the clock is real. Keep
  the established honesty split.
