/**
 * Users — who belongs to this school, and what each of them may do.
 *
 * This page used to be a mock: "invite" validated an email, pushed it into
 * component state and drew an "Invited" chip. Nothing persisted, and no role was
 * ever assigned — which meant the permissions model had nothing to read and
 * every account behaved as an administrator. A faculty member could declare a
 * school-wide holiday.
 *
 * Now it is the real thing: the roster in store/members, which lib/permissions
 * resolves the signed-in person against by email.
 */
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { useOrgProfile } from '@/store/orgProfile'
import { useMembers, canDemote, ROLE_ORDER, ROLE_HINTS, type Member } from '@/store/members'
import { ROLE_LABELS, useCan, type Role } from '@/lib/permissions'
import { Trash2, ShieldCheck, Info } from 'lucide-react'

const ACCENT = '#7C6FE0'
const ROLE_STYLE: Record<Role, { bg: string; fg: string }> = {
  admin:   { bg: '#EDE9FF', fg: '#4B41C4' },
  teacher: { bg: '#DCFCE7', fg: '#15803D' },
  viewer:  { bg: '#F1F5F9', fg: '#475569' },
}

export function UsersPage() {
  const { user } = useAuthStore()
  const { name: orgName } = useOrgProfile()
  const { members, addMember, setRole, removeMember } = useMembers()
  const canManage = useCan('holiday.manage')   // admin-only surface

  const [email, setEmail] = useState('')
  const [role, setNewRole] = useState<Role>('teacher')
  const [error, setError] = useState('')

  const invite = () => {
    const e = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setError('That doesn’t look like an email address.'); return }
    addMember(e, role)
    setEmail(''); setError('')
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
            arrange cover, versus who only records their own syllabus. They are stored with your school's
            data and applied in the browser; they are <strong>not yet enforced by the server</strong>, so
            treat them as workflow rather than security until the API supports member accounts.
          </span>
        </div>

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
                    onChange={e => setRole(m.id, e.target.value as Role)}
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
                    onClick={() => removeMember(m.id)}
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
