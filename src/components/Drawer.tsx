import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  title: string
  children: ReactNode
}

/**
 * Off-canvas panel for narrow screens. Rendered only below `lg`; the same
 * content sits in the static layout above that breakpoint, so there is one
 * source of markup and no duplicated component tree.
 */
export function Drawer({ open, onClose, side, title, children }: Props) {
  // Escape closes, and the page behind must not scroll while it's open.
  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <div className={`lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'fixed top-0 z-50 flex h-full w-[86vw] max-w-[340px] flex-col bg-neutral-950 shadow-2xl transition-transform duration-200 ease-out',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          'border-white/10',
          open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="cursor-pointer rounded-md px-2 py-1 text-lg leading-none text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </aside>
    </div>
  )
}
