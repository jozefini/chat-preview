import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { RootLayout } from '@/routes/root'
import { DayRoute } from '@/routes/day'
import { StatsRoute } from '@/routes/stats'
import { daysWithData, hasMessages, indexQuery, nearestDayWithData } from '@/lib/data'
import { queryClient } from '@/lib/queryClient'
import { readRole } from '@/lib/auth'
import { DEFAULT_SEARCH, validateDaySearch } from '@/lib/search'
import { DEFAULT_CHAT, findChat, visibleChats, type Chat } from '@/config'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ROUTES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   /                     → the first chat this viewer can open
 *   /c/$chatId            → that chat's most recent day with messages
 *   /c/$chatId/d/$date    → the chat view
 *   /c/$chatId/stats      → that chat's all-time leaderboard (admin only)
 *   /d/$date              → legacy, before there was more than one chat
 *
 * The chat id is a path segment rather than a search param so every URL names
 * exactly one archive: a shared link cannot land somebody in a different chat
 * because their last switch is still in storage.
 */

const rootRoute = createRootRoute({ component: RootLayout })

/**
 * Loaders run outside the component tree, so they read the role from storage
 * rather than context. `main.tsx` invalidates the router whenever the role
 * changes, so nothing here is ever left over from the previous session.
 */
const isAdmin = () => readRole() === 'admin'

/**
 * The chat this URL names, or a redirect away from it.
 *
 * Throws rather than returning `null` for the two ways a chat id can be a dead
 * end — it does not exist, or it holds nothing this viewer may open — so every
 * loader below can treat a returned chat as safe to load.
 */
function requireChat(chatId: string): Chat {
  const chat = findChat(chatId)
  if (!chat || !visibleChats(isAdmin()).some((c) => c.id === chat.id)) {
    throw redirect({ to: '/' })
  }
  return chat
}

/** That chat's most recent day holding messages for this viewer, or `null`. */
async function latestDate(chat: Chat): Promise<string | null> {
  const index = await queryClient.ensureQueryData(indexQuery(chat.id))
  const withData = daysWithData(index, isAdmin())
  return withData[withData.length - 1]?.date ?? null
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  /** Land in the first chat this viewer can open, on its most recent day. */
  loader: async () => {
    const [chat] = visibleChats(isAdmin())
    if (!chat) return null

    const date = await latestDate(chat)
    if (date) {
      throw redirect({
        to: '/c/$chatId/d/$date',
        params: { chatId: chat.id, date },
        search: DEFAULT_SEARCH,
      })
    }
    return null
  },
  component: () => (
    <div className="flex flex-1 items-center justify-center p-10 text-center">
      <div>
        <p className="text-sm font-medium text-neutral-300">No days published</p>
        <p className="mt-1 max-w-md text-xs text-neutral-500">
          Every chat's <code className="text-neutral-400">publish</code> list in{' '}
          <code className="text-neutral-400">src/config.ts</code> is empty, or prep has not been
          run yet.
        </p>
      </div>
    </div>
  ),
})

/** Bare chat URL — the switcher's target. Resolves to that chat's latest day. */
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$chatId',
  loader: async ({ params }) => {
    const chat = requireChat(params.chatId)
    const date = await latestDate(chat)
    throw redirect(
      date
        ? {
            to: '/c/$chatId/d/$date',
            params: { chatId: chat.id, date },
            search: DEFAULT_SEARCH,
          }
        : { to: '/' },
    )
  },
})

const dayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$chatId/d/$date',
  component: DayRoute,
  validateSearch: validateDaySearch,
  /**
   * A date this viewer may not open, or one holding no messages for them, is a
   * dead end — so it never renders. Redirect to the nearest day *in the same
   * chat* that does have messages, which is also what makes a single-day
   * archive land on that day however you arrived. Both checks are role-aware,
   * so a URL an admin shared quietly bounces a public visitor to a day they are
   * allowed to see rather than showing them an empty page for a day that isn't
   * theirs.
   *
   * Filters reset to `DEFAULT_SEARCH` (full time-of-day window): the ones in
   * the URL belonged to a day you are no longer on, and carrying a narrowed
   * range onto a different day can land you on a date that looks empty for a
   * second, unrelated reason.
   */
  loader: async ({ params }) => {
    const admin = isAdmin()
    const chat = requireChat(params.chatId)
    const index = await queryClient.ensureQueryData(indexQuery(chat.id))
    if (hasMessages(index, params.date, admin)) return null

    const nearest = nearestDayWithData(index, params.date, admin)
    throw redirect(
      nearest
        ? {
            to: '/c/$chatId/d/$date',
            params: { chatId: chat.id, date: nearest },
            search: DEFAULT_SEARCH,
          }
        : { to: '/' },
    )
  },
})

/**
 * One chat's all-time leaderboard, admin only.
 *
 * The numbers here span the whole archive — including the days and hours a
 * public visitor is never shown — so the role check happens in the loader,
 * before the component mounts and before `stats.json` is ever requested. A
 * public session that types the URL is bounced to the archive it does have.
 */
const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$chatId/stats',
  component: StatsRoute,
  loader: ({ params }) => {
    if (!isAdmin()) throw redirect({ to: '/' })
    requireChat(params.chatId)
    return null
  },
})

/**
 * Links minted before the app carried more than one archive. They can only ever
 * have meant Ferma VIP, so send them there with their date intact rather than
 * dropping people on the landing page.
 */
const legacyDayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/d/$date',
  loader: ({ params }) => {
    throw redirect({
      to: '/c/$chatId/d/$date',
      params: { chatId: DEFAULT_CHAT.id, date: params.date },
      search: DEFAULT_SEARCH,
    })
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  chatRoute,
  dayRoute,
  statsRoute,
  legacyDayRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
