/**
 * Guide — getting-started walkthrough for new users.
 */
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckCircle2, Circle } from 'lucide-react'
import { useTimetableStore } from '@/store/timetableStore'
import { useOrgProfile } from '@/store/orgProfile'

const STEPS = [
  {
    n: 1,
    title: 'Set up your organization',
    body: 'Go to Settings and fill in your organization name, type and planning period. This personalizes SchedU to your institution.',
    cta: { label: 'Open Settings', href: '/settings' },
  },
  {
    n: 2,
    title: 'Create a timetable',
    body: 'Click "+ New timetable" on the Dashboard. Give it a name, enter your class range (e.g. Class I to Class X) and number of sections.',
    cta: { label: 'Go to Dashboard', href: '/dashboard' },
  },
  {
    n: 3,
    title: 'Add resources',
    body: 'In the wizard, add your subjects, teachers and rooms. The engine auto-generates sensible defaults for your grade range — you can edit anything.',
    cta: { label: 'Open Master Data', href: '/master-data' },
  },
  {
    n: 4,
    title: 'Configure shifts & timings',
    body: 'Set your school start time, period duration, breaks, and working days. Use "Auto" to let SchedU calculate max periods per day from your bell schedule.',
    cta: null,
  },
  {
    n: 5,
    title: 'Set period allocations',
    body: 'Review how many periods per week each subject gets per class. The engine pre-fills based on board norms — adjust as needed.',
    cta: null,
  },
  {
    n: 6,
    title: 'Generate & publish',
    body: 'Click "Generate Timetable". SchedU solves all conflicts automatically. Review the result, fix any warnings, then click Publish to lock it in.',
    cta: { label: 'View Timetable', href: '/timetable' },
  },
]

export function GuidePage() {
  const { name: orgName } = useOrgProfile()
  const sections = useTimetableStore(s => s.sections)
  const classTT  = useTimetableStore(s => s.classTT)

  const doneStep = (n: number) => {
    if (n === 1) return Boolean(orgName)
    if (n === 2) return sections.length > 0
    if (n === 3) return sections.length > 0
    if (n === 6) return Object.keys(classTT).length > 0
    return false
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FF' }}>
      <PageHeader icon="📖" title="Getting Started" description="Follow these steps to publish your first timetable." />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STEPS.map(step => {
          const done = doneStep(step.n)
          return (
            <div key={step.n} style={{
              background: '#fff', border: `1.5px solid ${done ? '#D1FAE5' : '#ECE9FB'}`,
              borderRadius: 14, padding: '18px 20px',
              display: 'flex', gap: 16, alignItems: 'flex-start',
            }}>
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                {done
                  ? <CheckCircle2 size={20} color="#10B981" />
                  : <Circle size={20} color="#C4BFEA" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: done ? '#059669' : '#7C6FE0',
                    background: done ? '#D1FAE5' : '#EDE9FF',
                    padding: '2px 8px', borderRadius: 20,
                  }}>Step {step.n}</span>
                  {done && <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>Done</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#13111E', marginBottom: 5 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: '#4B5275', lineHeight: 1.6 }}>{step.body}</div>
                {step.cta && (
                  <a href={step.cta.href} style={{
                    display: 'inline-block', marginTop: 10,
                    padding: '6px 16px', borderRadius: 8,
                    background: done ? '#F0FDF4' : '#7C6FE0',
                    color: done ? '#059669' : '#fff',
                    fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                    border: done ? '1px solid #A7F3D0' : 'none',
                  }}>{step.cta.label} →</a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
