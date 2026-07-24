import { QueryClient } from '@tanstack/react-query'

/**
 * Shared instance — the router's loaders use it too, so a day prefetched on
 * calendar hover is already warm by the time the route renders.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Every file this app fetches is a build artifact: immutable for the
      // life of the session. Refetching any of it is pure waste.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})
