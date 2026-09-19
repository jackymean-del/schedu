/**
 * The roster, reconciled with the server.
 *
 * store/members began as a client-side list with nothing behind it and said so
 * in its own doc comment: "when the API gains member management, this store
 * becomes its cache and the server's answer wins." This is that.
 *
 * It matters more than a cache usually would. The server decides whether a
 * teacher may take a period by looking up their account in THIS roster, so a
 * school that adds somebody only in its own browser has not added them at all:
 * the teacher signs in and is told no school has listed them. Every write here
 * goes to the server first and the local store follows.
 *
 * Offline is a real state, not an error. A school with no network can still
 * read and edit its own roster; the page says plainly that the change has not
 * reached the server yet, rather than pretending it has.
 */
import { memberApi } from '@/api/client'
import { useMembers } from '@/store/members'
import { toMembers } from './memberRules'
import type { Role } from '@/lib/permissionPolicy'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline'

/** Pull the server's roster into the store. Returns whether it succeeded. */
export async function pullMembers(): Promise<boolean> {
  try {
    const res = await memberApi.list()
    useMembers.getState().replaceMembers(toMembers(res.data?.members))
    return true
  } catch {
    return false
  }
}

/**
 * Add or update somebody, server first.
 *
 * The local store is updated either way — a school offline must still be able
 * to build its roster — but the caller is told whether it landed, because
 * "invited" means nothing until the server knows.
 */
export async function upsertMember(
  email: string, role: Role, staffName?: string,
): Promise<boolean> {
  useMembers.getState().addMember(email, role, undefined, staffName)
  try {
    await memberApi.upsert({ email, role, staffName })
    // Re-read rather than trusting the local guess: the server assigns the id,
    // and it is the id every later edit is addressed by.
    return await pullMembers()
  } catch {
    return false
  }
}

/** Change a role. The server's roster is what gates a teacher's claims. */
export async function setMemberRole(id: string, email: string, role: Role, staffName?: string): Promise<boolean> {
  useMembers.getState().setRole(id, role)
  try {
    await memberApi.upsert({ email, role, staffName })
    return true
  } catch {
    return false
  }
}

/** Set the timetable name this account is known by — the join that makes a
 *  teacher's own lessons findable. */
export async function setMemberStaffName(
  id: string, email: string, role: Role, staffName: string,
): Promise<boolean> {
  useMembers.getState().setStaffName(id, staffName)
  try {
    await memberApi.upsert({ email, role, staffName })
    return true
  } catch {
    return false
  }
}

/** Remove somebody. */
export async function removeMember(id: string): Promise<boolean> {
  useMembers.getState().removeMember(id)
  try {
    await memberApi.remove(id)
    return true
  } catch {
    return false
  }
}
