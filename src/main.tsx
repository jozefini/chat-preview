import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { router } from '@/router'
import { queryClient } from '@/lib/queryClient'
import { PasswordGate } from '@/lib/auth'
import '@/styles/index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

/**
 * Role decides which days exist, and a switch leaves state behind in two
 * places: React Query holds days decoded against the old window, and the
 * router holds loader results that judged which dates were routable.
 *
 * Reload rather than clearing them by hand. Clearing the query cache while the
 * gate is swapping the tree out cancels the loaders mid-flight, and the router
 * — a module singleton that outlives its provider — keeps the resulting
 * CancelledError to greet the next session with. A reload sidesteps all of it,
 * and on a static site it costs one cached document: the new role boots from
 * nothing, which is exactly the guarantee worth having when the two roles see
 * different data.
 */
function onRoleChange() {
  window.location.reload()
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* The router mounts only after unlock, so no day/index JSON is fetched
          — and no chat is shown — until a password is accepted. */}
      <PasswordGate onRoleChange={onRoleChange}>
        <RouterProvider router={router} />
      </PasswordGate>
    </QueryClientProvider>
  </StrictMode>,
)
