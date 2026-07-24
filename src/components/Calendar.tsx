import { useMemo } from 'react'
import type { DayMeta } from '@/types'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  days: DayMeta[]
  selected: string | undefined
  onSelect: (date: string) => void
  onPrefetch?: (date: string) => void
}

interface Cell {
  date: string | null
  meta: DayMeta | undefined
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
 * Builds one grid per month spanned by the published days. Dates are treated
 * as plain `YYYY-MM-DD` strings throughout — no Date objects, so the viewer's
 * timezone can't shift a day across a boundary.
 */
function buildMonths(days: DayMeta[]): MonthBlock[] {
  if (!days.length) return []

  const byDate = new Map(days.map((d) => [d.date, d]))
  const first = days[0].date
  const last = days[days.length - 1].date

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
    for (let i = 0; i < lead; i++) cells.push({ date: null, meta: undefined })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = ymd(y, m, d)
      cells.push({ date, meta: byDate.get(date) })
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

export function Calendar({ days, selected, onSelect, onPrefetch }: Props) {
  const months = useMemo(() => buildMonths(days), [days])
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.count)), [days])

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

              const meta = cell.meta
              const available = !!meta && meta.count > 0
              const isSelected = cell.date === selected
              const dayNum = Number(cell.date.slice(8, 10))

              if (!available) {
                return (
                  <div
                    key={cell.date}
                    className="flex aspect-square items-center justify-center rounded-md text-[11px] text-neutral-700"
                    title={meta ? 'No messages in the published window' : 'Not published'}
                  >
                    {dayNum}
                  </div>
                )
              }

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => onSelect(cell.date!)}
                  onMouseEnter={() => onPrefetch?.(cell.date!)}
                  onFocus={() => onPrefetch?.(cell.date!)}
                  title={`${cell.date} · ${meta.count.toLocaleString('en-US')} messages${
                    meta.topAuthors.length ? ` · ${meta.topAuthors.join(', ')}` : ''
                  }`}
                  aria-label={`${cell.date}, ${meta.count} messages`}
                  aria-current={isSelected ? 'date' : undefined}
                  className={[
                    'relative flex aspect-square cursor-pointer items-center justify-center rounded-md text-[11px] font-medium transition',
                    'hover:ring-2 hover:ring-sky-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
                    isSelected
                      ? 'text-white ring-2 ring-sky-300'
                      : 'text-neutral-200 hover:text-white',
                  ].join(' ')}
                  style={{ background: heat(meta.count, max) }}
                >
                  {dayNum}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
