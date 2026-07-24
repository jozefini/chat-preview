import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { RootLayout } from '@/routes/root'
import { DayRoute } from '@/routes/day'
import { daysWithData, hasMessages, indexQuery, nearestDayWithData } from '@/lib/data'
import { queryClient } from '@/lib/queryClient'
import { DEFAULT_SEARCH, validateDaySearch } from '@/lib/search'

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  /** Land on the most recent day that actually has messages. */
  loader: async () => {
    const index = await queryClient.ensureQueryData(indexQuery)
    const withData = daysWithData(index)
    const latest = withData[withData.length - 1]
    if (latest) {
      throw redirect({
        to: '/d/$date',
        params: { date: latest.date },
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
          The publish window in <code className="text-neutral-400">src/config.ts</code> excludes
          every day in the archive, or prep has not been run yet.
        </p>
      </div>
    </div>
  ),
})

const dayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/d/$date',
  component: DayRoute,
  validateSearch: validateDaySearch,
  /**
   * A date outside the publish window, or one holding no messages, is a dead
   * end — so it never renders. Redirect to the nearest day that does have
   * messages, which is also what makes a single-day archive land on that day
   * however you arrived. Filters reset to `DEFAULT_SEARCH` (full time-of-day
   * window): the ones in the URL belonged to a day you are no longer on, and
   * carrying a narrowed range onto a different day can land you on a date that
   * looks empty for a second, unrelated reason.
   */
  loader: async ({ params }) => {
    const index = await queryClient.ensureQueryData(indexQuery)
    if (hasMessages(index, params.date)) return null

    const nearest = nearestDayWithData(index, params.date)
    throw redirect(
      nearest
        ? { to: '/d/$date', params: { date: nearest }, search: DEFAULT_SEARCH }
        : { to: '/' },
    )
  },
})

const routeTree = rootRoute.addChildren([indexRoute, dayRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
