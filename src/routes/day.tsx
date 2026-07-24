import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { dayQuery } from '@/lib/data'
import { ChatView } from '@/components/ChatView'
import { AuthorPicker } from '@/components/AuthorPicker'
import { TimeRange } from '@/components/TimeRange'
import { Drawer } from '@/components/Drawer'
import { ZoomControl } from '@/components/ZoomControl'
import { filterMessages, splitTerms, type Filters, type TypeFilter } from '@/lib/filter'
import { WINDOW_START_MIN, WINDOW_END_MIN, isPublishedDate, PUBLISH } from '@/config'
import { DEFAULT_SEARCH, type DaySearch } from '@/lib/search'
import { useShell } from '@/lib/shell'

/** Text input pushes to the URL on a delay; the URL stays the source of truth. */
const SEARCH_DEBOUNCE_MS = 120

/**
 * Selected authors are packed into a single URL param. Display names contain
 * spaces, emoji and punctuation, so the delimiter is the ASCII unit separator
 * — a character no chat name will ever hold.
 */
const AUTHOR_SEP = '\u001f'

export function DayRoute() {
  const { date } = useParams({ from: '/d/$date' })
  const search = useSearch({ from: '/d/$date' })
  const navigate = useNavigate()
  const shell = useShell()

  const { data: day, isPending, error } = useQuery(dayQuery(date))

  const [qInput, setQInput] = useState(search.q)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // URL → input, for back/forward and calendar navigation.
  useEffect(() => {
    setQInput(search.q)
  }, [search.q])

  useEffect(() => {
    if (qInput === search.q) return
    const t = setTimeout(() => {
      void navigate({
        to: '/d/$date',
        params: { date },
        search: (s) => ({ ...DEFAULT_SEARCH, ...s, q: qInput }),
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  // "/" focuses search, Escape clears it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQInput('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const authorSet = useMemo(
    () => new Set(search.a ? search.a.split(AUTHOR_SEP).filter(Boolean) : []),
    [search.a],
  )

  const filters: Filters = useMemo(
    () => ({
      q: search.q,
      authors: authorSet,
      type: search.type,
      fromMin: search.from,
      toMin: search.to,
      searchAuthors: search.sa,
    }),
    [search.q, authorSet, search.type, search.from, search.to, search.sa],
  )

  const filtered = useMemo(
    () => (day ? filterMessages(day.messages, filters) : []),
    [day, filters],
  )

  const terms = useMemo(() => splitTerms(search.q), [search.q])

  function patch(next: Partial<DaySearch>) {
    void navigate({
      to: '/d/$date',
      params: { date },
      search: (s) => ({ ...DEFAULT_SEARCH, ...s, ...next }),
      replace: true,
    })
  }

  function setAuthors(nextSet: Set<string>) {
    patch({ a: [...nextSet].join(AUTHOR_SEP) })
  }

  const total = day?.messages.length ?? 0
  const isFiltered = filtered.length !== total
  const activeCount =
    (search.q.trim() ? 1 : 0) +
    authorSet.size +
    (search.type !== 'all' ? 1 : 0) +
    (search.from > WINDOW_START_MIN || search.to < WINDOW_END_MIN ? 1 : 0)

  if (!isPublishedDate(date)) {
    return (
      <Centered
        title="Outside the published range"
        body={`${date} is not published. The window is ${PUBLISH.START_DATE} → ${PUBLISH.END_DATE}.`}
      />
    )
  }

  if (error) {
    return <Centered title="Could not load this day" body={String((error as Error).message)} />
  }

  const filterPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-4">
      <TimeRange
        fromMin={search.from}
        toMin={search.to}
        onChange={(from, to) => patch({ from, to })}
      />
      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-neutral-400">
        <input
          type="checkbox"
          checked={search.sa}
          onChange={(e) => patch({ sa: e.target.checked })}
          className="accent-sky-400"
        />
        Search author names too
      </label>
      <div className="min-h-0 flex-1">
        {day && (
          <AuthorPicker authors={day.authors} selected={authorSet} onChange={setAuthors} />
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-30 flex flex-shrink-0 flex-col gap-2.5 border-b border-white/10 bg-neutral-950/95 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
        {/* Row 1 — drawer triggers (mobile), date, counts, zoom */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shell.setCalendarOpen(true)}
            // The text label is hidden below `sm`, so the button needs its own
            // accessible name or it announces as unlabelled on phones.
            aria-label="Open calendar"
            className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <CalendarIcon />
            <span className="hidden sm:inline">Calendar</span>
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              <span className="sm:hidden">{formatDateShort(date)}</span>
              <span className="hidden sm:inline">{formatDate(date)}</span>
            </h2>
            <p className="text-[11px] text-neutral-500 tabular-nums">
              {isPending ? (
                'Loading…'
              ) : isFiltered ? (
                <>
                  <span className="text-sky-400">{filtered.length.toLocaleString('en-US')}</span>
                  {' of '}
                  {total.toLocaleString('en-US')} {plural(total)}
                </>
              ) : (
                <>
                  {total.toLocaleString('en-US')} {plural(total)}
                </>
              )}
            </p>
          </div>

          <ZoomControl
            zoom={shell.zoom}
            onIn={shell.zoomIn}
            onOut={shell.zoomOut}
            onReset={shell.resetZoom}
          />

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={
              activeCount > 0 ? `Open filters, ${activeCount} active` : 'Open filters'
            }
            className="relative flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <FilterIcon />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-400 px-1 text-[10px] font-semibold text-neutral-950">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2 — search + type, wrapping on narrow screens */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search this day…"
              className="w-full rounded-lg border border-white/10 bg-black/50 py-2 pr-8 pl-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-400/60 focus:outline-none"
            />
            {qInput && (
              <button
                type="button"
                onClick={() => setQInput('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer px-1 text-neutral-500 hover:text-neutral-200"
              >
                ×
              </button>
            )}
          </div>
          <SegmentedType value={search.type} onChange={(type) => patch({ type })} />
        </div>

        {/* Row 3 — active filter chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {search.q.trim() && (
              <Chip label={`“${search.q.trim()}”`} onClear={() => setQInput('')} />
            )}
            {[...authorSet].map((name) => (
              <Chip
                key={name}
                label={name}
                onClear={() => {
                  const next = new Set(authorSet)
                  next.delete(name)
                  setAuthors(next)
                }}
              />
            ))}
            {search.type !== 'all' && (
              <Chip label={search.type} onClear={() => patch({ type: 'all' })} />
            )}
            {(search.from > WINDOW_START_MIN || search.to < WINDOW_END_MIN) && (
              <Chip
                label={`${fmtMin(search.from)}–${fmtMin(search.to)}`}
                onClear={() => patch({ from: WINDOW_START_MIN, to: WINDOW_END_MIN })}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setQInput('')
                patch({ q: '', a: '', type: 'all', from: WINDOW_START_MIN, to: WINDOW_END_MIN })
              }}
              className="ml-1 cursor-pointer text-[11px] text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {isPending ? (
            <Centered title="Loading day…" body={`Fetching ${date}`} />
          ) : (
            <ChatView messages={filtered} terms={terms} resetKey={date} zoom={shell.zoom} />
          )}
        </div>

        {/* ── Filters: fixed rail on desktop, drawer below lg ── */}
        <aside className="hidden w-[240px] flex-shrink-0 flex-col border-l border-white/10 bg-black/20 lg:flex">
          {filterPanel}
        </aside>
      </div>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        side="right"
        title="Filters"
      >
        {filterPanel}
      </Drawer>
    </>
  )
}

// ── small pieces ────────────────────────────────────────────────────────────

function plural(n: number) {
  return n === 1 ? 'message' : 'messages'
}

function fmtMin(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDateShort(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
    </svg>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 py-0.5 pr-1 pl-2 text-[11px] text-sky-200">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className="cursor-pointer rounded-full px-1 leading-none text-sky-300/70 hover:text-white"
      >
        ×
      </button>
    </span>
  )
}

function SegmentedType({
  value,
  onChange,
}: {
  value: TypeFilter
  onChange: (v: TypeFilter) => void
}) {
  const opts: { v: TypeFilter; label: string; short: string }[] = [
    { v: 'all', label: 'All', short: 'All' },
    { v: 'messages', label: 'Messages', short: 'Msg' },
    { v: 'replies', label: 'Replies', short: 'Rep' },
  ]
  return (
    <div className="flex flex-shrink-0 rounded-lg border border-white/10 bg-black/40 p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={[
            'cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition sm:px-2.5',
            value === o.v ? 'bg-sky-400/20 text-sky-200' : 'text-neutral-400 hover:text-neutral-100',
          ].join(' ')}
        >
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
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
