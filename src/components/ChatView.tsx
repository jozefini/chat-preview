import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Message } from '@/types'
import { ChatRow } from './ChatRow'

interface Props {
  messages: Message[]
  terms: string[]
  /** Changes when the day changes — resets scroll and replays the fade-in. */
  resetKey: string
  /** Chat text scale; row heights depend on it, so measurements must refresh. */
  zoom: number
}

/**
 * A day can hold ~12k messages. The extension rendered all of them into the
 * DOM; here TanStack Virtual keeps it to whatever fits on screen plus overscan,
 * which is what makes scrolling and filtering stay smooth.
 *
 * Row heights vary (replies carry an extra line, long messages wrap), so this
 * measures each row rather than assuming a fixed height.
 */
export function ChatView({ messages, terms, resetKey, zoom }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [animate, setAnimate] = useState(true)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    // Close to a single-line row at this zoom; measureElement corrects each one
    // on mount, so this only has to be near enough to size the scrollbar well.
    estimateSize: () => Math.round(22 * zoom),
    overscan: 24,
    getItemKey: (i) => messages[i].i,
  })

  // New day → back to the top, and let the fade-in play once.
  useLayoutEffect(() => {
    setAnimate(true)
    virtualizer.scrollToIndex(0, { align: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // The fade-in is a first-impression flourish from the extension. Left on
  // during scrolling it would re-fire every time a row recycled, so it gets
  // switched off once the initial rows have played.
  useEffect(() => {
    if (!animate) return
    const t = setTimeout(() => setAnimate(false), 400)
    return () => clearTimeout(t)
  }, [animate, resetKey])

  // Zoom changes every row's height, so cached measurements are stale.
  useEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const items = virtualizer.getVirtualItems()

  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <svg
          width="40"
          height="40"
          className="opacity-20"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <p className="text-sm text-neutral-400">No messages match these filters</p>
        <p className="text-xs text-neutral-600">Try clearing the search or author filter</p>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="chat-scroll chat-pane min-h-0 flex-1 overflow-y-auto px-2 py-2"
    >
      <div
        className={animate ? undefined : 'no-anim'}
        style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
      >
        {items.map((item) => (
          <div
            key={item.key}
            className="virt-row"
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <ChatRow m={messages[item.index]} terms={terms} />
          </div>
        ))}
      </div>
    </div>
  )
}
