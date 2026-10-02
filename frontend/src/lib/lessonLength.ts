/**
 * How long one lesson is, in minutes.
 *
 * Every hours figure in the app - syllabus allocated and spent, holiday hours
 * lost, workload in hours, cover logged - reads `config.periodMinutes`. Nothing
 * ever wrote it: the bell step saves the period length as
 * `defaultSessionDuration`. So every school was priced at the 40-minute
 * fallback whatever its real bell said, and a school with 45-minute lessons saw
 * every hours figure about 11% short.
 *
 * Read through here, never `periodMinutes ?? 40` directly.
 */
export function lessonMinutes(config: { periodMinutes?: number; defaultSessionDuration?: number } | null | undefined): number {
  const pick = (n: unknown) => (typeof n === 'number' && n > 0 ? n : undefined)
  return pick(config?.periodMinutes) ?? pick(config?.defaultSessionDuration) ?? 40
}
