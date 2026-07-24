/** Shapes emitted by `scripts/prep.mjs`. Keep in sync with that file. */

/** `[name, cssColor]` */
export type AuthorEntry = [string, string]

/** `[msFromMidnight, authorIdx, text]` or `[…, replyAuthorIdx, replyPreview]` */
export type RawMessage =
  | [number, number, string]
  | [number, number, string, number, string]

export interface RawDay {
  /** `YYYY-MM-DD` */
  d: string
  /** Epoch ms of local midnight for this day. */
  s: number
  a: AuthorEntry[]
  m: RawMessage[]
}

export interface DayMeta {
  date: string
  count: number
  replies: number
  authors: number
  firstMs: number | null
  lastMs: number | null
  topAuthors: string[]
}

export interface ArchiveIndex {
  generatedAt: string
  archive: string
  config: {
    startDate: string
    endDate: string
    startTime: string
    endTime: string
    tzOffsetMinutes: number
  }
  totals: {
    days: number
    daysWithData: number
    messages: number
    droppedByWindow: number
  }
  /** emote token (`"[KEKW]"`) → filename under `/emojis/` */
  emotes: Record<string, string>
  days: DayMeta[]
}

/** A decoded message, ready to render and filter. */
export interface Message {
  /** Index within the day, before filtering. Stable React key. */
  i: number
  /** Absolute epoch ms. */
  ms: number
  /** Minutes since local midnight — what the time filter compares against. */
  min: number
  /** `HH:MM` in the archive's timezone. */
  time: string
  author: string
  authorColor: string
  text: string
  isReply: boolean
  replyTo: string
  replyToColor: string
  replyPreview: string
  /** Lowercased `text`, precomputed once so search is a plain substring scan. */
  lcText: string
  /** Lowercased `author`. */
  lcAuthor: string
}

export interface DecodedDay {
  date: string
  dayStart: number
  messages: Message[]
  /** Authors present in the day, most messages first. */
  authors: { name: string; color: string; count: number }[]
}
