/**
 * Users — who belongs to this school, and what each of them may do.
 *
 * This page used to be a mock: "invite" validated an email, pushed it into
 * component state and drew an "Invited" chip. Nothing persisted, and no role was
 * ever assigned — which meant the permissions model had nothing to read and
 * every account behaved as an administrator. A faculty member could declare a
 * school-wide holiday.
 *
 * Now it is the real thing, and server-backed. The roster lives on the server
 * (handlers/collab.go) with store/members as its cache, because this list is
 * what decides whether a TEACHER may claim a period on their own phone. A
 * school that adds somebody only in its own browser has not added them at all.
 *
 * The staff name is the field that makes the rest work, and the least obvious:
 * the timetable names teachers by their ROSTER name ("R. Rao"), not by login,
 * so without that mapping a signed-in teacher is matched to no lessons and
 * every period reads "not yours to change" with nothing explaining why. The
 * page warns about it rather than leaving it to be discovered.
 */
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useOrgProfile } from '@/store/orgProfile'
import { useMembers, canDemote, ROLE_ORDER, ROLE_HINTS, type Member } from '@/store/members'
import { useTimetableStore } from '@/store/timetableStore'
import { pullMembers, upsertMember, setMemberRole, setMemberStaffName, removeMember as removeMemberRemote } from '@/lib/memberSync'
import { unmappedMembers, unknownStaffNames } from '@/lib/memberRules'
import { ROLE_LABELS, useCan, type Role } from '@/lib/permissions'
import { Trash2, ShieldCheck, Info, CloudOff, AlertTriangle } from 'lucide-react'

const ACCENT = '#685DBC'
const ROLE_STYLE: Record<Role, { bg: string; fg: string }> = {
  admin:   { bg: '#EDE9FF', fg: '#4B41C4' },
  teacher: { bg: '#DCFCE7', fg: '#15803D' },
  viewer:  { bg: '#F1F5F9', fg: '#475569' },
}

export function UsersPage() {
  const { user } = useAuthStore()
  const { name: orgName } = useOrgProfile()
  const { members } = useMembers()
  const canManage = useCan('holiday.manage')   // admin-only surface
  const staff = useTimetableStore(s => (s as any).staff) as any[] | undefined

  const [email, setEmail] = useState('')
  const [staffName, setStaffName] = useState('')
  const [role, setNewRole] = useState<Role>('teacher')
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  // The server's roster is the one that counts, so it is read on arrival and
  // its answer replaces whatever this browser remembered.
  useEffect(() => { pullMembers().then(okay => setOffline(!okay)) }, [])

  const staffNames = useMemo(() => (staff ?? []).map((x: any) => x?.name).filter(Boolean), [staff])
  const unmapped = useMemo(() => unmappedMembers(members), [members])
  const unknown = useMemo(() => unknownStaffNames(members, staffNames), [members, staffNames])

  const invite = async () => {
    const e = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setError('That doesn’t look like an email address.'); return }
    setError('')
    const landed = await upsertMember(e, role, staffName.trim() || undefined)
    setOffline(!landed)
    setEmail(''); setStaffName('')
  }

  const isSelf = (m: Member) => m.email === (user?.email ?? '').trim().toLowerCase()

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="👥" title="Users" description={`People with access to ${orgName || 'your organization'}.`} />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Say plainly what these roles do and do not do. Presenting a
            client-side roster as a security control would be a lie. */}
        <div style={{
          display: 'flex', gap: 9, alignItems: 'flex-start',
          background: '#F8F7FF', border: '1px solid #E8E4FF', borderRadius: 12,
          padding: '11px 14px', fontSize: 12, color: '#4B5275', lineHeight: 1.55,
        }}>
          <Info size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Roles decide what the app offers each person — who can declare holidays, mark absences and
            arrange cover, versus who only records their own syllabus. This roster is kept on the server,
            and it is <strong>what decides whether a teacher may claim a period</strong> from their own
            phone, so adding somebody here is what actually gives them access.
          </span>
        </div>

        {offline && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
            padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.55,
          }}>
            <CloudOff size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              This roster has not reached the server. You can keep editing it, but until the
              connection is back a person added here cannot sign in and see your timetable.
            </span>
          </div>
        )}

        {!!unmapped.length && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
            padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.55,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {unmapped.length === 1 ? 'One person has' : `${unmapped.length} people have`} no name
              set against the timetable: {unmapped.map(m => m.email).join(', ')}. They can sign in,
              but nothing will be matched to their lessons and every period will read “not yours to
              change”. Set the name your timetable uses for them.
            </span>
          </div>
        )}

        {!!unknown.length && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
            padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.55,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {unknown.map(m => `“${m.staffName}”`).join(', ')} {unknown.length === 1 ? 'is' : 'are'} not
              a name on your staff list, so it will match no lessons. A typo here fails exactly like a
              blank one — silently.
            </span>
          </div>
        )}

        <section style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', color: '#13111E' }}>Members</h2>
          <p style={{ fontSize: 12.5, color: '#6D6A8A', margin: '0 0 14px' }}>
            {members.length === 0
              ? 'Nobody has signed in yet. The first person to do so becomes the administrator.'
              : `${members.length} ${members.length === 1 ? 'person' : 'people'} · a role change takes effect the moment they reload.`}
          </p>

          {members.map(m => {
            const style = ROLE_STYLE[m.role]
            const lastAdmin = !canDemote(members, m.id)
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                borderTop: '1px solid #F3F1FB',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: m.status === 'active' ? ACCENT : '#E5E7EB',
                  color: m.status === 'active' ? '#fff' : '#69707E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                }}>
                  {(m.name ?? m.email)[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#13111E' }}>
                    {m.name ?? m.email.split('@')[0]}
                    {isSelf(m) && <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginLeft: 7 }}>you</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6D6A8A', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                </div>

                {/* The timetable name. Editable in place because it is the one
                    field that decides whether this account finds its lessons,
                    and it is usually wrong or missing rather than absent by
                    choice. */}
                {canManage && m.role !== 'viewer' && (
                  <input
                    defaultValue={m.staffName ?? ''}
                    list="schedu-staff-names"
                    aria-label={`Timetable name for ${m.email}`}
                    placeholder="timetable name"
                    title="How your timetable names this teacher. Without it, none of their lessons can be matched to them."
                    onBlur={e => {
                      const next = e.target.value.trim()
                      if (next === (m.staffName ?? '')) return
                      setMemberStaffName(m.id, m.email, m.role, next)
                        .then(landed => setOffline(!landed))
                    }}
                    style={{
                      width: 132, padding: '5px 9px', borderRadius: 7, fontSize: 12,
                      fontFamily: 'inherit', outline: 'none',
                      border: `1px solid ${(m.staffName ?? '').trim() ? '#E5E7EB' : '#FDE68A'}`,
                      background: (m.staffName ?? '').trim() ? '#fff' : '#FFFBEB',
                    }}
                  />
                )}

                {m.status === 'invited' && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#FEF3C7', padding: '3px 9px', borderRadius: 20 }}>
                    Invited
                  </span>
                )}

                {canManage ? (
                  <select
                    value={m.role}
                    /* Names WHOSE role this is — a row of identical "Role"
                       selects tells a screen-reader user nothing. */
                    aria-label={`Role for ${m.name || m.email}`}
                    disabled={lastAdmin}
                    title={lastAdmin
                      ? 'This is the only administrator. Promote somebody else first — otherwise nobody could manage the school.'
                      : ROLE_HINTS[m.role]}
                    onChange={e => setMemberRole(m.id, m.email, e.target.value as Role, m.staffName)
                      .then(landed => setOffline(!landed))}
                    style={{
                      padding: '5px 9px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${style.bg}`, background: lastAdmin ? '#F5F5F7' : style.bg,
                      color: lastAdmin ? '#777391' : style.fg,
                      fontFamily: 'inherit', cursor: lastAdmin ? 'not-allowed' : 'pointer',
                    }}>
                    {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: style.fg, background: style.bg, padding: '3px 10px', borderRadius: 20 }}>
                    {ROLE_LABELS[m.role]}
                  </span>
                )}

                {canManage && (
                  <button
                    onClick={() => removeMemberRemote(m.id).then(landed => setOffline(!landed))}
                    disabled={lastAdmin}
                    title={lastAdmin ? 'The only administrator cannot be removed.' : `Remove ${m.email}`}
                    style={{
                      border: 'none', background: 'none', padding: 4,
                      cursor: lastAdmin ? 'not-allowed' : 'pointer',
                      color: lastAdmin ? '#DDD8EE' : '#C9C3EC', display: 'flex',
                    }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}

          {members.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid #F3F1FB', fontSize: 11.5, color: '#777391', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <ShieldCheck size={13} color="#777391" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{ROLE_ORDER.map(r => `${ROLE_LABELS[r]} — ${ROLE_HINTS[r]}`).join('  ·  ')}</span>
            </div>
          )}
        </section>

        {canManage && (
          <section style={{ background: '#fff', border: '1px solid #ECE9FB', borderRadius: 14, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', color: '#13111E' }}>Add a teammate</h2>
            <p style={{ fontSize: 12.5, color: '#6D6A8A', margin: '0 0 14px' }}>
              Set their role now; it applies the first time they sign in with this address.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') invite() }}
                placeholder="name@school.edu"
                style={{ flex: 1, minWidth: 200, padding: '10px 12px', borderRadius: 9, border: `1px solid ${error ? '#FCA5A5' : '#E5E7EB'}`, fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }}
              />
              <input
                value={staffName}
                onChange={e => setStaffName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') invite() }}
                list="schedu-staff-names"
                aria-label="Their name in the timetable"
                placeholder="Their name in the timetable"
                title="The timetable names teachers by their roster name, not their login. Without this they cannot be matched to their own lessons."
                style={{ flex: 1, minWidth: 190, padding: '10px 12px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }}
              />
              <datalist id="schedu-staff-names">
                {staffNames.map((n: string) => <option key={n} value={n} />)}
              </datalist>
              <select value={role} aria-label="Role for the person you're adding" onChange={e => setNewRole(e.target.value as Role)}
                style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, fontWeight: 700, color: '#4B5275', fontFamily: 'inherit' }}>
                {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button onClick={invite}
                style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Add
              </button>
            </div>
            {error && <div style={{ fontSize: 12, color: '#B42318', marginTop: 8 }}>{error}</div>}
            <div style={{ fontSize: 11.5, color: '#777391', marginTop: 9 }}>{ROLE_HINTS[role]}</div>
          </section>
        )}
      </div>
    </div>
  )
}
