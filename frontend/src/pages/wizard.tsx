/**
 * Wizard shell — Page 6+ redesign
 *
 * Layout (no left sidebar):
 *   ┌─ [Top bar from __root.tsx WizardTopbar] ────────────────────┐
 *   ├─ Horizontal 5-step progress bar ───────────────────────────┤
 *   │  ①─────②─────③─────④─────⑤                                │
 *   │  Shift  Res   Alloc  Grps  Review                           │
 *   ├─ Content area (F5F4F0 cream) ─────────────────────────────┤
 *   │  <CurrentStep />                                            │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Step order:
 *   1. Shift & timing   (StepBell)
 *   2. Resources        (StepResourcesV2)
 *   3. Allocation       (StepAllocation)
 *   4. Student groups   (StepStudentGroups)
 *   5. Review & generate (Step6Generate)
 */

import { Component, Fragment, type ReactNode } from 'react'
import { useTimetableStore } from '@/store/timetableStore'
import { useAuthStore } from '@/store/authStore'
import { StepBell }          from '@/routes/wizard/step-bell'
import { StepResourcesV2 }   from '@/routes/wizard/step-resources-v2'
import { StepAllocation }    from '@/routes/wizard/step-allocation'
import { StepStudentGroups } from '@/routes/wizard/step-student-groups'
import { Step6Generate }     from '@/routes/wizard/step6-generate'
import { CheckCircle2 }      from 'lucide-react'

// ── Step registry ─────────────────────────────────────────────
const STEPS = [StepResourcesV2, StepBell, StepAllocation, StepStudentGroups, Step6Generate]

const STEP_META = [
  { label: 'Resources',         sub: 'Classes, subjects, teachers & rooms'  },
  { label: 'Shift & timing',    sub: 'Days, periods & breaks'               },
  { label: 'Allocation',        sub: 'Period × subject + teacher assignment' },
  { label: 'Student groups',    sub: 'Preferences, grouping rules & AI'     },
  { label: 'Review & generate', sub: 'AI builds your timetable'             },
]

// ── Error boundary ────────────────────────────────────────────
class StepErrorBoundary extends Component<
  { children: ReactNode; step: number },
  { error: string | null }
> {
  constructor(props: any) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 28, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, margin: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>
          ⚠️ Step {this.props.step} error
        </div>
        <div style={{
          fontSize: 11, color: '#7f1d1d', fontFamily: 'monospace',
          marginBottom: 16, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto',
        }}>
          {this.state.error}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { this.setState({ error: null }); useTimetableStore.getState().resetWizard() }}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12 }}
          >
            Reset Wizard
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── Main ──────────────────────────────────────────────────────
export function WizardPage() {
  const { step, setStep, config } = useTimetableStore()
  const { isAuthenticated, user } = useAuthStore()

  const CurrentStep = STEPS[step - 1] ?? StepBell
  const total = STEPS.length

  const ttName = (config as any).timetableName
    || (user?.schoolName ? `${user.schoolName} · Timetable` : 'AY 2025–26 · Main Timetable')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* ══ Timetable name sub-bar ══════════════════════ */}
      <div style={{
        height: 38,
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center',
        padding: '0 28px',
        flexShrink: 0,
        gap: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.3px', color: '#13111E' }}>
          sched<span style={{ color: '#7C6FE0', fontFamily: "'DM Serif Display',Georgia,serif", fontStyle: 'italic' }}>U</span>
        </span>
        <span style={{ color: '#D1D5DB' }}>|</span>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{ttName}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: '#6B7280' }}>Auto-saved</span>
        </div>
      </div>

      {/* ══ Horizontal step bar ════════════════════════ */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        padding: '14px 40px',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          maxWidth: 760, margin: '0 auto',
        }}>
          {STEP_META.map((s, i) => {
            const n      = i + 1
            const active = step === n
            const done   = step > n

            return (
              <Fragment key={n}>
                {/* Step item */}
                <div
                  onClick={() => done && setStep(n)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, cursor: done ? 'pointer' : 'default', flexShrink: 0,
                  }}
                >
                  {/* Circle */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: active ? '#7C6FE0' : done ? '#7C6FE0' : '#fff',
                    border: active || done ? 'none' : '1.5px solid #D1D5DB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: active ? '0 0 0 4px rgba(124,111,224,0.15)' : 'none',
                    transition: 'all 0.2s',
                  }}>
                    {done
                      ? <CheckCircle2 size={14} color="#fff" />
                      : <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#fff' : '#9CA3AF' }}>{n}</span>
                    }
                  </div>

                  {/* Label */}
                  <div style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#13111E' : done ? '#7C6FE0' : '#9CA3AF',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}>
                    {s.label}
                  </div>
                </div>

                {/* Connector line */}
                {i < STEP_META.length - 1 && (
                  <div style={{
                    flex: 1,
                    height: 1.5,
                    background: done ? '#7C6FE0' : '#E5E7EB',
                    margin: '0 6px',
                    marginBottom: 20,   // vertically aligned with circle centers
                    transition: 'background 0.3s',
                  }} />
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* ══ Content area ══════════════════════════════ */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: '#F5F4F0',
      }}>
        <StepErrorBoundary step={step}>
          <CurrentStep />
        </StepErrorBoundary>
      </div>

    </div>
  )
}
