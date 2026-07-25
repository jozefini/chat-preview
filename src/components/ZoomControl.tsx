import { ZOOM_MAX, ZOOM_MIN } from '@/lib/useZoom'

interface Props {
  zoom: number
  onIn: () => void
  onOut: () => void
  onReset: () => void
}

/**
 * Chat text size. `1.0×` is exactly the extension's sizing — the label doubles
 * as a reset button, so it's always one click back to whatever this screen
 * starts at (1.0× on phones, 1.3× on wider ones).
 */
export function ZoomControl({ zoom, onIn, onOut, onReset }: Props) {
  return (
    <div className="flex flex-shrink-0 items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
      <button
        type="button"
        onClick={onOut}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Decrease chat text size"
        className="cursor-pointer rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        A−
      </button>
      <button
        type="button"
        onClick={onReset}
        title="Reset to the default size for this screen"
        className="cursor-pointer px-1 text-[10px] text-neutral-500 tabular-nums hover:text-neutral-200"
      >
        {zoom.toFixed(2)}×
      </button>
      <button
        type="button"
        onClick={onIn}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Increase chat text size"
        className="cursor-pointer rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
      >
        A+
      </button>
    </div>
  )
}
