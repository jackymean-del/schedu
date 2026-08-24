import { useEffect } from "react"
import { useTimetableStore } from "@/store/timetableStore"
import { generateSections, generateStaff, generateSubjects, generateBreaks } from "@/lib/orgData"
import { buildPeriodSequence, generateTimetable, autoAssign } from "@/lib/aiEngine"
import type { Subject } from "@/types"
import { Sparkles } from "lucide-react"

export function DemoPage() {
  const store = useTimetableStore()

  const loadDemo = () => {
    const orgType     = 'school' as const
    const countryCode = 'IN'
    const workDays    = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']

    store.setConfig({ orgType, countryCode, workDays, periodsPerDay: 8, numBreaks: 4, numStaff: 8, numSections: 4, numSubjects: 8 })

    let secs     = generateSections(orgType, countryCode, 4)
    let staffArr = generateStaff(orgType, countryCode, 8)
    let subs: Subject[] = generateSubjects(orgType, countryCode, 8)
    const brks   = generateBreaks(orgType, 4)

    const assigned = autoAssign(secs, staffArr, subs)
    secs     = assigned.sections
    staffArr = assigned.staff.map(s => ({ ...s, shortName: '', isClassTeacher: s.isClassTeacher ?? '' }))
    subs     = assigned.subjects

    store.setSections(secs)
    store.setStaff(staffArr)
    store.setSubjects(subs)
    store.setBreaks(brks)

    const periods = buildPeriodSequence(brks, 8)
    const { classTT, teacherTT, conflicts } = generateTimetable(secs, staffArr, subs, periods, workDays)

    store.setPeriods(periods)
    store.setClassTT(classTT)
    store.setTeacherTT(teacherTT)
    store.setConflicts(conflicts)

    window.location.href = '/timetable'
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 'calc(100vh - 52px)',
      gap: 24, textAlign: 'center', padding: '0 24px',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 18,
        background: 'linear-gradient(135deg, #9B8EF5, #685DBC)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', boxShadow: '0 8px 20px rgba(124,111,224,0.3)',
      }}>
        <Sparkles size={32} />
      </div>

      <h1 className="font-serif" style={{ fontSize: 32 }}>Live Demo</h1>
      <p style={{ color: '#6a6860', maxWidth: 380, lineHeight: 1.65 }}>
        India school · 4 classes · 8 teachers · 6-day week<br />
        All features enabled — shifts, substitution, export
      </p>

      <button onClick={loadDemo} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 600,
        background: '#685DBC', color: '#fff', border: 'none',
        cursor: 'pointer', transition: 'all 0.18s',
        boxShadow: '0 4px 14px rgba(124,111,224,0.35)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
      >
        <Sparkles size={18} /> Load Demo Timetable
      </button>
    </div>
  )
}
