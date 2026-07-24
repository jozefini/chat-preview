import type { Message } from '@/types'

export type TypeFilter = 'all' | 'messages' | 'replies'

export interface Filters {
  /** Free text. Matches message body, and author name when `searchAuthors`. */
  q: string
  /** Empty = every author. */
  authors: Set<string>
  type: TypeFilter
  /** Minute-of-day bounds, inclusive. */
  fromMin: number
  toMin: number
  /** Also match the author name against `q`. */
  searchAuthors: boolean
}

export function isFilterActive(f: Filters, fullFrom: number, fullTo: number): boolean {
  return (
    f.q.trim() !== '' ||
    f.authors.size > 0 ||
    f.type !== 'all' ||
    f.fromMin > fullFrom ||
    f.toMin < fullTo
  )
}

/**
 * Single pass over the day. Everything compared here is precomputed at decode
 * time (`lcText`, `lcAuthor`, `min`), so this is a tight scan with no
 * allocation per message — a full 12k-message day lands well under a
 * millisecond, which is what makes typing feel instant.
 *
 * Multiple whitespace-separated terms are AND-ed.
 */
export function filterMessages(messages: Message[], f: Filters): Message[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hasTerms = terms.length > 0
  const hasAuthors = f.authors.size > 0
  const checkType = f.type !== 'all'
  const wantReply = f.type === 'replies'
  const checkTime = f.fromMin > 0 || f.toMin < 1439

  const out: Message[] = []

  outer: for (let i = 0; i < messages.length; i++) {
    const m = messages[i]

    if (checkType && m.isReply !== wantReply) continue
    if (checkTime && (m.min < f.fromMin || m.min > f.toMin)) continue
    if (hasAuthors && !f.authors.has(m.author)) continue

    if (hasTerms) {
      for (let t = 0; t < terms.length; t++) {
        const term = terms[t]
        if (m.lcText.includes(term)) continue
        if (f.searchAuthors && m.lcAuthor.includes(term)) continue
        continue outer
      }
    }

    out.push(m)
  }

  return out
}

/**
 * Ranges of `text` matching any search term, merged and sorted — used to
 * highlight hits without re-scanning during render.
 */
export function matchRanges(lcText: string, terms: string[]): [number, number][] {
  if (!terms.length) return []

  const hits: [number, number][] = []
  for (const term of terms) {
    if (!term) continue
    let from = 0
    for (;;) {
      const at = lcText.indexOf(term, from)
      if (at === -1) break
      hits.push([at, at + term.length])
      from = at + term.length
    }
  }
  if (!hits.length) return []

  hits.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [hits[0]]
  for (let i = 1; i < hits.length; i++) {
    const last = merged[merged.length - 1]
    if (hits[i][0] <= last[1]) last[1] = Math.max(last[1], hits[i][1])
    else merged.push(hits[i])
  }
  return merged
}

export function splitTerms(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean)
}
