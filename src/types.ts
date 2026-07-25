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

/** What a day looks like from one viewpoint. Counts already have a window applied. */
export interface DayStats {
  count: number
  replies: number
  authors: number
  firstMs: number | null
  lastMs: number | null
  topAuthors: string[]
}

/**
 * A day in the index, summarised twice: the top-level fields are the whole day
 * (what an admin sees) and `pub` is the same day narrowed to its public clock
 * window. `pub: null` means the date is not in `ALLOWED_DATES` at all — for a
 * public visitor the day does not exist, which is different from a published
 * day that happens to be empty (`pub.count === 0`).
 */
export interface DayMeta extends DayStats {
  date: string
  pub: DayStats | null
}

export interface ArchiveIndex {
  generatedAt: string
  archive: string
  config: {
    tzOffsetMinutes: number
    /** Snapshot of `ALLOWED_DATES` at prep time, with windows resolved. */
    allowedDates: { date: string; from: string; to: string }[]
  }
  totals: {
    days: number
    daysWithData: number
    messages: number
    publicDaysWithData: number
    publicMessages: number
    /** Rows with no usable timestamp — a data problem, not a window trim. */
    droppedInvalid: number
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
