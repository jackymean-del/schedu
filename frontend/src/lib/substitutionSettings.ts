/**
 * Substitution Settings — how Calendar ranks and auto-picks substitute
 * teachers. Lives on the active schedule (persisted via the timetable
 * snapshot, same as `substitutions` itself) so different academic years or
 * schools using the same account can tune this independently.
 */
export type WeightLevel = 'off' | 'low' | 'medium' | 'high'
export type MatchTier = 'exact' | 'class' | 'subject' | 'none'

export const WEIGHT_LEVELS: WeightLevel[] = ['off', 'low', 'medium', 'high']
export const WEIGHT_LABEL: Record<WeightLevel, string> = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' }
export function weightValue(level: WeightLevel): number {
  return { off: 0, low: 1, medium: 2, high: 3 }[level]
}

export interface ScoringWeights {
  exactMatch: WeightLevel          // same subject AND same class, proven elsewhere in the schedule
  classFamiliarity: WeightLevel    // teaches this class, different subject
  subjectFamiliarity: WeightLevel  // teaches this subject, different class
  dailyWorkloadBalance: WeightLevel
  weeklyWorkloadBalance: WeightLevel
  dailySubBalance: WeightLevel
  weeklySubBalance: WeightLevel
}

export interface SubstitutionDefaults {
  autoSuggestionsEnabled: boolean
  maxSuggestionsToShow: number | null   // null = show all available
  maxPeriodsPerDay: number              // total periods including substitutions
  maxSubstitutesPerDay: number
  maxSubstitutesPerWeek: number
}

export interface FacultySubOverride {
  canSub: boolean
  maxSubsPerDay?: number    // undefined = use the default
  maxSubsPerWeek?: number
  autoAssign: boolean       // eligible for one-click Auto-Assign (vs. manual pick only)
}

export interface SubstitutionSettings {
  weights: ScoringWeights
  defaults: SubstitutionDefaults
  facultyOverrides: Record<string, FacultySubOverride>   // keyed by staff id
}

export const DEFAULT_SUBSTITUTION_SETTINGS: SubstitutionSettings = {
  weights: {
    exactMatch: 'high',
    classFamiliarity: 'medium',
    subjectFamiliarity: 'low',
    dailyWorkloadBalance: 'medium',
    weeklyWorkloadBalance: 'low',
    dailySubBalance: 'low',
    weeklySubBalance: 'low',
  },
  defaults: {
    autoSuggestionsEnabled: true,
    maxSuggestionsToShow: null,
    maxPeriodsPerDay: 8,
    maxSubstitutesPerDay: 3,
    maxSubstitutesPerWeek: 10,
  },
  facultyOverrides: {},
}

export function overrideFor(settings: SubstitutionSettings, staffId: string): FacultySubOverride {
  return settings.facultyOverrides[staffId] ?? { canSub: true, autoAssign: true }
}

export function effectiveMaxPerDay(settings: SubstitutionSettings, staffId: string): number {
  return overrideFor(settings, staffId).maxSubsPerDay ?? settings.defaults.maxSubstitutesPerDay
}

export function effectiveMaxPerWeek(settings: SubstitutionSettings, staffId: string): number {
  return overrideFor(settings, staffId).maxSubsPerWeek ?? settings.defaults.maxSubstitutesPerWeek
}

/** Combined weighted score — higher is better. Match tier dominates (scaled
 *  up ×100) so it always outranks workload/balance tie-breaking, which then
 *  decides between otherwise-equal candidates. */
export function scoreCandidate(weights: ScoringWeights, params: {
  tier: MatchTier; todayLoad: number; weekLoad: number; todaySubs: number; weekSubs: number
}): number {
  const tierWeight =
    params.tier === 'exact'   ? weightValue(weights.exactMatch)
    : params.tier === 'class'   ? weightValue(weights.classFamiliarity)
    : params.tier === 'subject' ? weightValue(weights.subjectFamiliarity)
    : 0
  return tierWeight * 100
    - weightValue(weights.dailyWorkloadBalance) * params.todayLoad
    - weightValue(weights.weeklyWorkloadBalance) * params.weekLoad
    - weightValue(weights.dailySubBalance) * params.todaySubs
    - weightValue(weights.weeklySubBalance) * params.weekSubs
}
