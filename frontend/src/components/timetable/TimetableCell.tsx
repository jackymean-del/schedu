import { cn } from '@/lib/utils'
import { getSubjectColor } from '@/lib/orgData'
import type { TimetableCell as CellType } from '@/types'

interface TimetableCellProps {
  cell: CellType | undefined
  periodId: string
  day: string
  sectionName: string
  showTeacher: boolean
  showRoom: boolean
  editMode: boolean
  isSubstituted?: boolean
  substituteTeacher?: string
  onClick?: () => void
}

type GroupAssignment = { subject: string; teacher?: string; room?: string }

// ── AND/OR parser ──────────────────────────────────────────────────────────────
export type ParsedCell =
  | { type: 'single'; subject: string }
  | { type: 'group'; logic: 'OR' | 'AND'; subjects: string[] }

export function parseCellSubject(raw: string): ParsedCell {
  if (!raw) return { type: 'single', subject: raw }
  if (raw.includes(' OR ')) return { type: 'group', logic: 'OR',  subjects: raw.split(' OR ').map(s => s.trim()) }
  if (raw.includes(' AND ')) return { type: 'group', logic: 'AND', subjects: raw.split(' AND ').map(s => s.trim()) }
  return { type: 'single', subject: raw }
}

// ── Colours ────────────────────────────────────────────────────────────────────
const OR_CHIP  = { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', tag: '#D97706' }
const AND_CHIP = { bg: '#EDE9FF', border: '#C4B5FD', text: '#3730A3', tag: '#685DBC' }

// ── Sub-components ────────────────────────────────────────────────────────────
function GroupCell({
  parsed, teacher, room, showTeacher, showRoom, isSubstituted, substituteTeacher, groupAssignments,
}: {
  parsed: Extract<ParsedCell, { type: 'group' }>
  teacher: string; room: string
  showTeacher: boolean; showRoom: boolean
  isSubstituted?: boolean; substituteTeacher?: string
  groupAssignments?: GroupAssignment[]
}) {
  const c = parsed.logic === 'OR' ? OR_CHIP : AND_CHIP

  // Build a map from subject name → { teacher, room } for quick lookup
  const gaMap: Record<string, GroupAssignment> = {}
  if (groupAssignments?.length) {
    for (const ga of groupAssignments) gaMap[ga.subject] = ga
  }

  const hasPerSubject = groupAssignments && groupAssignments.length > 0

  return (
    <div style={{
      borderRadius: 5, padding: '2px 4px', minHeight: 28,
      background: c.bg, border: `1px solid ${c.border}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      position: 'relative', cursor: 'inherit',
    }}>
      {isSubstituted && (
        <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
      )}
      {/* Logic tag */}
      <span style={{
        fontSize: 7, fontWeight: 900, letterSpacing: '0.06em',
        background: c.tag, color: '#fff', borderRadius: 2,
        padding: '0 3px 0.5px', alignSelf: 'flex-start', marginBottom: 3,
      }}>
        {parsed.logic}
      </span>

      {hasPerSubject ? (
        /* Per-subject rows (teacher + room per entry) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {parsed.subjects.map(sub => {
            const ga = gaMap[sub]
            const displayT = isSubstituted && sub === parsed.subjects[0]
              ? (substituteTeacher ?? ga?.teacher ?? '')
              : (ga?.teacher ?? '')
            return (
              <div key={sub} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>
                  {sub}
                </span>
                {showTeacher && displayT && (
                  <span style={{ fontSize: 7, opacity: 0.65, fontFamily: 'monospace', lineHeight: 1.2 }}>
                    {isSubstituted && sub === parsed.subjects[0] && '🔄 '}{displayT}
                  </span>
                )}
                {showRoom && ga?.room && (
                  <span style={{ fontSize: 6.5, opacity: 0.5, lineHeight: 1.2 }}>{ga.room}</span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Legacy: single teacher/room for the whole group */
        <>
          <span style={{
            fontSize: 9, fontWeight: 700, color: c.text, lineHeight: 1.3,
            wordBreak: 'break-word',
          }}>
            {parsed.subjects.join(` ${parsed.logic} `)}
          </span>
          {showTeacher && (isSubstituted ? (substituteTeacher ?? teacher) : teacher) && (
            <span style={{ fontSize: 7.5, opacity: 0.7, fontFamily: 'monospace', marginTop: 1 }}>
              {isSubstituted && '🔄 '}{isSubstituted ? (substituteTeacher ?? teacher) : teacher}
            </span>
          )}
          {showRoom && room && (
            <span style={{ fontSize: 7, opacity: 0.55, marginTop: 0.5 }}>{room}</span>
          )}
        </>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────
export function TimetableCell({
  cell, showTeacher, showRoom, editMode,
  isSubstituted, substituteTeacher, onClick,
}: TimetableCellProps) {
  if (!cell?.subject) {
    return (
      <div className="bg-gray-50 text-gray-400 rounded text-[9.5px] px-1.5 py-1 min-h-[28px] flex items-center justify-center italic">
        —
      </div>
    )
  }

  const parsed = parseCellSubject(cell.subject)
  const displayTeacher = isSubstituted ? (substituteTeacher ?? cell.teacher) : cell.teacher

  if (parsed.type === 'group') {
    return (
      <div
        className={cn(editMode && 'cursor-pointer')}
        onClick={editMode ? onClick : undefined}
      >
        <GroupCell
          parsed={parsed}
          teacher={cell.teacher ?? ''}
          room={cell.room ?? ''}
          showTeacher={showTeacher}
          showRoom={showRoom}
          isSubstituted={isSubstituted}
          substituteTeacher={substituteTeacher}
          groupAssignments={cell.groupAssignments}
        />
      </div>
    )
  }

  // Single subject — original behaviour
  const colorClass = getSubjectColor(cell.subject)
  return (
    <div
      className={cn(
        'rounded px-1.5 py-1 min-h-[28px] flex flex-col justify-center transition-all relative',
        colorClass,
        editMode && 'cursor-pointer hover:brightness-90 hover:shadow-md',
        isSubstituted && 'outline-2 outline-dashed outline-amber-400 outline-offset-1',
      )}
      onClick={editMode ? onClick : undefined}
    >
      {isSubstituted && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
      <span className="text-[9.5px] font-bold leading-tight">{cell.subject}</span>
      {showTeacher && displayTeacher && (
        <span className="text-[8px] opacity-70 font-mono mt-0.5 leading-tight">
          {isSubstituted && '🔄 '}{displayTeacher}
        </span>
      )}
      {showRoom && cell.room && (
        <span className="text-[7.5px] opacity-55 mt-0.5">{cell.room}</span>
      )}
      {cell.isClassTeacher && (
        <span className="text-[7px] bg-black/10 px-1 py-0.5 rounded mt-1 inline-block">★ CT</span>
      )}
    </div>
  )
}
