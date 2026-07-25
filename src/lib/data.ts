import { queryOptions } from '@tanstack/react-query'
import type { ArchiveIndex, DayMeta, DayStats, DecodedDay, Message, RawDay } from '@/types'
import { isVisibleMinute, visibleWindow, type Window } from '@/config'

const BASE = `${import.meta.env.BASE_URL}data`

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return (await res.json()) as T
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Compact day payload → renderable messages, trimmed to `win`.
 *
 * Runs once per day per role (TanStack Query caches the result for the
 * session), and is where the per-message work happens that keeps filtering
 * cheap later: lowercasing for search and deriving minute-of-day for the time
 * filter, so neither has to be recomputed on every keystroke.
 *
 * It is also where the public clock window is actually enforced. Day files now
 * hold the entire day so admins can read it, which makes this the ONLY thing
 * standing between a public session and the hours it isn't meant to see —
 * messages outside `win` never enter the array the UI renders from.
 */
function decodeDay(raw: RawDay, win: Window): DecodedDay {
  const messages: Message[] = []
  const counts = new Map<number, number>()

  for (let i = 0; i < raw.m.length; i++) {
    const row = raw.m[i]
    const delta = row[0]
    const min = Math.floor(delta / 60_000)

    if (!isVisibleMinute(min, win)) continue

    const ai = row[1]
    const author = raw.a[ai] ?? ['', '']
    counts.set(ai, (counts.get(ai) ?? 0) + 1)

    const isReply = row.length === 5
    const replyAuthor = isReply ? (raw.a[row[3]] ?? ['', '']) : ['', '']
    const text = row[2]

    messages.push({
      i,
      ms: raw.s + delta,
      min,
      time: `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`,
      author: author[0],
      authorColor: author[1],
      text,
      isReply,
      replyTo: replyAuthor[0],
      replyToColor: replyAuthor[1],
      replyPreview: isReply ? (row[4] as string) : '',
      lcText: text.toLowerCase(),
      lcAuthor: author[0].toLowerCase(),
    })
  }

  // The archive stores authorColor per message, and people change their colour
  // over time — so one person holds several dictionary entries (up to 10 in
  // this archive). Individual messages keep their own colour, which is what
  // preserves fidelity with the extension, but the author LIST has to be one
  // row per person: duplicates would split someone's message count across
  // several rows and, because the picker keys rows by name, hand React
  // duplicate keys and break its reconciliation of the filtered list.
  const byName = new Map<string, { name: string; color: string; count: number; topEntry: number }>()

  for (const [idx, count] of counts) {
    const entry = raw.a[idx] ?? ['', '']
    const name = entry[0]
    const color = entry[1] ?? ''
    const existing = byName.get(name)

    if (!existing) {
      byName.set(name, { name, color, count, topEntry: count })
    } else {
      existing.count += count
      // Show each person in whichever colour they used most.
      if (count > existing.topEntry) {
        existing.topEntry = count
        existing.color = color
      }
    }
  }

  const authors = [...byName.values()]
    .map(({ name, color, count }) => ({ name, color, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { date: raw.d, dayStart: raw.s, messages, authors }
}

/** `YYYY-MM-DD` → whole days since epoch, for measuring distance between dates. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * This day as the viewer sees it, or `null` when the day is off-limits to
 * them. Admins get the whole-day summary; everyone else gets the `pub` block
 * prep computed against that date's clock window.
 */
export function statsFor(meta: DayMeta, isAdmin: boolean): DayStats | null {
  return isAdmin ? meta : meta.pub
}

/**
 * Days this viewer may open that actually hold messages for them — the only
 * dates the app should ever route to. Ascending, as prep emits them.
 *
 * A day can be published and still fall out here: if its public window covers
 * hours nobody talked in, `pub.count` is 0 and the day is a dead end.
 */
export function daysWithData(index: ArchiveIndex, isAdmin: boolean): DayMeta[] {
  return index.days.filter((d) => (statsFor(d, isAdmin)?.count ?? 0) > 0)
}

export function hasMessages(index: ArchiveIndex, date: string, isAdmin: boolean): boolean {
  return daysWithData(index, isAdmin).some((d) => d.date === date)
}

/**
 * The published day closest to `date`, or `null` when nothing is published.
 *
 * Used to rescue a URL pointing at a date that no longer exists — a bookmark
 * from a wider publish window, or a day prep dropped. Choosing the *nearest*
 * day rather than the newest keeps you where you were looking when the window
 * changes under you. An unparseable date has no meaningful neighbour, so it
 * falls back to the most recent day.
 */
export function nearestDayWithData(
  index: ArchiveIndex,
  date: string,
  isAdmin: boolean,
): string | null {
  const days = daysWithData(index, isAdmin)
  if (!days.length) return null

  const target = dayNumber(date)
  if (!Number.isFinite(target)) return days[days.length - 1].date

  let best = days[0]
  let bestGap = Infinity
  for (const day of days) {
    const gap = Math.abs(dayNumber(day.date) - target)
    // Strict `<` keeps the earlier day when one sits equally far either side.
    if (gap < bestGap) {
      bestGap = gap
      best = day
    }
  }
  return best.date
}

export const indexQuery = queryOptions({
  queryKey: ['index'],
  queryFn: ({ signal }) => getJson<ArchiveIndex>(`${BASE}/index.json`, signal),
  staleTime: Infinity,
})

/**
 * One day, decoded for one role.
 *
 * The role is part of the cache key on purpose: the same file decodes to two
 * different message lists, and a public session must never be handed the entry
 * an admin session warmed. (Logging out clears the cache too — belt and
 * braces, since the key alone already keeps them apart.)
 */
export function dayQuery(date: string, isAdmin: boolean) {
  return queryOptions({
    queryKey: ['day', date, isAdmin ? 'admin' : 'public'],
    queryFn: async ({ signal }) => {
      const win = visibleWindow(date, isAdmin)
      // Refuse before fetching: an off-limits date should not even produce a
      // request for its JSON.
      if (!win) throw new Error(`${date} is not published.`)
      return decodeDay(await getJson<RawDay>(`${BASE}/days/${date}.json`, signal), win)
    },
    // A day file is immutable once prepped, so never refetch it in a session.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })
}
