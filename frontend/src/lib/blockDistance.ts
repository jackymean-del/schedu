/**
 * Block / Building Distance Matrix — Blueprint v3, Step 2 (Resources).
 *
 * Where a school spans multiple blocks or buildings and students physically move
 * between them for cross-block parallel sessions (Step 4 AND logic), the admin
 * records the *relative* proximity of each pair of blocks. These are an
 * admin-defined scale (lower = closer), not physical measurements — they only
 * need to be internally consistent so schedU can rank "near" vs "far".
 *
 * Entered once and reused by every schedule cycle, so it lives in its own
 * persisted global store alongside the rest of the Master Data library.
 *
 * The matrix is SYMMETRIC: the admin enters each unordered pair once (A–B, A–C,
 * …) and both directions resolve to the same value. A block's distance to itself
 * is always 0.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Canonical key for an unordered pair, so A–B and B–A are the same entry. */
export function pairKey(a: string, b: string): string {
  const x = (a ?? '').trim(), y = (b ?? '').trim()
  return x <= y ? `${x}|${y}` : `${y}|${x}`
}

interface BlockDistanceState {
  /** Admin-declared blocks/buildings (order preserved for display). */
  blocks: string[]
  /** pairKey → relative distance (lower = closer). */
  distances: Record<string, number>

  setBlocks: (b: string[]) => void
  addBlock: (name: string) => void
  removeBlock: (name: string) => void
  setDistance: (a: string, b: string, d: number | undefined) => void
  reset: () => void
}

export const useBlockDistance = create<BlockDistanceState>()(
  persist(
    (set) => ({
      blocks: [],
      distances: {},
      setBlocks: (blocks) => set({ blocks: [...new Set(blocks.map(b => b.trim()).filter(Boolean))] }),
      addBlock: (name) =>
        set(s => {
          const n = (name ?? '').trim()
          if (!n || s.blocks.includes(n)) return s
          return { blocks: [...s.blocks, n] }
        }),
      removeBlock: (name) =>
        set(s => {
          const next: Record<string, number> = {}
          for (const k in s.distances) {
            const [a, b] = k.split('|')
            if (a !== name && b !== name) next[k] = s.distances[k]
          }
          return { blocks: s.blocks.filter(b => b !== name), distances: next }
        }),
      setDistance: (a, b, d) =>
        set(s => {
          const k = pairKey(a, b)
          const next = { ...s.distances }
          if (d == null || !isFinite(d) || d < 0) delete next[k]
          else next[k] = d
          return { distances: next }
        }),
      reset: () => set({ blocks: [], distances: {} }),
    }),
    { name: 'schedu-block-distance' },
  ),
)

// ── Pure helpers (unit-testable without the store) ─────────────────────────

/** Distance between two blocks: 0 for the same block, undefined if unrecorded. */
export function distanceBetween(
  a: string, b: string, distances: Record<string, number>,
): number | undefined {
  if (!a || !b) return undefined
  if (a.trim() === b.trim()) return 0
  return distances[pairKey(a, b)]
}

/**
 * Rank candidate venues by how close their block is to `fromBlock` — the
 * blueprint's stated purpose: "prefer nearer blocks over farther ones,
 * minimizing how far students have to travel between sessions."
 *
 * Unknown pairs sort last (but before nothing else changes), and ties keep the
 * caller's original order so an existing capacity-based sort is preserved.
 */
export function rankVenuesByProximity<T extends { building?: string }>(
  fromBlock: string | undefined,
  venues: T[],
  distances: Record<string, number>,
): T[] {
  if (!fromBlock) return venues
  return venues
    .map((v, i) => {
      const d = distanceBetween(fromBlock, v.building ?? '', distances)
      return { v, i, d: d == null ? Number.POSITIVE_INFINITY : d }
    })
    .sort((p, q) => (p.d - q.d) || (p.i - q.i))
    .map(x => x.v)
}

/** Every unordered pair of the given blocks — the cells an admin must fill. */
export function allPairs(blocks: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) out.push([blocks[i], blocks[j]])
  return out
}

/** Pairs with no recorded distance yet — surfaced so the admin can complete them. */
export function missingPairs(
  blocks: string[], distances: Record<string, number>,
): Array<[string, string]> {
  return allPairs(blocks).filter(([a, b]) => distances[pairKey(a, b)] == null)
}
