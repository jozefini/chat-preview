import { WINDOW_START_MIN, WINDOW_END_MIN } from '@/config'

interface Props {
  fromMin: number
  toMin: number
  onChange: (from: number, to: number) => void
}

function fmt(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/**
 * Time-of-day narrowing *within* the published window. The config window is
 * the hard outer bound — these sliders can only tighten it, never widen it.
 */
export function TimeRange({ fromMin, toMin, onChange }: Props) {
  const atFull = fromMin <= WINDOW_START_MIN && toMin >= WINDOW_END_MIN

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
          Time of day
        </label>
        <span className="font-mono text-[11px] text-neutral-300 tabular-nums">
          {fmt(fromMin)} – {fmt(toMin)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <input
          type="range"
          aria-label="Earliest time"
          min={WINDOW_START_MIN}
          max={WINDOW_END_MIN}
          step={15}
          value={fromMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), toMin), toMin)}
          className="accent-sky-400"
        />
        <input
          type="range"
          aria-label="Latest time"
          min={WINDOW_START_MIN}
          max={WINDOW_END_MIN}
          step={15}
          value={toMin}
          onChange={(e) => onChange(fromMin, Math.max(Number(e.target.value), fromMin))}
          className="accent-sky-400"
        />
      </div>

      {!atFull && (
        <button
          type="button"
          onClick={() => onChange(WINDOW_START_MIN, WINDOW_END_MIN)}
          className="mt-1.5 cursor-pointer text-[11px] text-sky-400 hover:text-sky-300"
        >
          Reset to full window
        </button>
      )}
    </div>
  )
}
