import { useMemo, useState } from 'react'
import type { DecodedDay } from '@/types'

interface Props {
  authors: DecodedDay['authors']
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

/**
 * Author filter. The extension had no equivalent — you scrolled and squinted.
 * Sorted by message volume so the people who actually talked are on top,
 * with a type-ahead for the long tail.
 */
export function AuthorPicker({ authors, selected, onChange }: Props) {
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return authors
    return authors.filter((a) => a.name.toLowerCase().includes(needle))
  }, [authors, q])

  function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange(next)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">
          Authors
          <span className="ml-1.5 font-normal text-neutral-600">{authors.length}</span>
        </label>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="cursor-pointer text-[11px] text-sky-400 hover:text-sky-300"
          >
            Clear {selected.size}
          </button>
        )}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find an author…"
        className="mb-2 w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-sky-400/60 focus:outline-none"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {shown.length === 0 && (
          <p className="px-1 py-2 text-xs text-neutral-600">No author matches “{q}”.</p>
        )}
        <ul className="flex flex-col gap-0.5">
          {shown.map((a) => {
            const on = selected.has(a.name)
            return (
              <li key={a.name}>
                <button
                  type="button"
                  onClick={() => toggle(a.name)}
                  aria-pressed={on}
                  className={[
                    'flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition',
                    on ? 'bg-sky-400/15' : 'hover:bg-white/5',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'h-3 w-3 flex-shrink-0 rounded-sm border',
                      on ? 'border-sky-400 bg-sky-400' : 'border-white/20',
                    ].join(' ')}
                  />
                  <span
                    className="truncate font-semibold"
                    style={{ color: a.color || '#e5e7eb' }}
                    title={a.name}
                  >
                    {a.name}
                  </span>
                  <span className="ml-auto flex-shrink-0 text-[10px] text-neutral-500 tabular-nums">
                    {a.count.toLocaleString('en-US')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
