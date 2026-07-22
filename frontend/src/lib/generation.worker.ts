/**
 * Timetable-generation Web Worker — runs the pure pipeline off the main
 * thread so the UI never freezes during a solve, no matter the school size.
 * The page stays fully interactive (progress ring animates, tabs respond).
 *
 * Protocol: postMessage(GenerationPayload) in → { ok, result | error } out.
 */
import { runGenerationPipeline, type GenerationPayload } from './generationPipeline'

self.onmessage = (e: MessageEvent<GenerationPayload>) => {
  try {
    const result = runGenerationPipeline(e.data)
    ;(self as any).postMessage({ ok: true, result })
  } catch (err) {
    ;(self as any).postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
