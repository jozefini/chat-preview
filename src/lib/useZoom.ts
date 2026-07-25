import { useCallback, useEffect, useRef, useState } from 'react'

/** `:v2` retires the pre-responsive default that phones had already stored. */
const KEY = 'chat-preview:zoom:v2'
export const ZOOM_MIN = 1
export const ZOOM_MAX = 2.2
export const ZOOM_STEP = 0.15
/** Slightly larger than the extension, which is cramped on a full-size screen. */
export const ZOOM_DEFAULT = 1.3
/**
 * Phones have none of that spare width. At 1.3 the chat pane renders visibly
 * larger than the app chrome around it, which reads as "the content is zoomed
 * in while the header is fine" — so narrow viewports start at exact extension
 * sizing instead.
 */
export const ZOOM_DEFAULT_NARROW = 1
/** Matches Tailwind's `sm` breakpoint, where the header switches to its compact form. */
const NARROW = '(max-width: 639px)'

const clamp = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100))

/** Read once per load, not on resize: a rotating phone shouldn't resize its text. */
function defaultZoom(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return ZOOM_DEFAULT
  return window.matchMedia(NARROW).matches ? ZOOM_DEFAULT_NARROW : ZOOM_DEFAULT
}

/**
 * Chat text scale, persisted across sessions.
 *
 * `1` is exact extension sizing; everything in chat.css scales off this single
 * number, so rows keep the extension's proportions at any zoom level.
 *
 * Only a zoom the viewer actually chose is written to storage. Persisting the
 * default too would freeze whichever device unlocked the archive first, and the
 * viewport-appropriate default could never apply again.
 */
export function useZoom() {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return defaultZoom()
    const stored = Number(localStorage.getItem(KEY))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : defaultZoom()
  })

  const chosen = useRef(false)

  useEffect(() => {
    if (!chosen.current) return
    try {
      localStorage.setItem(KEY, String(zoom))
    } catch {
      // Private mode or blocked storage — zoom just won't persist.
    }
  }, [zoom])

  const setZoom = useCallback((v: number) => {
    chosen.current = true
    setZoomState(clamp(v))
  }, [])
  const zoomIn = useCallback(() => {
    chosen.current = true
    setZoomState((z) => clamp(z + ZOOM_STEP))
  }, [])
  const zoomOut = useCallback(() => {
    chosen.current = true
    setZoomState((z) => clamp(z - ZOOM_STEP))
  }, [])
  const reset = useCallback(() => {
    chosen.current = true
    setZoomState(defaultZoom())
  }, [])

  return { zoom, setZoom, zoomIn, zoomOut, reset }
}
