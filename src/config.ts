/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE PUBLISH WINDOW — the one knob that decides what exists.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The archive holds every day that was ever captured. This constant decides
 * which slice of it is actually published.
 *
 * It is enforced twice, on purpose:
 *   1. At prep time  — `npm run prep` only emits days inside the window, and
 *      only messages inside the daily time window. Out-of-window data never
 *      leaves your machine.
 *   2. At runtime    — the app re-checks the window, so even a stale cached
 *      file from a previous, wider window can't be displayed.
 *
 * After changing anything here, re-run:  npm run prep
 */
export const PUBLISH = {
  /** First published day, inclusive. `YYYY-MM-DD`, in archive-local time. */
  START_DATE: '2026-06-29',
  /** Last published day, inclusive. `YYYY-MM-DD`, in archive-local time. */
  END_DATE: '2026-06-29',

  /**
   * Daily clock window, applied to EVERY published day.
   * `'18:00'` / `'23:59'` would publish only the evening of each day.
   * Inclusive on both ends, at minute granularity.
   */
  START_TIME: '00:00',
  END_TIME: '23:59',

  /**
   * Timezone the archive was captured in, as `Date#getTimezoneOffset()` reports
   * it (minutes WEST of UTC, so UTC+2 is -120). Taken from the archive's
   * `_index.json → timezoneOffsetMinutes`. Day boundaries and displayed clock
   * times are both computed against this, so the app reads identically no
   * matter where the viewer is.
   */
  TZ_OFFSET_MINUTES: -120,
} as const

/** `'HH:MM'` → minutes since local midnight. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`Invalid time in PUBLISH config: ${JSON.stringify(hhmm)}`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`Time out of range in PUBLISH config: ${hhmm}`)
  return h * 60 + min
}

/** Daily window as minute offsets from local midnight, inclusive. */
export const WINDOW_START_MIN = parseClock(PUBLISH.START_TIME)
export const WINDOW_END_MIN = parseClock(PUBLISH.END_TIME)

if (WINDOW_START_MIN > WINDOW_END_MIN) {
  throw new Error(
    `PUBLISH.START_TIME (${PUBLISH.START_TIME}) is after PUBLISH.END_TIME (${PUBLISH.END_TIME}).`,
  )
}
if (PUBLISH.START_DATE > PUBLISH.END_DATE) {
  throw new Error(
    `PUBLISH.START_DATE (${PUBLISH.START_DATE}) is after PUBLISH.END_DATE (${PUBLISH.END_DATE}).`,
  )
}

/** True when the whole day is published — lets the UI hide the time-window notice. */
export const IS_FULL_DAY_WINDOW = WINDOW_START_MIN === 0 && WINDOW_END_MIN === 23 * 60 + 59

/** Is this `YYYY-MM-DD` inside the published date range? */
export function isPublishedDate(date: string): boolean {
  return date >= PUBLISH.START_DATE && date <= PUBLISH.END_DATE
}

/** Is this minute-of-day inside the published daily window? */
export function isPublishedMinute(minuteOfDay: number): boolean {
  return minuteOfDay >= WINDOW_START_MIN && minuteOfDay <= WINDOW_END_MIN
}
