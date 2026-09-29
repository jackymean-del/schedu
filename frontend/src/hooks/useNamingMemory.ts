/**
 * useNamingMemory - per-user AI naming brain.
 *
 * Learns from every commit the user makes in the data grids:
 *  - Subject name → Short form  (e.g. "Mathematics" → "MATH")
 *  - Section name → Grade       (e.g. "10-A" → "10")
 *  - Custom streams, categories, room types they add
 *
 * Persisted in localStorage keyed by the logged-in user's ID so each
 * user/school gets their own independent vocabulary.
 *
 * Priority chain for subject short-form suggestions:
 *   1. User's own history (exact match, case-insensitive)
 *   2. Built-in SUBJECT_ABBR table (Indian K-12 curriculum)
 *   3. Algorithmic fallback (first 4 chars / initials)
 */

import { useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NamingMemory {
  /** Subject full-name → user's preferred short form */
  subjectShort: Record<string, string>
  /** Learned section patterns, e.g. "10" (prefix before last hyphen) → confirms convention */
  sectionGradePrefixes: string[]
  /** Custom stream names the user has typed (not in the defaults list) */
  customStreams: string[]
  /** Custom subject categories */
  customCategories: string[]
  /** Custom room types */
  customRoomTypes: string[]
}

const EMPTY: NamingMemory = {
  subjectShort: {},
  sectionGradePrefixes: [],
  customStreams: [],
  customCategories: [],
  customRoomTypes: [],
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function key(userId: string) {
  return `schedu_naming_${userId}`
}

function loadMemory(userId: string): NamingMemory {
  try {
    const raw = localStorage.getItem(key(userId))
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

function saveMemory(userId: string, mem: NamingMemory) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(mem))
  } catch {
    // Ignore storage errors (quota, private mode)
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNamingMemory() {
  const userId = useAuthStore(s => s.user?.id ?? 'guest')

  /**
   * Remember that `subjectName` → `shortForm`.
   * Called when a user manually types or edits the Short column.
   */
  const rememberSubjectShort = useCallback((subjectName: string, shortForm: string) => {
    if (!subjectName.trim() || !shortForm.trim()) return
    const mem = loadMemory(userId)
    mem.subjectShort[subjectName.trim()] = shortForm.trim().toUpperCase()
    saveMemory(userId, mem)
  }, [userId])

  /**
   * Suggest a short form for a subject name.
   * Returns the user's own remembered value if any, null otherwise.
   * Callers should fall through to the built-in table and algorithm.
   */
  const suggestShort = useCallback((subjectName: string): string | null => {
    if (!subjectName.trim()) return null
    const mem = loadMemory(userId)
    const trimmed = subjectName.trim()
    // Exact match
    if (mem.subjectShort[trimmed]) return mem.subjectShort[trimmed]
    // Case-insensitive
    const lower = trimmed.toLowerCase()
    for (const [k, v] of Object.entries(mem.subjectShort)) {
      if (k.toLowerCase() === lower) return v
    }
    return null
  }, [userId])

  /** Remember a custom stream name the user typed. */
  const rememberStream = useCallback((stream: string) => {
    if (!stream.trim()) return
    const mem = loadMemory(userId)
    if (!mem.customStreams.includes(stream.trim())) {
      mem.customStreams.push(stream.trim())
      saveMemory(userId, mem)
    }
  }, [userId])

  /** Remember a custom category the user typed. */
  const rememberCategory = useCallback((category: string) => {
    if (!category.trim()) return
    const mem = loadMemory(userId)
    if (!mem.customCategories.includes(category.trim())) {
      mem.customCategories.push(category.trim())
      saveMemory(userId, mem)
    }
  }, [userId])

  /** Remember a custom room type the user typed. */
  const rememberRoomType = useCallback((roomType: string) => {
    if (!roomType.trim()) return
    const mem = loadMemory(userId)
    if (!mem.customRoomTypes.includes(roomType.trim())) {
      mem.customRoomTypes.push(roomType.trim())
      saveMemory(userId, mem)
    }
  }, [userId])

  /** Get all remembered custom streams (for adding to the options list). */
  const getCustomStreams = useCallback((): string[] => {
    return loadMemory(userId).customStreams
  }, [userId])

  /** Get all remembered custom categories. */
  const getCustomCategories = useCallback((): string[] => {
    return loadMemory(userId).customCategories
  }, [userId])

  /** Get all remembered custom room types. */
  const getCustomRoomTypes = useCallback((): string[] => {
    return loadMemory(userId).customRoomTypes
  }, [userId])

  return {
    rememberSubjectShort,
    suggestShort,
    rememberStream,
    rememberCategory,
    rememberRoomType,
    getCustomStreams,
    getCustomCategories,
    getCustomRoomTypes,
  }
}
