import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { statsQuery } from '@/lib/data'
import { DEFAULT_SEARCH } from '@/lib/search'
import { toArchiveDate, type Chat } from '@/config'
import { useAuth } from '@/lib/auth'
import { useShell } from '@/lib/shell'
import type { ArchiveStats, AuthorStat } from '@/types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ALL-TIME LEADERBOARD — admin only
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every day in the archive, every hour, folded into one row per person. The
 * numbers come from `public/data/stats.json`, which `npm run prep` builds while
 * it is already walking every message — the browser never sees enough of the
 * archive at once to compute this itself.
 *
 * The route's loader turns non-admins away (src/router.tsx); the check repeated
 * here is what stops the component rendering anything during the tick before a
 * redirect settles.
 */

/** Rows revealed per "Show more" press — 930 people is too many to mount at once. */
const PAGE = 100

type SortKey = 'messages' | 'replies' | 'received' | 'days' | 'perDay' | 'first'

const SORTS: { key: SortKey; label: string; of: (a: Ranked) => number }[] = [
  { key: 'messages', label: 'Messages', of: (a) => a.messages },
  { key: 'replies', label: 'Replies sent', of: (a) => a.replies },
  { key: 'received', label: 'Replies got', of: (a) => a.received },
  { key: 'days', label: 'Days active', of: (a) => a.days },
  { key: 'perDay', label: 'Per day', of: (a) => a.perDay },
  // Negated so "first seen" sorts oldest-first under the same descending rule.
  { key: 'first', label: 'First seen', of: (a) => -(a.firstMs ?? Infinity) },
]

/** A leaderboard row with the values the table derives rather than stores. */
interface Ranked extends AuthorStat {
  /** All-time position by message count. Stable, whatever the table is sorted by. */
  rank: number
  share: number
  perDay: number
  lcName: string
}

const MEDALS = ['🥇', '🥈', '🥉']

/** Podium colours for ranks 1–3; everyone else gets the plain treatment. */
const PODIUM = [
  'border-amber-300/40 bg-amber-300/10 text-amber-200',
  'border-neutral-300/30 bg-neutral-300/10 text-neutral-200',
  'border-orange-400/30 bg-orange-400/10 text-orange-200',
]

export function StatsRoute() {
  const { isAdmin } = useAuth()
  const shell = useShell()
  // The layout already resolved which archive the URL names; the leaderboard is
  // per-chat, so every fetch and every date below is scoped to that one.
  const chat = shell.chat
  const { data, isPending, error } = useQuery({ ...statsQuery(chat.id), enabled: isAdmin })

  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('messages')
  const [limit, setLimit] = useState(PAGE)

  // prep emits authors already sorted by message count, so rank is just the
  // index — no need to re-sort to find it, and it survives every table sort.
  const ranked = useMemo<Ranked[]>(
    () =>
      (data?.authors ?? []).map((a, i) => ({
        ...a,
        rank: i + 1,
        share: data?.totals.messages ? a.messages / data.totals.messages : 0,
        perDay: a.days ? a.messages / a.days : 0,
        lcName: a.name.toLowerCase(),
      })),
    [data],
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const of = (SORTS.find((s) => s.key === sort) ?? SORTS[0]).of
    const list = needle ? ranked.filter((a) => a.lcName.includes(needle)) : ranked
    // Already in message order, so a `messages` sort is a no-op copy — and ties
    // on any other column fall back to that order rather than to nothing.
    return sort === 'messages' ? list : [...list].sort((x, y) => of(y) - of(x) || x.rank - y.rank)
  }, [ranked, q, sort])

  const top = ranked[0]?.messages ?? 0

  if (!isAdmin) {
    return <Centered title="Admins only" body="This page needs the admin password." />
  }

  if (error) {
    return (
      <Centered
        title="No statistics yet"
        body={`Could not load /data/${chat.id}/stats.json — run "npm run prep" to build the all-time leaderboard. (${(error as Error).message})`}
      />
    )
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-shrink-0 flex-col gap-3 border-b border-white/10 bg-neutral-950/95 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shell.setCalendarOpen(true)}
            aria-label="Open calendar"
            className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CalendarIcon />
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              🏆 All-time leaderboard
              <span className="ml-2 text-[11px] font-medium text-neutral-500">{chat.name}</span>
            </h2>
            <p className="text-[11px] text-neutral-500 tabular-nums">
              {isPending || !data ? 'Loading…' : <Span stats={data} />}
            </p>
          </div>

          {/* Back into THIS chat. `/` would resolve to the first archive the
              viewer can open, quietly moving them to a different one. */}
          <Link
            to="/c/$chatId"
            params={{ chatId: chat.id }}
            className="flex-shrink-0 cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
          >
            ← Chat
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-52">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setLimit(PAGE)
              }}
              placeholder="Find a username…"
              className="w-full rounded-lg border border-white/10 bg-black/50 py-2 pr-8 pl-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-400/60 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer px-1 text-neutral-500 hover:text-neutral-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Wraps rather than shrink-0: six labels do not fit one phone-width
              row, and an unshrinkable group pushes the whole page sideways. */}
          <div className="flex min-w-0 flex-wrap rounded-lg border border-white/10 bg-black/40 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSort(s.key)
                  setLimit(PAGE)
                }}
                aria-pressed={sort === s.key}
                className={[
                  'cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition sm:px-2.5',
                  sort === s.key
                    ? 'bg-sky-400/20 text-sky-200'
                    : 'text-neutral-400 hover:text-neutral-100',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {isPending || !data ? (
          <Centered title="Loading statistics…" body="Reading the all-time totals." />
        ) : !ranked.length ? (
          <Centered title="Nobody here" body="The archive holds no messages." />
        ) : (
          <>
            <Podium top3={ranked.slice(0, 3)} />

            <p className="mt-6 mb-2 text-[11px] text-neutral-500 tabular-nums">
              {q.trim() ? (
                <>
                  <span className="text-sky-400">{rows.length.toLocaleString('en-US')}</span>
                  {' of '}
                  {ranked.length.toLocaleString('en-US')} people
                </>
              ) : (
                <>{ranked.length.toLocaleString('en-US')} people</>
              )}
              {' · '}
              <span title="Position by all-time message count, whatever the table is sorted by.">
                # is the all-time message rank
              </span>
            </p>

            {rows.length ? (
              <>
                <Table chat={chat} rows={rows.slice(0, limit)} top={top} />
                {rows.length > limit && (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + PAGE)}
                    className="mt-3 w-full cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                  >
                    Show {Math.min(PAGE, rows.length - limit)} more ·{' '}
                    {(rows.length - limit).toLocaleString('en-US')} hidden
                  </button>
                )}
              </>
            ) : (
              <Centered title="No match" body={`Nobody in the archive is called “${q.trim()}”.`} />
            )}
          </>
        )}
      </div>
    </>
  )
}

// ── pieces ──────────────────────────────────────────────────────────────────

function Span({ stats }: { stats: ArchiveStats }) {
  const { span, totals } = stats
  return (
    <>
      {totals.messages.toLocaleString('en-US')} messages ·{' '}
      {totals.authors.toLocaleString('en-US')} people · {span.days} days
      {span.from && span.to && (
        <>
          {' · '}
          <span className="text-neutral-400">
            {span.from} → {span.to}
          </span>
        </>
      )}
    </>
  )
}

/** Ranks 1–3, given the room the rest of the table doesn't get. */
function Podium({ top3 }: { top3: Ranked[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {top3.map((a) => (
        <div
          key={a.name}
          className={`rounded-xl border p-3 ${PODIUM[a.rank - 1] ?? PODIUM[2]}`}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-xl leading-none">{MEDALS[a.rank - 1]}</span>
            <span
              className="min-w-0 flex-1 truncate text-sm font-semibold"
              style={{ color: a.color || undefined }}
              title={a.name}
            >
              {a.name}
            </span>
            <span className="text-[11px] opacity-70 tabular-nums">#{a.rank}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {a.messages.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-neutral-400 tabular-nums">
            messages · {pct(a.share)} of all chat
          </div>
          <div className="mt-1.5 text-[11px] text-neutral-500 tabular-nums">
            {a.days} days · {a.perDay.toFixed(0)}/day · {a.replies.toLocaleString('en-US')} replies
          </div>
        </div>
      ))}
    </div>
  )
}

function Table({ chat, rows, top }: { chat: Chat; rows: Ranked[]; top: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[860px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-black/30 text-[10px] tracking-wide text-neutral-500 uppercase">
            <Th className="w-14 text-right">#</Th>
            <Th className="min-w-[180px]">Person</Th>
            <Th className="w-[190px] text-right">Messages</Th>
            <Th className="w-20 text-right" title="Messages they sent as a reply">
              Replies
            </Th>
            <Th className="w-20 text-right" title="Messages others sent as a reply to them">
              Got
            </Th>
            <Th className="w-16 text-right">Days</Th>
            <Th className="w-16 text-right" title="Messages per day they were active">
              /day
            </Th>
            <Th className="w-[170px]">Active</Th>
            <Th className="w-[140px]" title="Their busiest single day">
              Busiest
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr
              key={a.name}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
            >
              <td className="px-2 py-1.5 text-right tabular-nums">
                {a.rank <= 3 ? (
                  <span title={`Rank ${a.rank}`}>{MEDALS[a.rank - 1]}</span>
                ) : (
                  <span className="text-neutral-500">{a.rank}</span>
                )}
              </td>
              <td className="max-w-[240px] px-2 py-1.5">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: a.color || '#525252' }}
                  />
                  <span className="truncate font-medium text-neutral-200" title={a.name}>
                    {a.name}
                  </span>
                </span>
              </td>
              <td className="px-2 py-1.5">
                <span className="flex items-center justify-end gap-2">
                  {/* Bar is relative to rank 1, so the drop-off after the top
                      few is visible instead of every row looking equally busy. */}
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/5 sm:block xl:w-24">
                    <span
                      className="block h-full rounded-full bg-sky-400/70"
                      style={{ width: `${top ? Math.max(2, (a.messages / top) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="w-16 text-right font-medium text-neutral-100 tabular-nums">
                    {a.messages.toLocaleString('en-US')}
                  </span>
                  <span className="w-10 text-right text-[10px] text-neutral-500 tabular-nums">
                    {pct(a.share)}
                  </span>
                </span>
              </td>
              <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">
                {a.replies.toLocaleString('en-US')}
              </td>
              <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">
                {a.received.toLocaleString('en-US')}
              </td>
              <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{a.days}</td>
              <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">
                {a.perDay.toFixed(a.perDay < 10 ? 1 : 0)}
              </td>
              <td
                className="px-2 py-1.5 text-[11px] whitespace-nowrap text-neutral-500 tabular-nums"
                title={
                  a.firstMs !== null && a.lastMs !== null
                    ? `${toArchiveDate(chat, a.firstMs)} → ${toArchiveDate(chat, a.lastMs)}`
                    : undefined
                }
              >
                {activeRange(chat, a)}
              </td>
              <td className="px-2 py-1.5 text-[11px] whitespace-nowrap tabular-nums">
                {a.bestDate ? (
                  <Link
                    to="/c/$chatId/d/$date"
                    params={{ chatId: chat.id, date: a.bestDate }}
                    search={DEFAULT_SEARCH}
                    className="text-sky-400/80 hover:text-sky-300 hover:underline"
                    title={`Open ${a.bestDate}`}
                  >
                    {a.bestDate}
                    <span className="ml-1 text-neutral-600">
                      {a.bestCount.toLocaleString('en-US')}
                    </span>
                  </Link>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  className = '',
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <th scope="col" title={title} className={`px-2 py-2 font-medium ${className}`}>
      {children}
    </th>
  )
}

/**
 * First → last message, as dates in the archive's timezone. The year is
 * dropped from the second date when both fall in the same one — most people
 * are active inside a single year, and the repeat costs a column of width the
 * table would rather spend on the busiest-day link. Full range is in `title`.
 */
function activeRange(chat: Chat, a: Ranked): string {
  if (a.firstMs === null || a.lastMs === null) return '—'
  const from = toArchiveDate(chat, a.firstMs)
  const to = toArchiveDate(chat, a.lastMs)
  return `${from} → ${from.slice(0, 4) === to.slice(0, 4) ? to.slice(5) : to}`
}

function pct(share: number) {
  if (!share) return '0%'
  return share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    </svg>
  )
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10 text-center">
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      <p className="max-w-md text-xs text-neutral-500">{body}</p>
    </div>
  )
}
