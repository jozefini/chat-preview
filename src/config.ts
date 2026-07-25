/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHAT THE PUBLIC CAN SEE — the one knob that decides what a visitor gets.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The archive holds every day that was ever captured, and `npm run prep` now
 * publishes ALL of it. What this file decides is who sees which slice:
 *
 *   • ADMIN_PASSWORD   → everything. Every day, every hour. No filtering.
 *   • ARCHIVE_PASSWORD → only the days listed in `ALLOWED_DATES` below, and
 *     only within each day's optional `from`/`to` clock window.
 *
 * A day not in the list simply does not exist for a public visitor: it is not
 * routable, not in the calendar, and its JSON is refused by the data layer.
 *
 * ⚠️  Because admin sees everything, prep writes every day into `public/data/`,
 * which is served without authentication. The gate is a client-side lock — it
 * stops people who land on the URL, not someone who guesses
 * `/data/days/2026-05-10.json`. For a hard boundary the site has to sit behind
 * something server-side (Vercel Deployment Protection, or middleware that
 * gates /data too).
 *
 * After changing `ALLOWED_DATES`, re-run:  npm run prep
 * (prep bakes the public per-day message counts the calendar reads.)
 */

/** One publishable day. Omit `from`/`to` to publish the whole day. */
export interface AllowedDate {
  /** `YYYY-MM-DD`, in archive-local time. */
  date: string
  /** Earliest visible clock time, `HH:MM`, inclusive. Defaults to `00:00`. */
  from?: string
  /** Latest visible clock time, `HH:MM`, inclusive. Defaults to `23:59`. */
  to?: string
}

/**
 * Days a public visitor may open. Order does not matter.
 *
 *   { date: '2026-06-29' }                             → the whole day
 *   { date: '2026-06-29', from: '18:00' }              → 18:00 → end of day
 *   { date: '2026-06-29', from: '18:00', to: '21:30' } → that evening only
 */
export const ALLOWED_DATES: readonly AllowedDate[] = [
  { date: '2026-04-27' },
  { date: '2026-04-28' },
  { date: '2026-04-29' },
  { date: '2026-04-30' },
  { date: '2026-06-29' },
]

/**
 * Timezone the archive was captured in, as `Date#getTimezoneOffset()` reports
 * it (minutes WEST of UTC, so UTC+2 is -120). Taken from the archive's
 * `_index.json → timezoneOffsetMinutes`. Day boundaries and displayed clock
 * times are both computed against this, so the app reads identically no matter
 * where the viewer is.
 */
export const TZ_OFFSET_MINUTES = -120

// ── clock helpers ───────────────────────────────────────────────────────────

/** First and last minute-of-day, inclusive — the window an admin always gets. */
export const DAY_START_MIN = 0
export const DAY_END_MIN = 23 * 60 + 59

/** `'HH:MM'` → minutes since local midnight. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`Invalid time in ALLOWED_DATES: ${JSON.stringify(hhmm)}`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`Time out of range in ALLOWED_DATES: ${hhmm}`)
  return h * 60 + min
}

/** Minutes since local midnight → `'HH:MM'`. */
export function formatClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** A resolved visibility window: minute-of-day bounds, both inclusive. */
export interface Window {
  fromMin: number
  toMin: number
}

/** The whole day — what admins get, and the default for a bare allowed date. */
export const FULL_DAY: Window = { fromMin: DAY_START_MIN, toMin: DAY_END_MIN }

export function isFullDay(w: Window): boolean {
  return w.fromMin <= DAY_START_MIN && w.toMin >= DAY_END_MIN
}

// ── the public list, validated once at module load ──────────────────────────

/**
 * `ALLOWED_DATES` resolved to minute bounds and keyed by date. Built eagerly so
 * a typo in the config fails on the very first import rather than the first
 * time someone opens that day.
 */
export const PUBLIC_WINDOWS: ReadonlyMap<string, Window> = (() => {
  const map = new Map<string, Window>()

  for (const entry of ALLOWED_DATES) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error(
        `Invalid date in ALLOWED_DATES: ${JSON.stringify(entry.date)} (want YYYY-MM-DD)`,
      )
    }
    if (map.has(entry.date)) {
      throw new Error(
        `Duplicate date in ALLOWED_DATES: ${entry.date}. Give it one entry with the widest window instead.`,
      )
    }

    const fromMin = entry.from === undefined ? DAY_START_MIN : parseClock(entry.from)
    const toMin = entry.to === undefined ? DAY_END_MIN : parseClock(entry.to)

    if (fromMin > toMin) {
      throw new Error(
        `ALLOWED_DATES ${entry.date}: from (${entry.from}) is after to (${entry.to}).`,
      )
    }

    map.set(entry.date, { fromMin, toMin })
  }

  return map
})()

/** Public dates, ascending — the order the calendar and prep both want. */
export const PUBLIC_DATES: readonly string[] = [...PUBLIC_WINDOWS.keys()].sort()

// ── the questions the rest of the app actually asks ─────────────────────────

/**
 * What this viewer may see of `date`, or `null` when the day is off-limits.
 *
 * The single place a role turns into a concrete window — every date check in
 * the app routes through here, so there is no second, subtly different rule.
 */
export function visibleWindow(date: string, isAdmin: boolean): Window | null {
  if (isAdmin) return FULL_DAY
  return PUBLIC_WINDOWS.get(date) ?? null
}

/** Can this viewer open `date` at all? */
export function isVisibleDate(date: string, isAdmin: boolean): boolean {
  return visibleWindow(date, isAdmin) !== null
}

/** Is `minuteOfDay` inside the window? */
export function isVisibleMinute(min: number, w: Window): boolean {
  return min >= w.fromMin && min <= w.toMin
}
