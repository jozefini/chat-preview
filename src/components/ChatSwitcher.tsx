import type { Chat } from '@/config'

interface Props {
  /** Chats this viewer may open, in config order. */
  chats: readonly Chat[]
  /** Id of the chat currently open. */
  current: string
  onSelect: (id: string) => void
  /** Warm the target's index on hover, so the switch has nothing to wait for. */
  onPrefetch?: (id: string) => void
}

/**
 * Which archive you are reading, and the way to the others.
 *
 * Rendered as a segmented control rather than a dropdown: with a handful of
 * chats every option is visible at once, so switching is one click and there is
 * never a doubt about which archive the page below belongs to. It wraps rather
 * than scrolls, which keeps a long chat name from pushing the sidebar sideways.
 *
 * A single visible chat renders as a plain heading — a switcher with one option
 * is just a button that does nothing.
 */
export function ChatSwitcher({ chats, current, onSelect, onPrefetch }: Props) {
  if (chats.length <= 1) {
    return (
      <h1 className="text-sm font-semibold tracking-tight">
        {chats[0]?.name ?? 'Chat Preview'}
      </h1>
    )
  }

  return (
    <div
      role="tablist"
      aria-label="Chat"
      className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/40 p-1"
    >
      {chats.map((chat) => {
        const active = chat.id === current
        return (
          <button
            key={chat.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(chat.id)}
            onMouseEnter={() => onPrefetch?.(chat.id)}
            onFocus={() => onPrefetch?.(chat.id)}
            className={[
              'min-w-0 flex-1 cursor-pointer truncate rounded-md px-2 py-1.5 text-xs font-medium transition',
              active
                ? 'bg-sky-400/20 text-sky-100'
                : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100',
            ].join(' ')}
          >
            {chat.name}
          </button>
        )
      })}
    </div>
  )
}
