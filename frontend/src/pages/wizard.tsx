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
import { CheckCircle2, Lock }  from 'lucide-react'
import { StepGuide }         from '@/components/StepGuide'
import { markActiveTimetableUnpublished } from '@/lib/ttRegistry'

// Inline guide content per step (index = step - 1). Matches the STEPS order.
const STEP_GUIDES: { title: string; tips: string[] }[] = [
  { title: 'Step 1 · Resources', tips: [
    'Add your classes, teachers, subjects and rooms — the building blocks of every schedule.',
    'In a hurry? Use “Generate” to create an editable starting set from your setup, then refine.',
    'Switch tabs to enter each type, or use + Add to enter rows manually.',
  ] },
  { title: 'Step 2 · Shift & Timing', tips: [
    'Define your daily periods and breaks — start/end times, period length and lunch.',
    'Set the working days and any shifts; this becomes the grid every class is scheduled into.',
  ] },
  { title: 'Step 3 · Groups & Combos', tips: [
    'Set up electives and combined groups (students pick one option, or classes merge for a subject).',
    'Skip this step if your classes don’t share subjects across sections.',
    'These rules come first because Mapping allocates around them.',
  ] },
  { title: 'Step 4 · Mapping', tips: [
    'Map each subject to its class-sections, then map those to teachers.',
    'Subject and teacher mappings stay in sync — edit either side and the other reflows.',
    'Overloaded faculty or venues are flagged here, with one-click load optimisation.',
  ] },
  { title: 'Step 5 · Review & Generate', tips: [
    'Review your setup, then generate a conflict-free schedule.',
    'You can re-generate or hand-edit any cell afterwards.',
  ] },
]

// ── Step registry ─────────────────────────────────────────────
// Groups & Combos comes BEFORE Mapping. Blueprint v6 Step 5: Mapping "depends
// on Step 2 (subjects/teachers/venues), Step 3 (time grid), and Step 4
// (parallel-subject rules) — this is the only step that requires all three prior
// steps to be complete." Mapping consumes the AND/OR rules, so configuring them
// afterwards meant mapping against rules that didn't exist yet.
const STEPS = [StepResourcesV2, StepBell, StepStudentGroups, StepAllocation, Step6Generate]

// Names live in lib/wizardSteps — see the note there on why they are not here.
import { WIZARD_STEPS as STEP_META } from '@/lib/wizardSteps'


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

// ── Step-0 gate screen ────────────────────────────────────────
function WizardSetupGate() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 52px)', background: '#F5F4F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: '#EDE9FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
          fontSize: 28,
        }}>🗓️</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#13111E', margin: '0 0 8px' }}>
          Let’s set up your timetable first
        </h2>
        <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6, margin: '0 0 22px' }}>
          Before the wizard can help, it needs the basics — a name, your class range and
          approximate counts. Create a timetable to get started; you’ll land right back here.
        </p>
        <a href="/dashboard?new=1" style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 9,
          background: '#7C6FE0', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
        }}>+ Create a schedule</a>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export function WizardPage() {
  const { step, setStep, config, timetableStatus, setTimetableStatus } = useTimetableStore()
  const { isAuthenticated, user } = useAuthStore()

  const CurrentStep = STEPS[step - 1] ?? StepBell
  const total = STEPS.length

  // Blueprint v3, Step 7: "Publishing locks the wizard steps — Steps 1–6 become
  // read-only until a new schedule cycle is started." The steps stay visible and
  // browsable (so the published setup can be inspected), but nothing is editable
  // until the admin explicitly unpublishes.
  const locked = timetableStatus === 'published'
  const unlock = () => {
    setTimetableStatus('draft')
    markActiveTimetableUnpublished()
  }

  const ttName = (config as any).timetableName
    || (user?.schoolName ? `${user.schoolName} · Schedule` : 'Untitled schedule')

  // ── Step-0 gate ──────────────────────────────────────────────
  // The wizard needs a configured timetable (name + class range/counts), which
  // is captured by the "New timetable" dialog. If someone lands here directly
  // (e.g. a sidebar link) with nothing set up, guide them to create one first.
  const isConfigured = Boolean((config as any).timetableName)
  if (!isConfigured) return <WizardSetupGate />

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 52px)',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
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
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4 }}>
          <svg width="10" height="10" viewBox="0 0 52 52" style={{ marginBottom: 1 }}>
            <path d="M 16 9 L 16 30 A 10 10 0 0 0 36 30 L 36 22" fill="none" stroke="#13111E" strokeWidth="8" strokeLinecap="round"/>
            <circle cx="36" cy="12.5" r="4.5" fill="#D4920E"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.3px', color: '#13111E' }}>
            sched<span style={{ color: '#7C6FE0', fontFamily: "'Plus Jakarta Sans',Georgia,serif", fontStyle: 'italic' }}>U</span>
          </span>
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
                  // When published the wizard is read-only, but every step stays
                  // browsable so the locked setup can still be inspected.
                  onClick={() => (locked || done) && setStep(n)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, cursor: (locked || done) ? 'pointer' : 'default', flexShrink: 0,
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

      {/* ══ Published lock banner (Blueprint Step 7) ══ */}
      {locked && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 28px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A',
        }}>
          <Lock size={14} color="#B45309" />
          <span style={{ fontSize: 12.5, color: '#92400E' }}>
            <strong>Published — steps are locked.</strong> This schedule is live, so the setup is read-only.
            Browse any step to review it; unpublish to make changes.
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={unlock}
            style={{
              padding: '5px 13px', borderRadius: 7, border: '1px solid #FBBF24',
              background: '#fff', color: '#92400E', fontSize: 11.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Unpublish to edit
          </button>
        </div>
      )}

      {/* ══ Content area ══════════════════════════════ */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: '#F5F4F0',
      }}>
        {STEP_GUIDES[step - 1] && (
          <div style={{ padding: '14px 20px 0' }}>
            <StepGuide title={STEP_GUIDES[step - 1].title} tips={STEP_GUIDES[step - 1].tips} />
          </div>
        )}
        {/* Read-only while published: the step still renders (so it can be
            reviewed) but no control inside it can be operated. */}
        <div
          style={locked ? { pointerEvents: 'none', opacity: 0.72, userSelect: 'text' } : undefined}
          aria-disabled={locked || undefined}
        >
          <StepErrorBoundary step={step}>
            <CurrentStep />
          </StepErrorBoundary>
        </div>
      </div>

    </div>
  )
}
