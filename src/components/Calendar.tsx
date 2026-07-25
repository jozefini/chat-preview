import { useMemo } from 'react'
import { formatClock, isFullDay, visibleWindow } from '@/config'
import { statsFor } from '@/lib/data'
import type { DayMeta, DayStats } from '@/types'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  days: DayMeta[]
  /** Admins get every day; everyone else only the published ones. */
  isAdmin: boolean
  selected: string | undefined
  onSelect: (date: string) => void
  onPrefetch?: (date: string) => void
}

interface Cell {
  date: string | null
  /** This day as the viewer sees it — `null` when it isn't theirs to open. */
  stats: DayStats | null
  /** True when the day is published but only for part of its clock. */
  partial: boolean
}

interface MonthBlock {
  key: string
  label: string
  cells: Cell[]
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Builds one grid per month spanned by the days this viewer may open. Dates are
 * treated as plain `YYYY-MM-DD` strings throughout — no Date objects, so the
 * viewer's timezone can't shift a day across a boundary.
 *
 * The month range comes from the VISIBLE days, not the archive. A public
 * visitor with one published day in June gets a June grid, not a year of empty
 * months quietly disclosing how much archive they aren't being shown.
 */
function buildMonths(days: DayMeta[], isAdmin: boolean): MonthBlock[] {
  const byDate = new Map<string, Cell>()
  const visible: string[] = []

  for (const meta of days) {
    const stats = statsFor(meta, isAdmin)
    if (!stats) continue
    const win = visibleWindow(meta.date, isAdmin)
    byDate.set(meta.date, { date: meta.date, stats, partial: !!win && !isFullDay(win) })
    visible.push(meta.date)
  }

  if (!visible.length) return []
  visible.sort()

  const first = visible[0]
  const last = visible[visible.length - 1]

  const [fy, fm] = [Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1]
  const [ly, lm] = [Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1]

  const blocks: MonthBlock[] = []
  let y = fy
  let m = fm

  while (y < ly || (y === ly && m <= lm)) {
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    // Monday-first: JS getUTCDay() is 0=Sun, so shift.
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7

    const cells: Cell[] = []
    for (let i = 0; i < lead; i++) cells.push({ date: null, stats: null, partial: false })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = ymd(y, m, d)
      cells.push(byDate.get(date) ?? { date, stats: null, partial: false })
    }

    blocks.push({ key: `${y}-${m}`, label: `${MONTH_NAMES[m]} ${y}`, cells })

    m++
    if (m > 11) {
      m = 0
      y++
    }
  }

  return blocks
}

/** Volume → background intensity. Square root keeps quiet days visible. */
function heat(count: number, max: number): string {
  if (!count) return 'transparent'
  const t = Math.sqrt(count / max)
  return `rgba(56, 189, 248, ${(0.1 + t * 0.55).toFixed(3)})`
}

export function Calendar({ days, isAdmin, selected, onSelect, onPrefetch }: Props) {
  const months = useMemo(() => buildMonths(days, isAdmin), [days, isAdmin])
  // Heat is relative to the busiest day the viewer can actually see, so a
  // one-day public archive still shades that day rather than rendering it as a
  // faint outlier against a maximum it can't reach.
  const max = useMemo(
    () => Math.max(1, ...days.map((d) => statsFor(d, isAdmin)?.count ?? 0)),
    [days, isAdmin],
  )

  return (
    <div className="flex flex-col gap-5">
      {months.map((month) => (
        <div key={month.key}>
          <div className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
            {month.label}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="pb-1 text-center text-[10px] font-medium text-neutral-600"
              >
                {w}
              </div>
            ))}
            {month.cells.map((cell, i) => {
              if (!cell.date) return <div key={`e${i}`} />

              const stats = cell.stats
              const isSelected = cell.date === selected
              const dayNum = Number(cell.date.slice(8, 10))

              if (!stats || stats.count === 0) {
                return (
                  <div
                    key={cell.date}
                    className="flex aspect-square items-center justify-center rounded-md text-[11px] text-neutral-700"
                    title={stats ? 'No messages in the published window' : 'Not published'}
                  >
                    {dayNum}
                  </div>
                )
              }

              const win = visibleWindow(cell.date, isAdmin)
              const windowNote = cell.partial && win ? ` · ${formatClock(win.fromMin)}–${formatClock(win.toMin)}` : ''

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => onSelect(cell.date!)}
                  onMouseEnter={() => onPrefetch?.(cell.date!)}
                  onFocus={() => onPrefetch?.(cell.date!)}
                  title={`${cell.date}${windowNote} · ${stats.count.toLocaleString('en-US')} messages${
                    stats.topAuthors.length ? ` · ${stats.topAuthors.join(', ')}` : ''
                  }`}
                  aria-label={`${cell.date}, ${stats.count} messages${
                    cell.partial && win
                      ? `, ${formatClock(win.fromMin)} to ${formatClock(win.toMin)} only`
                      : ''
                  }`}
                  aria-current={isSelected ? 'date' : undefined}
                  className={[
                    'relative flex aspect-square cursor-pointer items-center justify-center rounded-md text-[11px] font-medium transition',
                    'hover:ring-2 hover:ring-sky-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
                    isSelected
                      ? 'text-white ring-2 ring-sky-300'
                      : 'text-neutral-200 hover:text-white',
                  ].join(' ')}
                  style={{ background: heat(stats.count, max) }}
                >
                  {dayNum}
                  {/* A day published for only part of its clock gets a corner
                      dot, so a short day reads as deliberate, not as missing. */}
                  {cell.partial && (
                    <span
                      aria-hidden
                      className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-amber-300"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
