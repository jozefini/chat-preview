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
 * window. `pub: null` means the date is not in the chat's `publish` list at all
 * — for a public visitor the day does not exist, which is different from a
 * published day that happens to be empty (`pub.count === 0`).
 */
export interface DayMeta extends DayStats {
  date: string
  pub: DayStats | null
}

/** Which archive a file belongs to. Echoed by prep so a stray file identifies itself. */
export interface ChatRef {
  id: string
  name: string
}

export interface ArchiveIndex {
  generatedAt: string
  chat: ChatRef
  archive: string
  config: {
    tzOffsetMinutes: number
    /** Snapshot of the chat's `publish` list at prep time, windows resolved. */
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

/**
 * One person's all-time record, across every day in the archive — no clock
 * window applied, because the leaderboard is admin-only.
 */
export interface AuthorStat {
  name: string
  /** The colour they used for the most messages. May be `''`. */
  color: string
  messages: number
  /** Of those, how many were replies to someone. */
  replies: number
  /** Messages other people sent as replies to them. */
  received: number
  /** Days on which they sent at least one message. */
  days: number
  /** Epoch ms of their first and last message, or `null` if they sent none. */
  firstMs: number | null
  lastMs: number | null
  /** Their busiest single day, and its count. */
  bestDate: string | null
  bestCount: number
}

/** `public/data/<chatId>/stats.json` — the all-time leaderboard, built by prep. */
export interface ArchiveStats {
  generatedAt: string
  chat: ChatRef
  archive: string
  span: {
    /** First and last day holding messages, or `null` for an empty archive. */
    from: string | null
    to: string | null
    days: number
  }
  totals: {
    messages: number
    replies: number
    authors: number
  }
  /** Ranked, busiest first. Index 0 is rank 1. */
  authors: AuthorStat[]
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
