import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dayQuery, indexQuery } from '@/lib/data'
import { Calendar } from '@/components/Calendar'
import { Drawer } from '@/components/Drawer'
import { EmoteContext } from '@/components/MessageText'
import { PUBLISH, IS_FULL_DAY_WINDOW } from '@/config'
import { DEFAULT_SEARCH } from '@/lib/search'
import { ShellContext } from '@/lib/shell'
import { useZoom } from '@/lib/useZoom'
import type { ArchiveIndex } from '@/types'

export function RootLayout() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { date?: string }
  const qc = useQueryClient()
  const { data: index, isPending, error } = useQuery(indexQuery)
  const { zoom, zoomIn, zoomOut, reset: resetZoom } = useZoom()

  const [calendarOpen, setCalendarOpen] = useState(false)

  const available = useMemo(() => index?.days.filter((d) => d.count > 0) ?? [], [index])
  const selected = params.date

  const prefetch = useCallback(
    (date: string) => {
      void qc.prefetchQuery(dayQuery(date))
    },
    [qc],
  )

  const goToDay = useCallback(
    (date: string) => {
      setCalendarOpen(false)
      void navigate({
        to: '/d/$date',
        params: { date },
        search: (s) => ({ ...DEFAULT_SEARCH, ...s }),
      })
    },
    [navigate],
  )

  // ← / → step through days that actually have messages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (!selected || !available.length) return

      const at = available.findIndex((d) => d.date === selected)
      if (at === -1) return
      const next = available[at + (e.key === 'ArrowRight' ? 1 : -1)]
      if (!next) return

      e.preventDefault()
      goToDay(next.date)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, available, goToDay])

  const shell = useMemo(
    () => ({ calendarOpen, setCalendarOpen, zoom, zoomIn, zoomOut, resetZoom }),
    [calendarOpen, zoom, zoomIn, zoomOut, resetZoom],
  )

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center">
        <div>
          <h1 className="mb-2 text-lg font-semibold text-neutral-100">Archive not found</h1>
          <p className="mb-4 max-w-md text-sm text-neutral-400">
            Could not load <code className="text-neutral-300">/data/index.json</code>.
          </p>
          <p className="text-xs text-neutral-500">
            Run{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-neutral-300">
              npm run prep
            </code>{' '}
            to generate it from the archive.
          </p>
        </div>
      </div>
    )
  }

  const sidebarBody = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {isPending ? (
          <p className="px-1 text-xs text-neutral-500">Loading calendar…</p>
        ) : (
          <Calendar
            days={index!.days}
            selected={selected}
            onSelect={goToDay}
            onPrefetch={prefetch}
          />
        )}
      </div>
      {index && <ArchiveTotals index={index} />}
    </>
  )

  return (
    <ShellContext.Provider value={shell}>
      <EmoteContext.Provider value={index?.emotes ?? {}}>
        <div
          className="flex h-[100dvh] bg-neutral-950 text-neutral-100"
          style={{ ['--chat-zoom' as string]: zoom }}
        >
          {/* ── Calendar: fixed rail on desktop, drawer below lg ── */}
          <aside className="hidden w-[300px] flex-shrink-0 flex-col border-r border-white/10 bg-black/40 lg:flex">
            <div className="border-b border-white/10 px-4 py-3">
              <h1 className="text-sm font-semibold tracking-tight">Chat Preview</h1>
              <PublishWindowNote />
            </div>
            {sidebarBody}
          </aside>

          <Drawer
            open={calendarOpen}
            onClose={() => setCalendarOpen(false)}
            side="left"
            title="Calendar"
          >
            <div className="border-b border-white/10 px-4 py-2">
              <PublishWindowNote />
            </div>
            {sidebarBody}
          </Drawer>

          <main className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </EmoteContext.Provider>
    </ShellContext.Provider>
  )
}

function PublishWindowNote() {
  return (
    <p className="mt-0.5 text-[11px] text-neutral-500">
      {PUBLISH.START_DATE} → {PUBLISH.END_DATE}
      {!IS_FULL_DAY_WINDOW && (
        <>
          {' · '}
          <span className="text-amber-400/80">
            {PUBLISH.START_TIME}–{PUBLISH.END_TIME} only
          </span>
        </>
      )}
    </p>
  )
}

function ArchiveTotals({ index }: { index: ArchiveIndex }) {
  return (
    <div className="flex-shrink-0 border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
      <div className="flex justify-between">
        <span>Days</span>
        <span className="text-neutral-300 tabular-nums">{index.totals.daysWithData}</span>
      </div>
      <div className="flex justify-between">
        <span>Messages</span>
        <span className="text-neutral-300 tabular-nums">
          {index.totals.messages.toLocaleString('en-US')}
        </span>
      </div>
    </div>
  )
}
