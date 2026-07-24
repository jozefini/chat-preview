import { createContext, memo, useContext, type ReactNode } from 'react'
import { matchRanges } from '@/lib/filter'

/**
 * Emote token (`"[KEKW]"`) → filename under `/emojis/`.
 * Comes from `index.json`, which prep builds by validating every entry in the
 * extension's emoji-map.js against the files on disk — so anything in here is
 * guaranteed to resolve.
 */
export const EmoteContext = createContext<Record<string, string>>({})

const EMOTE_BASE = `${import.meta.env.BASE_URL}emojis/`

/**
 * Same split as the extension (watch-chat/popup.js:121): emote tokens and
 * @mentions become their own parts, everything else is literal text.
 */
const TOKEN_RE = /(\[[^\]]+\]|@\S+)/g

function highlight(text: string, offset: number, ranges: [number, number][]): ReactNode {
  if (!ranges.length) return text

  const end = offset + text.length
  const out: ReactNode[] = []
  let cursor = 0

  for (const [rs, re] of ranges) {
    if (re <= offset) continue
    if (rs >= end) break

    const localStart = Math.max(rs - offset, 0)
    const localEnd = Math.min(re - offset, text.length)
    if (localStart >= localEnd) continue

    if (localStart > cursor) out.push(text.slice(cursor, localStart))
    out.push(
      <mark className="hit" key={`h${localStart}`}>
        {text.slice(localStart, localEnd)}
      </mark>,
    )
    cursor = localEnd
  }

  if (!out.length) return text
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

interface Props {
  text: string
  /** Lowercased `text`, precomputed at decode time. */
  lcText: string
  /** Lowercased search terms; empty when nothing is being searched. */
  terms: string[]
}

/**
 * Renders a message body: emotes as images, @mentions chipped, search hits
 * marked. Ports `renderMessageText` (watch-chat/popup.js:118-135) to JSX —
 * same regex, same emote sizing, same mention styling — but as real nodes
 * instead of `innerHTML`, so nothing in the archive can inject markup.
 */
export const MessageText = memo(function MessageText({ text, lcText, terms }: Props) {
  const emotes = useContext(EmoteContext)
  const ranges = terms.length ? matchRanges(lcText, terms) : []

  const parts = text.split(TOKEN_RE)
  const nodes: ReactNode[] = []
  let offset = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    const file = emotes[part]
    if (file) {
      const name = part.slice(1, -1)
      nodes.push(
        <img
          key={i}
          alt={name}
          title={name}
          className="emoji-inline"
          src={EMOTE_BASE + encodeURIComponent(file)}
          style={{ height: '1.45em' }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />,
      )
    } else if (part.startsWith('@')) {
      nodes.push(
        <span
          key={i}
          style={{
            background: 'rgba(56,189,248,0.12)',
            color: '#7dd3fc',
            borderRadius: 2,
            padding: '0 2px',
          }}
        >
          {highlight(part, offset, ranges)}
        </span>,
      )
    } else {
      // Unmapped `[token]` falls through to here and renders as literal text —
      // which is how the 4 emotes with missing image files behave, instead of
      // the broken <img> the extension shows.
      nodes.push(<span key={i}>{highlight(part, offset, ranges)}</span>)
    }

    offset += part.length
  }

  return <>{nodes}</>
})
