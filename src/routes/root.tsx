import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dayQuery, daysWithData, indexQuery } from '@/lib/data'
import { Calendar } from '@/components/Calendar'
import { ChatSwitcher } from '@/components/ChatSwitcher'
import { Drawer } from '@/components/Drawer'
import { EmoteContext } from '@/components/MessageText'
import { DEFAULT_CHAT, findChat, visibleChats, type Chat } from '@/config'
import { DEFAULT_SEARCH } from '@/lib/search'
import { useAuth } from '@/lib/auth'
import { ShellContext } from '@/lib/shell'
import { useZoom } from '@/lib/useZoom'
import type { ArchiveIndex } from '@/types'

export function RootLayout() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { chatId?: string; date?: string }
  const qc = useQueryClient()
  const { zoom, zoomIn, zoomOut, reset: resetZoom } = useZoom()
  const { isAdmin, logout } = useAuth()

  const chats = useMemo(() => visibleChats(isAdmin), [isAdmin])
  /**
   * The chat the URL names. The fallback only matters for the split second on
   * `/` before its loader redirects — every real route validates the id itself.
   */
  const chat: Chat = findChat(params.chatId) ?? chats[0] ?? DEFAULT_CHAT

  const { data: index, isPending, error } = useQuery(indexQuery(chat.id))
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Days *this viewer* can open in *this chat* — what ←/→ steps through, so the
  // arrows never land a public visitor on a day the router would bounce them off.
  const available = useMemo(() => (index ? daysWithData(index, isAdmin) : []), [index, isAdmin])
  const selected = params.date

  const prefetch = useCallback(
    (date: string) => {
      void qc.prefetchQuery(dayQuery(chat, date, isAdmin))
    },
    [qc, chat, isAdmin],
  )

  const goToDay = useCallback(
    (date: string) => {
      setCalendarOpen(false)
      void navigate({
        to: '/c/$chatId/d/$date',
        params: { chatId: chat.id, date },
        search: (s) => ({ ...DEFAULT_SEARCH, ...s }),
      })
    },
    [navigate, chat.id],
  )

  /**
   * Switch archives, staying on the same date when the other chat has one.
   *
   * The two archives overlap in April, so "the same day in the other chat" is
   * often a real page — and landing there makes the switch feel like changing
   * channel rather than starting over. When it isn't (`/c/$chatId` with no
   * date), the chat route resolves to that archive's most recent day instead.
   *
   * Filters are dropped either way: authors and search terms belong to the chat
   * you left, and carrying them across would open the new one looking empty for
   * a reason that has nothing to do with the day.
   */
  const goToChat = useCallback(
    (nextId: string) => {
      if (nextId === chat.id) return
      setCalendarOpen(false)

      const target = findChat(nextId)
      const keepDate =
        selected && target && hasDay(qc.getQueryData<ArchiveIndex>(['index', nextId]), selected, isAdmin)

      void navigate(
        keepDate
          ? {
              to: '/c/$chatId/d/$date',
              params: { chatId: nextId, date: selected },
              search: DEFAULT_SEARCH,
            }
          : { to: '/c/$chatId', params: { chatId: nextId } },
      )
    },
    [navigate, qc, chat.id, selected, isAdmin],
  )

  /** Warm the other chat's index on hover, so switching feels instant. */
  const prefetchChat = useCallback(
    (id: string) => {
      void qc.prefetchQuery(indexQuery(id))
    },
    [qc],
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
    () => ({ chat, calendarOpen, setCalendarOpen, zoom, zoomIn, zoomOut, resetZoom }),
    [chat, calendarOpen, zoom, zoomIn, zoomOut, resetZoom],
  )

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center">
        <div>
          <h1 className="mb-2 text-lg font-semibold text-neutral-100">Archive not found</h1>
          <p className="mb-4 max-w-md text-sm text-neutral-400">
            Could not load{' '}
            <code className="text-neutral-300">/data/{chat.id}/index.json</code>.
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
            chat={chat}
            days={index!.days}
            isAdmin={isAdmin}
            selected={selected}
            onSelect={goToDay}
            onPrefetch={prefetch}
          />
        )}
      </div>
      {index && <ArchiveTotals chat={chat} index={index} isAdmin={isAdmin} onLogout={logout} />}
    </>
  )

  const header = (
    <>
      <ChatSwitcher
        chats={chats}
        current={chat.id}
        onSelect={goToChat}
        onPrefetch={prefetchChat}
      />
      <PublishWindowNote chat={chat} isAdmin={isAdmin} />
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
            <div className="border-b border-white/10 px-4 py-3">{header}</div>
            {sidebarBody}
          </aside>

          <Drawer
            open={calendarOpen}
            onClose={() => setCalendarOpen(false)}
            side="left"
            title="Calendar"
          >
            <div className="border-b border-white/10 px-4 py-3">{header}</div>
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

/**
 * Does a cached index hold messages for `date`? Used only to decide whether a
 * chat switch can keep the current date, so a cache miss (`undefined`) answers
 * "no" and the switch falls back to that archive's latest day — a guess here
 * would just be a redirect the router has to undo.
 */
function hasDay(index: ArchiveIndex | undefined, date: string, isAdmin: boolean): boolean {
  if (!index) return false
  return daysWithData(index, isAdmin).some((d) => d.date === date)
}

/** One line under the switcher saying what this session can reach in this chat. */
function PublishWindowNote({ chat, isAdmin }: { chat: Chat; isAdmin: boolean }) {
  if (isAdmin) {
    return (
      <p className="mt-2 text-[11px] text-neutral-500">
        <span className="font-medium text-amber-400/90">Admin</span> · full archive
      </p>
    )
  }

  const n = chat.windows.size
  return (
    <p className="mt-2 text-[11px] text-neutral-500">
      {n === 1 ? '1 published day' : `${n} published days`}
    </p>
  )
}

function ArchiveTotals({
  chat,
  index,
  isAdmin,
  onLogout,
}: {
  chat: Chat
  index: ArchiveIndex
  isAdmin: boolean
  onLogout: () => void
}) {
  // Public totals count only what the allowed windows expose, so the sidebar
  // never advertises a corpus the visitor can't actually open.
  const days = isAdmin ? index.totals.daysWithData : index.totals.publicDaysWithData
  const messages = isAdmin ? index.totals.messages : index.totals.publicMessages

  return (
    <div className="flex-shrink-0 border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
      <div className="flex justify-between">
        <span>Days</span>
        <span className="text-neutral-300 tabular-nums">{days}</span>
      </div>
      <div className="flex justify-between">
        <span>Messages</span>
        <span className="text-neutral-300 tabular-nums">
          {messages.toLocaleString('en-US')}
        </span>
      </div>
      {/* The leaderboard spans the whole archive, so it exists only for admins
          — a public session is never shown the way in, and the /stats loader
          turns it away even if the URL is typed by hand. */}
      {isAdmin && (
        <Link
          to="/c/$chatId/stats"
          params={{ chatId: chat.id }}
          className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-300/20 hover:text-amber-100"
        >
          🏆 All-time leaderboard
        </Link>
      )}

      <button
        type="button"
        onClick={onLogout}
        className="mt-2 w-full cursor-pointer rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
      >
        Log out{isAdmin ? ' of admin' : ''}
      </button>
    </div>
  )
}
