import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { RootLayout } from '@/routes/root'
import { DayRoute } from '@/routes/day'
import { indexQuery } from '@/lib/data'
import { queryClient } from '@/lib/queryClient'
import { DEFAULT_SEARCH, validateDaySearch } from '@/lib/search'

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  /** Land on the most recent day that actually has messages. */
  loader: async () => {
    const index = await queryClient.ensureQueryData(indexQuery)
    const withData = index.days.filter((d) => d.count > 0)
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
