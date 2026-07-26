/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE CHATS, AND WHAT THE PUBLIC CAN SEE OF EACH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The app serves SEVERAL archives side by side — "Ferma VIP", "BB VIP AL" —
 * and the switcher in the sidebar moves between them. Each one is an
 * independent archive with its own days, its own calendar, and its own publish
 * list; nothing is shared between them but the emote images.
 *
 * Every chat lists the days a public visitor may open:
 *
 *   • ADMIN_PASSWORD   → everything, in every chat. No filtering.
 *   • ARCHIVE_PASSWORD → only the days in that chat's `publish` list, and only
 *     within each day's optional `from`/`to` clock window.
 *
 * A day not in the list simply does not exist for a public visitor: it is not
 * routable, not in the calendar, and its JSON is refused by the data layer. A
 * chat with an EMPTY publish list does not exist for them either — it is left
 * out of the switcher rather than shown as an empty archive.
 *
 * ⚠️  Because admin sees everything, prep writes every day into `public/data/`,
 * which is served without authentication. The gate is a client-side lock — it
 * stops people who land on the URL, not someone who guesses
 * `/data/ferma-vip/days/2026-05-10.json`. For a hard boundary the site has to
 * sit behind something server-side (Vercel Deployment Protection, or
 * middleware that gates /data too).
 *
 * After changing any `publish` list, re-run:  npm run prep
 * (prep bakes the public per-day message counts the calendar reads.)
 */

/** One publishable day. Omit `from`/`to` to publish the whole day. */
export interface AllowedDate {
  /** `YYYY-MM-DD`, in archive-local time. */
  date: string
  /** Earliest visible clock time, `HH:MM`, inclusive. Defaults to `00:00`. */
  from?: string
  /** Latest visible clock time, `HH:MM`, inclusive. Defaults to `23:59`. */
  to?: string
}

/** One archive, as configured. */
export interface ChatConfig {
  /** URL slug and `public/data/` folder name. Changing it breaks old links. */
  id: string
  /** What the switcher shows. */
  name: string
  /** Folder in the repo root that prep reads, holding `days/chat-*.json`. */
  archive: string
  /**
   * Timezone the archive was captured in, as `Date#getTimezoneOffset()` reports
   * it (minutes WEST of UTC, so UTC+2 is -120). Taken from the archive's
   * `_index.json → timezoneOffsetMinutes`. Day boundaries and displayed clock
   * times are both computed against this, so the chat reads identically no
   * matter where the viewer is.
   */
  tzOffsetMinutes: number
  /**
   * Days a public visitor may open. Order does not matter.
   *
   *   { date: '2026-06-29' }                             → the whole day
   *   { date: '2026-06-29', from: '18:00' }              → 18:00 → end of day
   *   { date: '2026-06-29', from: '18:00', to: '21:30' } → that evening only
   */
  publish: readonly AllowedDate[]
}

/**
 * The archives, in switcher order. The first is where `/` lands.
 *
 * `archive` names a folder in the repo root. Note the deliberate `chat2-`
 * prefix on the second one: prep used to auto-discover the newest `chat-archive-*`
 * directory, and a second folder matching that glob would have silently taken
 * over the whole app. Archives are named explicitly here now, so that hazard is
 * gone — but the folder on disk keeps its distinct name.
 */
export const CHATS: readonly ChatConfig[] = [
  {
    id: 'ferma-vip',
    name: 'Ferma VIP',
    archive: 'chat-archive-2026-07-24-22-48-50',
    tzOffsetMinutes: -120,
    publish: [
      { date: '2026-04-27' },
      { date: '2026-04-28' },
      { date: '2026-04-29' },
      { date: '2026-04-30' },
      { date: '2026-06-29' },
    ],
  },
  {
    id: 'bb-vip-al',
    name: 'BB VIP AL',
    archive: 'chat2-archive-bbvipalb-2026-07-26',
    tzOffsetMinutes: -120,
    /**
     * Fully public: every day this archive holds, whole-day, no clock windows.
     * Unlike Ferma VIP — where the public sees a handful of days and admin sees
     * the rest — there is nothing held back here, so the two roles differ only
     * in that admin also reaches the leaderboard.
     *
     * The list is written out rather than generated because it is the one place
     * that decides what strangers can read: a rule like "publish everything"
     * would silently widen the moment a new day landed in the archive. Adding a
     * day here is a deliberate act.
     *
     * 2026-04-23 and 2026-04-24 are absent on purpose — the archive holds no
     * messages for them at all (see scripts/idb-extract/README.md). Listing
     * them would only make prep warn about days that do not exist.
     */
    publish: [
      { date: '2026-04-10' },
      { date: '2026-04-11' },
      { date: '2026-04-12' },
      { date: '2026-04-13' },
      { date: '2026-04-14' },
      { date: '2026-04-15' },
      { date: '2026-04-16' },
      { date: '2026-04-17' },
      { date: '2026-04-18' },
      { date: '2026-04-19' },
      { date: '2026-04-20' },
      { date: '2026-04-21' },
      { date: '2026-04-22' },
      { date: '2026-04-25' },
      { date: '2026-04-26' },
    ],
  },
]

// ── clock helpers ───────────────────────────────────────────────────────────

/** First and last minute-of-day, inclusive — the window an admin always gets. */
export const DAY_START_MIN = 0
export const DAY_END_MIN = 23 * 60 + 59

/** `'HH:MM'` → minutes since local midnight. */
export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`Invalid time in publish list: ${JSON.stringify(hhmm)}`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`Time out of range in publish list: ${hhmm}`)
  return h * 60 + min
}

/** Minutes since local midnight → `'HH:MM'`. */
export function formatClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** A resolved visibility window: minute-of-day bounds, both inclusive. */
export interface Window {
  fromMin: number
  toMin: number
}

/** The whole day — what admins get, and the default for a bare allowed date. */
export const FULL_DAY: Window = { fromMin: DAY_START_MIN, toMin: DAY_END_MIN }

export function isFullDay(w: Window): boolean {
  return w.fromMin <= DAY_START_MIN && w.toMin >= DAY_END_MIN
}

// ── the config, validated once at module load ───────────────────────────────

/** A chat with its publish list resolved to minute bounds and keyed by date. */
export interface Chat extends ChatConfig {
  windows: ReadonlyMap<string, Window>
  /** Public dates, ascending — the order the calendar and prep both want. */
  publicDates: readonly string[]
}

/**
 * `CHATS` resolved. Built eagerly so a typo in the config fails on the very
 * first import rather than the first time someone opens that day.
 */
export const RESOLVED_CHATS: readonly Chat[] = (() => {
  const seenIds = new Set<string>()

  return CHATS.map((chat) => {
    if (!/^[a-z0-9-]+$/.test(chat.id)) {
      throw new Error(
        `Invalid chat id ${JSON.stringify(chat.id)} — it is a URL segment and a folder name, so keep it to [a-z0-9-].`,
      )
    }
    if (seenIds.has(chat.id)) {
      throw new Error(`Duplicate chat id: ${chat.id}. Ids key the data folders, so they must differ.`)
    }
    seenIds.add(chat.id)

    const windows = new Map<string, Window>()

    for (const entry of chat.publish) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        throw new Error(
          `Invalid date in ${chat.id}.publish: ${JSON.stringify(entry.date)} (want YYYY-MM-DD)`,
        )
      }
      if (windows.has(entry.date)) {
        throw new Error(
          `Duplicate date in ${chat.id}.publish: ${entry.date}. Give it one entry with the widest window instead.`,
        )
      }

      const fromMin = entry.from === undefined ? DAY_START_MIN : parseClock(entry.from)
      const toMin = entry.to === undefined ? DAY_END_MIN : parseClock(entry.to)

      if (fromMin > toMin) {
        throw new Error(
          `${chat.id}.publish ${entry.date}: from (${entry.from}) is after to (${entry.to}).`,
        )
      }

      windows.set(entry.date, { fromMin, toMin })
    }

    return { ...chat, windows, publicDates: [...windows.keys()].sort() }
  })
})()

/** Where `/` lands, and the chat legacy `/d/$date` links are assumed to mean. */
export const DEFAULT_CHAT: Chat = RESOLVED_CHATS[0]

/** The chat with this id, or `null`. Used to validate the `$chatId` param. */
export function findChat(id: string | undefined): Chat | null {
  return RESOLVED_CHATS.find((c) => c.id === id) ?? null
}

/**
 * Chats this viewer may open at all.
 *
 * A public visitor is not shown a chat with nothing published in it: an empty
 * archive in the switcher is a dead end, and it advertises the existence of
 * material they cannot read.
 */
export function visibleChats(isAdmin: boolean): readonly Chat[] {
  return isAdmin ? RESOLVED_CHATS : RESOLVED_CHATS.filter((c) => c.windows.size > 0)
}

// ── the questions the rest of the app actually asks ─────────────────────────

/**
 * What this viewer may see of `date` in `chat`, or `null` when the day is
 * off-limits.
 *
 * The single place a role turns into a concrete window — every date check in
 * the app routes through here, so there is no second, subtly different rule.
 */
export function visibleWindow(chat: Chat, date: string, isAdmin: boolean): Window | null {
  if (isAdmin) return FULL_DAY
  return chat.windows.get(date) ?? null
}

/** Can this viewer open `date` in `chat` at all? */
export function isVisibleDate(chat: Chat, date: string, isAdmin: boolean): boolean {
  return visibleWindow(chat, date, isAdmin) !== null
}

/** Is `minuteOfDay` inside the window? */
export function isVisibleMinute(min: number, w: Window): boolean {
  return min >= w.fromMin && min <= w.toMin
}

/**
 * Epoch ms → the `YYYY-MM-DD` this instant belongs to *in the chat's
 * timezone* — the same bucketing prep used to name the day files, so a
 * timestamp always maps back to a date the calendar actually has.
 */
export function toArchiveDate(chat: Chat, ms: number): string {
  const d = new Date(ms - chat.tzOffsetMinutes * 60_000)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}
