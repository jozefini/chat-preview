import { createContext, useContext } from 'react'
import type { Chat } from '@/config'

/**
 * Below `lg` the calendar and the filter rail collapse into drawers that slide
 * in from opposite edges. The calendar drawer is owned by the layout, but the
 * button that opens it lives in the day view's header — so the open state is
 * shared through here rather than lifted awkwardly through props.
 */
export interface Shell {
  /** The archive currently open — already resolved from the URL by the layout. */
  chat: Chat
  calendarOpen: boolean
  setCalendarOpen: (open: boolean) => void
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const ShellContext = createContext<Shell | null>(null)

export function useShell(): Shell {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside the root layout')
  return ctx
}
