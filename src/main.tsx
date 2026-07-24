import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { router } from '@/router'
import { queryClient } from '@/lib/queryClient'
import { PasswordGate } from '@/lib/gate'
import '@/styles/index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* The router mounts only after unlock, so no day/index JSON is fetched
          — and no chat is shown — until the password is accepted. */}
      <PasswordGate>
        <RouterProvider router={router} />
      </PasswordGate>
    </QueryClientProvider>
  </StrictMode>,
)
