import { memo } from 'react'
import type { Message } from '@/types'
import { MessageText } from './MessageText'

/**
 * Reply arrow icon — identical path data to the extension
 * (watch-chat/popup.js:288-291).
 */
function ReplyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="reply-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  )
}

interface Props {
  m: Message
  terms: string[]
}

/**
 * One chat line. The element order, class names and inline styles below mirror
 * watch-chat/popup.js:299-302 exactly — including the lack of whitespace
 * between the author, arrow, separator and body spans, which the extension
 * relies on for its inline layout. Changing the formatting here changes the
 * rendering.
 */
export const ChatRow = memo(function ChatRow({ m, terms }: Props) {
  return (
    <div className="chat-row msg-row">
      {m.isReply && (
        <div className="reply-line">
          <ReplyIcon />
          <span className="reply-user" style={{ color: m.replyToColor, opacity: 0.7 }}>
            {m.replyTo}
          </span>
          {m.replyPreview ? <span className="reply-snippet">{m.replyPreview}</span> : null}
        </div>
      )}
      {m.time ? <span className="chat-timestamp">{m.time}</span> : null}
      <span className="author-name" style={{ color: m.authorColor }}>
        {m.author}
      </span>
      <span className="msg-sep">:</span>
      <span className="msg-inline">
        <MessageText text={m.text} lcText={m.lcText} terms={terms} />
      </span>
    </div>
  )
})
