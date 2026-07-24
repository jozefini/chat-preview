import { WINDOW_START_MIN, WINDOW_END_MIN } from '@/config'
import type { TypeFilter } from './filter'

/**
 * Filter state, mirrored into the URL so any view is shareable and survives
 * reload and back/forward.
 *
 * Lives in its own module (rather than next to the routes) so route components
 * can read the defaults without importing the router that renders them.
 */
export interface DaySearch {
  /** Free-text query. */
  q: string
  /** Selected authors, joined by `AUTHOR_SEP`. */
  a: string
  type: TypeFilter
  /** Minute-of-day bounds, always clamped to the published window. */
  from: number
  to: number
  /** Match author names against `q` too. */
  sa: boolean
}

/** Every field has a default, so patching search always yields a full object. */
export const DEFAULT_SEARCH: DaySearch = {
  q: '',
  a: '',
  type: 'all',
  from: WINDOW_START_MIN,
  to: WINDOW_END_MIN,
  sa: false,
}

function clampMin(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), WINDOW_START_MIN), WINDOW_END_MIN)
}

/**
 * Coerces raw URL params into a valid `DaySearch`. Hand-edited URLs can't put
 * the app into a bad state: unknown types fall back to `all`, and the time
 * bounds are clamped into the published window rather than trusted.
 */
export function validateDaySearch(raw: Record<string, unknown>): DaySearch {
  const type = raw.type
  const from = clampMin(raw.from, WINDOW_START_MIN)
  const to = clampMin(raw.to, WINDOW_END_MIN)

  return {
    q: typeof raw.q === 'string' ? raw.q : '',
    a: typeof raw.a === 'string' ? raw.a : '',
    type: type === 'messages' || type === 'replies' ? type : 'all',
    // A reversed range would silently match nothing; swap instead.
    from: Math.min(from, to),
    to: Math.max(from, to),
    sa: raw.sa === true || raw.sa === 'true',
  }
}
