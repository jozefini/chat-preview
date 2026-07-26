#!/usr/bin/env node
/**
 * Turns the raw chat archives into what the app actually ships.
 *
 *   chat-archive-<stamp>/days/chat-2026-05-10.json     (4.4 MB, verbose)
 *        ↓  drop unused fields, dedupe authors, delta-encode timestamps
 *   public/data/ferma-vip/days/2026-05-10.json         (~1 MB, ~200 KB gzipped)
 *
 * Runs once per chat in `CHATS` (src/config.ts), each into its own folder under
 * public/data/ named by chat id — the chats share nothing but the emote images,
 * so the app can switch between them by swapping one path segment.
 *
 * EVERY day is emitted, in full — an admin has to be able to read the whole
 * archive, and there is nowhere else for that data to come from. What a public
 * visitor may see is decided at RUNTIME from each chat's `publish` list. The
 * consequence is worth saying out loud: `public/data/` is served without
 * authentication, so the day files are readable by anyone who guesses a URL.
 * The password gate limits the app, not the server.
 *
 * Per chat it writes:
 *
 *   <id>/index.json   everything the calendar needs, so it can render without
 *                     touching a single day file. Each day carries a `pub`
 *                     block — the counts as a PUBLIC visitor sees them, after
 *                     that day's clock window is applied — so the calendar can
 *                     size and label its cells per role without downloading
 *                     anything.
 *   <id>/days/*.json  one file per day, the whole day.
 *   <id>/stats.json   the ALL-TIME leaderboard, one row per person across every
 *                     day in that archive. It has to be built here because this
 *                     is the only place the whole archive is ever walked — the
 *                     app would otherwise have to download all ~100 day files to
 *                     answer "who talked the most". The admin-only /stats page
 *                     reads it. Same caveat as the day files: served without
 *                     authentication, so treat the URL as public even though the
 *                     page isn't.
 *
 * And one shared `public/data/chats.json`, so a deploy can be inspected without
 * reading the bundle to find out which archives it carries.
 *
 * Run: npm run prep
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESOLVED_CHATS, formatClock } from '../src/config.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WATCH_CHAT = path.resolve(ROOT, '..', 'watch-chat')
const OUT_DIR = path.join(ROOT, 'public', 'data')
const OUT_EMOJIS = path.join(ROOT, 'public', 'emojis')

const MS_PER_DAY = 86_400_000

// ── helpers ─────────────────────────────────────────────────────────────────

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * Epoch ms → minutes since midnight *in the chat's timezone*.
 * `tzOffsetMs` is minutes west of UTC (UTC+2 → -120), so local time is
 * `utc - offset`, matching how the archive bucketed its day files.
 */
function minuteOfDay(ms, tzOffsetMs) {
  const local = ms - tzOffsetMs
  return Math.floor(((local % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY / 60_000)
}

/** Local midnight of a `YYYY-MM-DD`, as epoch ms. */
function dayStartMs(date, tzOffsetMs) {
  return Date.parse(`${date}T00:00:00Z`) + tzOffsetMs
}

/**
 * A chat's archive directory, verified.
 *
 * Named explicitly in the config rather than auto-discovered: prep used to take
 * the newest `chat-archive-*` folder, which meant dropping a second archive
 * into the repo silently repointed the entire app at it.
 */
async function archiveDirFor(chat) {
  const dir = path.join(ROOT, chat.archive)
  if (!(await exists(path.join(dir, 'days')))) {
    const siblings = (await fs.readdir(ROOT, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /archive/.test(e.name))
      .map((e) => e.name)
    throw new Error(
      `Chat "${chat.id}" points at ${chat.archive}/, which has no days/ folder.\n` +
        `  Archive folders present: ${siblings.length ? siblings.join(', ') : '(none)'}\n` +
        `  Fix the \`archive\` field in src/config.ts.`,
    )
  }
  return dir
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Rolls per-entry author counts up into the shape the calendar renders.
 *
 * Authors are interned per (name, colour) so each message keeps the exact
 * colour it was sent with. People change colour over time, so the dictionary
 * holds several entries per person — collapse by name before counting heads or
 * picking the busiest three, or one person is reported as a crowd.
 *
 * Called twice per day, over the same dictionary: once with the full counts,
 * once with only the messages inside the public window.
 */
function summarize(authors, counts, count, replies, firstMs, lastMs) {
  if (!count) {
    return { count: 0, replies: 0, authors: 0, firstMs: null, lastMs: null, topAuthors: [] }
  }

  const byName = new Map()
  for (let i = 0; i < authors.length; i++) {
    const n = counts[i] ?? 0
    if (!n) continue
    const name = authors[i][0]
    byName.set(name, (byName.get(name) ?? 0) + n)
  }

  return {
    count,
    replies,
    authors: byName.size,
    firstMs,
    lastMs,
    topAuthors: [...byName.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([name]) => name),
  }
}

// ── all-time leaderboard ────────────────────────────────────────────────────

/**
 * Per-person tallies for ONE day, keyed by display name.
 *
 * Keyed by name and not by the (name, colour) entry the day file interns:
 * people change colour, so one person owns several dictionary entries and
 * counting entries would rank the same person several times, each with a slice
 * of their real total.
 */
function newPerson() {
  return {
    count: 0,
    /** Messages they sent that were replies to someone. */
    replies: 0,
    /** Messages someone else sent as a reply to them. */
    received: 0,
    firstMs: Infinity,
    lastMs: -Infinity,
    /** colour → messages sent in it, so the leaderboard can show their usual one. */
    colors: new Map(),
  }
}

/**
 * Folds one day's per-person tallies into the running all-time map.
 *
 * `received` is tracked for people who never spoke that day (you can be replied
 * to on a day you said nothing), which is why every roll-up here is guarded on
 * `count > 0`: a day you were only mentioned is not a day you were active, and
 * it must not move your first-seen date or your busiest day.
 */
function foldDay(allTime, date, people) {
  for (const [name, p] of people) {
    if (!name) continue // Nameless rows are an archive artifact, not a person.

    let a = allTime.get(name)
    if (!a) {
      a = {
        name,
        messages: 0,
        replies: 0,
        received: 0,
        days: 0,
        firstMs: Infinity,
        lastMs: -Infinity,
        bestDate: null,
        bestCount: 0,
        colors: new Map(),
      }
      allTime.set(name, a)
    }

    a.messages += p.count
    a.replies += p.replies
    a.received += p.received
    if (!p.count) continue

    a.days++
    // `>` not `>=`: ties keep the earliest day, so the busiest-day column is
    // stable across re-runs instead of drifting to whichever day sorted last.
    if (p.count > a.bestCount) {
      a.bestCount = p.count
      a.bestDate = date
    }
    if (p.firstMs < a.firstMs) a.firstMs = p.firstMs
    if (p.lastMs > a.lastMs) a.lastMs = p.lastMs
    for (const [color, n] of p.colors) a.colors.set(color, (a.colors.get(color) ?? 0) + n)
  }
}

/** All-time map → the ranked rows the page renders, busiest first. */
function rankAuthors(allTime) {
  return [...allTime.values()]
    .filter((a) => a.messages > 0)
    .sort((x, y) => y.messages - x.messages || x.name.localeCompare(y.name))
    .map((a) => {
      let color = ''
      let best = 0
      for (const [c, n] of a.colors) {
        if (c && n > best) {
          best = n
          color = c
        }
      }
      return {
        name: a.name,
        color,
        messages: a.messages,
        replies: a.replies,
        received: a.received,
        days: a.days,
        firstMs: a.firstMs === Infinity ? null : a.firstMs,
        lastMs: a.lastMs === -Infinity ? null : a.lastMs,
        bestDate: a.bestDate,
        bestCount: a.bestCount,
      }
    })
}

// ── emotes ──────────────────────────────────────────────────────────────────

/**
 * Parses `watch-chat/emoji-map.js` (a plain `window.EMOJI_TO_SRC = {...}`
 * assignment) into a token → filename map, copies every referenced image into
 * public/emojis, and reports tokens whose file is missing.
 */
async function prepEmotes() {
  const srcMapFile = path.join(WATCH_CHAT, 'emoji-map.js')
  if (!(await exists(srcMapFile))) {
    console.log(c.yellow(`  ! ${srcMapFile} not found — skipping emotes.`))
    return { map: {}, missing: [] }
  }

  const raw = await fs.readFile(srcMapFile, 'utf8')
  const pairs = [...raw.matchAll(/"(\[[^\]]+\])"\s*:\s*"\.\/emojis\/([^"]+)"/g)]

  await fs.mkdir(OUT_EMOJIS, { recursive: true })

  const map = {}
  const missing = []
  let copied = 0

  for (const [, token, file] of pairs) {
    const from = path.join(WATCH_CHAT, 'emojis', file)
    if (!(await exists(from))) {
      // The extension ships 4 of these; they render as broken images there.
      // We leave them out of the map so the app falls back to literal text.
      missing.push({ token, file })
      continue
    }
    await fs.copyFile(from, path.join(OUT_EMOJIS, file))
    map[token] = file
    copied++
  }

  console.log(
    `  emotes  ${c.bold(String(copied))} copied` +
      (missing.length ? c.yellow(`  ·  ${missing.length} broken (skipped)`) : ''),
  )
  for (const { token, file } of missing) {
    console.log(c.dim(`            ${token} → emojis/${file} does not exist`))
  }

  return { map, missing }
}

// ── one chat ────────────────────────────────────────────────────────────────

/**
 * Reads one chat's archive and writes its `public/data/<id>/` folder.
 *
 * Returns the row `chats.json` carries for it — everything a caller needs to
 * summarise the chat without reopening its index.
 */
async function prepChat(chat, emoteMap) {
  const archiveDir = await archiveDirFor(chat)
  const tzOffsetMs = chat.tzOffsetMinutes * 60_000
  const outDir = path.join(OUT_DIR, chat.id)
  const outDays = path.join(outDir, 'days')

  console.log(c.bold(`  ${chat.name}`) + c.dim(`  ·  /c/${chat.id}`))
  console.log(`    archive ${c.cyan(chat.archive)}`)
  console.log(
    `    tz      UTC${chat.tzOffsetMinutes <= 0 ? '+' : '-'}${Math.abs(chat.tzOffsetMinutes) / 60}` +
      c.dim('  ·  every day is emitted; admin sees all of it'),
  )
  if (chat.windows.size === 0) {
    console.log(
      c.yellow('    public  nothing published') +
        c.dim('  ·  admin-only; hidden from the switcher for public visitors'),
    )
  } else {
    console.log(`    public  ${c.bold(String(chat.windows.size))} allowed date(s)`)
    for (const [date, w] of chat.windows) {
      const span =
        w.fromMin === 0 && w.toMin === 1439
          ? c.dim('whole day')
          : c.yellow(`${formatClock(w.fromMin)}–${formatClock(w.toMin)}`)
      console.log(c.dim(`              ${date}  `) + span)
    }
  }

  await fs.mkdir(outDays, { recursive: true })

  const daysDir = path.join(archiveDir, 'days')
  const allFiles = (await fs.readdir(daysDir))
    .filter((f) => /^chat-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()

  console.log(`    days    ${c.bold(String(allFiles.length))} in archive`)

  const index = []
  let rawBytes = 0
  let outBytes = 0
  let totalKept = 0
  let totalDropped = 0
  let totalPublic = 0
  let totalReplies = 0

  /** name → all-time tallies, grown one day at a time. See `foldDay`. */
  const allTime = new Map()

  for (const file of allFiles) {
    const date = file.slice(5, 15)
    const srcPath = path.join(daysDir, file)

    const buf = await fs.readFile(srcPath)
    rawBytes += buf.byteLength
    /** @type {Array<Record<string, any>>} */
    const rows = JSON.parse(buf.toString('utf8'))

    const dayStart = dayStartMs(date, tzOffsetMs)
    /** This day's public clock window, or `undefined` when it isn't published. */
    const pubWin = chat.windows.get(date)

    // Author dictionary, shared by message authors and reply targets.
    /** @type {Map<string, number>} */
    const authorIdx = new Map()
    /** @type {Array<[string, string]>} */
    const authors = []
    /** @type {number[]} */
    const authorCounts = []

    const intern = (name, color) => {
      const key = `${name} ${color ?? ''}`
      let idx = authorIdx.get(key)
      if (idx === undefined) {
        idx = authors.length
        authorIdx.set(key, idx)
        authors.push([name ?? '', color ?? ''])
        authorCounts.push(0)
      }
      return idx
    }

    const messages = []
    let kept = 0
    let dropped = 0
    let replies = 0
    let firstMs = Infinity
    let lastMs = -Infinity

    // This day's leaderboard contribution, by person rather than by author
    // entry. Folded into `allTime` once the day is walked.
    /** @type {Map<string, ReturnType<typeof newPerson>>} */
    const people = new Map()
    const person = (name) => {
      let p = people.get(name)
      if (!p) {
        p = newPerson()
        people.set(name, p)
      }
      return p
    }

    // The same tallies again, but counting only what a public visitor would
    // see. Kept in lockstep with the full ones rather than recomputed later,
    // so the day is walked exactly once.
    /** @type {number[]} */
    const pubAuthorCounts = []
    let pubKept = 0
    let pubReplies = 0
    let pubFirstMs = Infinity
    let pubLastMs = -Infinity

    for (const row of rows) {
      const ms = row.savedAtMs
      if (typeof ms !== 'number' || !Number.isFinite(ms)) {
        dropped++
        continue
      }

      const min = minuteOfDay(ms, tzOffsetMs)
      // Nothing is dropped for being out of window any more: the day file has
      // to hold the whole day for admins. `min` now only decides whether this
      // message also counts toward the public totals below.
      const isPublic = !!pubWin && min >= pubWin.fromMin && min <= pubWin.toMin

      const ai = intern(row.author, row.authorColor)
      authorCounts[ai]++

      // All-time tallies count the WHOLE archive: the leaderboard lives behind
      // the admin password, so no public window applies to it.
      const me = person(String(row.author ?? ''))
      me.count++
      if (ms < me.firstMs) me.firstMs = ms
      if (ms > me.lastMs) me.lastMs = ms
      const color = String(row.authorColor ?? '')
      if (color) me.colors.set(color, (me.colors.get(color) ?? 0) + 1)

      if (isPublic) {
        pubAuthorCounts[ai] = (pubAuthorCounts[ai] ?? 0) + 1
        pubKept++
        if (ms < pubFirstMs) pubFirstMs = ms
        if (ms > pubLastMs) pubLastMs = ms
      }

      if (ms < firstMs) firstMs = ms
      if (ms > lastMs) lastMs = ms

      // Delta from local midnight keeps these as small ints instead of
      // 13-digit epochs — a meaningful chunk of the file size.
      const delta = ms - dayStart
      const text = String(row.message ?? '')

      const reply = row.reply
      if (reply && (reply.to || reply.preview)) {
        const ri = intern(reply.to, reply.toColor)
        messages.push([delta, ai, text, ri, String(reply.targetWrote ?? reply.preview ?? '')])
        replies++
        me.replies++
        // Credited to the person replied TO, who may not have spoken today.
        if (reply.to) person(String(reply.to)).received++
        if (isPublic) pubReplies++
      } else {
        messages.push([delta, ai, text])
      }
      kept++
    }

    // Oldest first, matching the extension's log order.
    messages.sort((a, b) => a[0] - b[0])

    const payload = { d: date, s: dayStart, a: authors, m: messages }
    const json = JSON.stringify(payload)
    await fs.writeFile(path.join(outDays, `${date}.json`), json)
    outBytes += Buffer.byteLength(json)

    totalKept += kept
    totalDropped += dropped
    totalPublic += pubKept
    totalReplies += replies
    foldDay(allTime, date, people)

    index.push({
      ...summarize(authors, authorCounts, kept, replies, firstMs, lastMs),
      date,
      // `null` when this date is not in the chat's publish list — the app reads
      // that as "does not exist for the public", not "exists but is empty".
      pub: pubWin
        ? summarize(authors, pubAuthorCounts, pubKept, pubReplies, pubFirstMs, pubLastMs)
        : null,
    })
  }

  const daysWithData = index.filter((d) => d.count > 0).length
  const publicDaysWithData = index.filter((d) => d.pub && d.pub.count > 0).length

  // An allowed date that never matched a file is almost always a typo, and it
  // fails silently otherwise — the day simply never shows up in the calendar.
  const emitted = new Set(index.map((d) => d.date))
  for (const date of chat.windows.keys()) {
    if (!emitted.has(date)) {
      console.log(
        c.yellow(`    ! ${chat.id}.publish has ${date}, but this archive has no such day.`),
      )
    }
  }

  const generatedAt = new Date().toISOString()

  const indexPayload = {
    generatedAt,
    chat: { id: chat.id, name: chat.name },
    archive: chat.archive,
    config: {
      tzOffsetMinutes: chat.tzOffsetMinutes,
      allowedDates: [...chat.windows].map(([date, w]) => ({
        date,
        from: formatClock(w.fromMin),
        to: formatClock(w.toMin),
      })),
    },
    totals: {
      days: index.length,
      daysWithData,
      messages: totalKept,
      publicDaysWithData,
      publicMessages: totalPublic,
      droppedInvalid: totalDropped,
    },
    emotes: emoteMap,
    days: index,
  }

  const indexJson = JSON.stringify(indexPayload)
  await fs.writeFile(path.join(outDir, 'index.json'), indexJson)
  outBytes += Buffer.byteLength(indexJson)

  // ── all-time leaderboard ──────────────────────────────────────────────────
  const ranked = rankAuthors(allTime)
  const active = index.filter((d) => d.count > 0).map((d) => d.date)

  const statsPayload = {
    generatedAt,
    chat: { id: chat.id, name: chat.name },
    archive: chat.archive,
    span: {
      from: active[0] ?? null,
      to: active[active.length - 1] ?? null,
      days: daysWithData,
    },
    totals: {
      messages: totalKept,
      replies: totalReplies,
      authors: ranked.length,
    },
    authors: ranked,
  }

  const statsJson = JSON.stringify(statsPayload)
  await fs.writeFile(path.join(outDir, 'stats.json'), statsJson)
  outBytes += Buffer.byteLength(statsJson)

  console.log(`    messages ${c.bold(totalKept.toLocaleString('en-US'))} emitted`)
  if (totalDropped) {
    console.log(
      c.dim(`    dropped  ${totalDropped.toLocaleString('en-US')} with no usable timestamp`),
    )
  }
  console.log(
    `    ${c.bold('public')}   ${publicDaysWithData} day(s) · ` +
      `${totalPublic.toLocaleString('en-US')} message(s) visible without the admin password`,
  )
  console.log(
    `    people   ${c.bold(ranked.length.toLocaleString('en-US'))} in the all-time leaderboard` +
      (ranked.length
        ? c.dim(`  ·  #1 ${ranked[0].name} (${ranked[0].messages.toLocaleString('en-US')})`)
        : ''),
  )
  console.log(
    `    size     ${mb(rawBytes)} → ${c.bold(mb(outBytes))}` +
      c.dim(`  (${(100 - (outBytes / rawBytes) * 100).toFixed(0)}% smaller)`),
  )
  console.log()

  return {
    row: {
      id: chat.id,
      name: chat.name,
      archive: chat.archive,
      tzOffsetMinutes: chat.tzOffsetMinutes,
      days: daysWithData,
      messages: totalKept,
      publicDays: publicDaysWithData,
      publicMessages: totalPublic,
      from: active[0] ?? null,
      to: active[active.length - 1] ?? null,
    },
    rawBytes,
    outBytes,
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now()

  console.log()
  console.log(c.bold('chat-preview · prep'))
  console.log(
    `  ${c.bold(String(RESOLVED_CHATS.length))} chat(s)  ` +
      c.dim(RESOLVED_CHATS.map((ch) => ch.name).join('  ·  ')),
  )
  console.log()

  // Fresh output dir so a narrowed window — or a chat removed from the config —
  // cannot leave stale days behind for someone who kept the URL.
  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUT_DIR, { recursive: true })

  const { map: emoteMap, missing: missingEmotes } = await prepEmotes()
  console.log()

  const rows = []
  let rawBytes = 0
  let outBytes = 0

  for (const chat of RESOLVED_CHATS) {
    const result = await prepChat(chat, emoteMap)
    rows.push(result.row)
    rawBytes += result.rawBytes
    outBytes += result.outBytes
  }

  // Not read by the app — the chat list lives in src/config.ts, which is the
  // one place it can be edited. This is for looking at a deploy and seeing what
  // it actually carries.
  const chatsJson = JSON.stringify(
    { generatedAt: new Date().toISOString(), chats: rows },
    null,
    2,
  )
  await fs.writeFile(path.join(OUT_DIR, 'chats.json'), chatsJson)
  outBytes += Buffer.byteLength(chatsJson)

  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  const totalMessages = rows.reduce((n, r) => n + r.messages, 0)
  const publicMessages = rows.reduce((n, r) => n + r.publicMessages, 0)

  console.log(c.green('  ✓ done'), c.dim(`in ${secs}s`))
  console.log(
    `    ${totalMessages.toLocaleString('en-US')} message(s) across ${rows.length} chat(s) · ` +
      `${publicMessages.toLocaleString('en-US')} visible without the admin password`,
  )
  console.log(
    `    size   ${mb(rawBytes)} → ${c.bold(mb(outBytes))}` +
      c.dim(`  (${(100 - (outBytes / rawBytes) * 100).toFixed(0)}% smaller)`),
  )
  if (missingEmotes.length) {
    console.log(c.dim(`    emotes ${missingEmotes.length} broken token(s) will render as text`))
  }
  console.log()
}

main().catch((err) => {
  console.error(c.red(`\n  ✗ prep failed: ${err.message}\n`))
  process.exitCode = 1
})
