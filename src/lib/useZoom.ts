import { useCallback, useEffect, useState } from 'react'

const KEY = 'chat-preview:zoom'
export const ZOOM_MIN = 1
export const ZOOM_MAX = 2.2
export const ZOOM_STEP = 0.15
/** Slightly larger than the extension, which is cramped on a full-size screen. */
export const ZOOM_DEFAULT = 1.3

const clamp = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100))

/**
 * Chat text scale, persisted across sessions.
 *
 * `1` is exact extension sizing; everything in chat.css scales off this single
 * number, so rows keep the extension's proportions at any zoom level.
 */
export function useZoom() {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return ZOOM_DEFAULT
    const stored = Number(localStorage.getItem(KEY))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : ZOOM_DEFAULT
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(zoom))
    } catch {
      // Private mode or blocked storage — zoom just won't persist.
    }
  }, [zoom])

  const setZoom = useCallback((v: number) => setZoomState(clamp(v)), [])
  const zoomIn = useCallback(() => setZoomState((z) => clamp(z + ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setZoomState((z) => clamp(z - ZOOM_STEP)), [])
  const reset = useCallback(() => setZoomState(ZOOM_DEFAULT), [])

  return { zoom, setZoom, zoomIn, zoomOut, reset }
}
