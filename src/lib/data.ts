import { queryOptions } from '@tanstack/react-query'
import type { ArchiveIndex, DecodedDay, Message, RawDay } from '@/types'
import { isPublishedDate, isPublishedMinute } from '@/config'

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
 * Compact day payload → renderable messages.
 *
 * Runs once per day (TanStack Query caches the result for the session), and is
 * where the per-message work happens that keeps filtering cheap later:
 * lowercasing for search and deriving minute-of-day for the time filter, so
 * neither has to be recomputed on every keystroke.
 */
function decodeDay(raw: RawDay): DecodedDay {
  const messages: Message[] = []
  const counts = new Map<number, number>()

  for (let i = 0; i < raw.m.length; i++) {
    const row = raw.m[i]
    const delta = row[0]
    const min = Math.floor(delta / 60_000)

    // Second enforcement of the publish window: a day file cached from a wider
    // window can't leak messages the current config excludes.
    if (!isPublishedMinute(min)) continue

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

export const indexQuery = queryOptions({
  queryKey: ['index'],
  queryFn: ({ signal }) => getJson<ArchiveIndex>(`${BASE}/index.json`, signal),
  staleTime: Infinity,
})

export function dayQuery(date: string) {
  return queryOptions({
    queryKey: ['day', date],
    queryFn: async ({ signal }) => {
      if (!isPublishedDate(date)) {
        throw new Error(`${date} is outside the published date range.`)
      }
      return decodeDay(await getJson<RawDay>(`${BASE}/days/${date}.json`, signal))
    },
    // A day file is immutable once prepped, so never refetch it in a session.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  })
}
