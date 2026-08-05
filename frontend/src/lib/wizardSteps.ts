/**
 * The wizard's steps, named once.
 *
 * Four lists of these names existed — in pages/wizard (the stepper), pages/root
 * (the topbar), pages/dashboard (the resume hint) and a dead sidebar — and
 * three of them disagreed. The same step read "Groups & Combos", "Student
 * Groups" and "Student groups" depending on where you looked, and the dead one
 * still had the pre-reorder ORDER, with Allocation at step 3.
 *
 * This has now drifted three separate times, most recently after the v6
 * reorder. One list, imported everywhere.
 *
 * DELIBERATELY a standalone module with no component imports: pages/root shows
 * the step name in the topbar on every route, and importing it from
 * pages/wizard would drag the wizard's own chunk — the largest in the app — into
 * the shell that loads on first paint.
 */

export interface WizardStep {
  /** Shown in the stepper, the topbar and the dashboard's resume hint. */
  label: string
  /** One-line description, stepper only. */
  sub: string
}

/** In running order. Blueprint v6: Groups & Combos precedes Mapping, because
 *  Mapping depends on the parallel-subject rules that step establishes. */
export const WIZARD_STEPS: WizardStep[] = [
  { label: 'Resources',         sub: 'Classes, subjects, teachers & rooms'       },
  { label: 'Shift & timing',    sub: 'Days, periods & breaks'                    },
  { label: 'Groups & Combos',   sub: 'Student groups, OR/AND combos & rules'     },
  { label: 'Mapping',           sub: 'Subject → class-section → teacher mapping' },
  { label: 'Review & generate', sub: 'HI builds your schedule'                   },
]

export const WIZARD_STEP_COUNT = WIZARD_STEPS.length

/** Label for a 1-based step number, or '' when out of range. */
export const wizardStepLabel = (step: number): string =>
  WIZARD_STEPS[step - 1]?.label ?? ''
