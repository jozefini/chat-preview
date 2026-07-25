import { formatClock } from '@/config'

interface Props {
  fromMin: number
  toMin: number
  /** Outer bounds — the day's visible window for this viewer. */
  minMin: number
  maxMin: number
  onChange: (from: number, to: number) => void
}

/**
 * Time-of-day narrowing *within* the day's visible window. The window is the
 * hard outer bound — these sliders can only tighten it, never widen it, and
 * widening them wouldn't help anyway: messages outside the window were dropped
 * when the day was decoded.
 *
 * The bounds move per day, since each allowed date carries its own window.
 */
export function TimeRange({ fromMin, toMin, minMin, maxMin, onChange }: Props) {
  // The URL carries whole-day defaults, so on a windowed day the incoming
  // values can sit outside the slider's range. Clamp for display rather than
  // rewriting the URL — out there the filter is a no-op anyway.
  const from = Math.min(Math.max(fromMin, minMin), maxMin)
  const to = Math.min(Math.max(toMin, minMin), maxMin)
  const atFull = from <= minMin && to >= maxMin

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
          Time of day
        </label>
        <span className="font-mono text-[11px] text-neutral-300 tabular-nums">
          {formatClock(from)} – {formatClock(to)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <input
          type="range"
          aria-label="Earliest time"
          min={minMin}
          max={maxMin}
          step={15}
          value={from}
          onChange={(e) => onChange(Math.min(Number(e.target.value), to), to)}
          className="accent-sky-400"
        />
        <input
          type="range"
          aria-label="Latest time"
          min={minMin}
          max={maxMin}
          step={15}
          value={to}
          onChange={(e) => onChange(from, Math.max(Number(e.target.value), from))}
          className="accent-sky-400"
        />
      </div>

      {!atFull && (
        <button
          type="button"
          onClick={() => onChange(minMin, maxMin)}
          className="mt-1.5 cursor-pointer text-[11px] text-sky-400 hover:text-sky-300"
        >
          Reset to full window
        </button>
      )}
    </div>
  )
}
