/**
 * Extracts the chat archive out of a raw Chrome/Brave IndexedDB leveldb
 * directory and writes it in the same shape the watch-chat extension exports:
 *
 *   <out>/_index.json                    totals + per-day counts
 *   <out>/days/chat-YYYY-MM-DD.json      one array of message rows per day
 *
 * Usage: node export.mjs <leveldb-dir> <out-dir>
 */
import fs from 'node:fs'
import path from 'node:path'
import { readTable, readVarint } from './sst.mjs'
import { decodeIdbValue } from './v8.mjs'

const [, , DB_DIR, OUT_DIR] = process.argv
if (!DB_DIR || !OUT_DIR) {
  console.error('usage: node export.mjs <leveldb-dir> <out-dir>')
  process.exit(1)
}

/** Matches the existing archive: days are bucketed in UTC+2. */
const TZ_OFFSET_MINUTES = -120
const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60_000
const ORIGIN = 'https://bbvipalb.site'

// ── key decoding ────────────────────────────────────────────────────────────

/** Chrome KeyPrefix: byte 0 packs the widths of the three ids that follow. */
function decodePrefix(key) {
  const b = key[0]
  const widths = [((b >> 5) & 7) + 1, ((b >> 2) & 7) + 1, (b & 3) + 1]
  let off = 1
  const ids = widths.map((n) => {
    let v = 0
    for (let i = 0; i < n; i++) v += key[off + i] * 2 ** (8 * i)
    off += n
    return v
  })
  return { databaseId: ids[0], objectStoreId: ids[1], indexId: ids[2], rest: off }
}

/**
 * Chrome's `EncodeInt`: little-endian bytes with the leading zeroes dropped.
 * Not a varint — byte 0xDF is the value 223, not a continuation byte.
 */
const decodeInt = (b) => {
  let v = 0
  for (let i = 0; i < b.length; i++) v += b[i] * 2 ** (8 * i)
  return v
}

const utf16be = (b) => {
  const c = Buffer.from(b.subarray(0, b.length & ~1))
  c.swap16()
  return c.toString('utf16le')
}

function readStringWithLength(buf, off) {
  let len
  ;[len, off] = readVarint(buf, off)
  return [utf16be(buf.subarray(off, off + len * 2)), off + len * 2]
}

// ── pass 1: find the store that holds the chat rows ─────────────────────────

const files = fs
  .readdirSync(DB_DIR)
  .filter((f) => f.endsWith('.ldb'))
  .sort()

/** `${dbId}/${osId}` → object store name. */
const storeNames = new Map()
/** databaseId → database name, when its DatabaseNameKey row survived. */
const dbNames = new Map()

for (const f of files) {
  for (const { key, value, type } of readTable(path.join(DB_DIR, f))) {
    if (key.length < 2) continue
    const p = decodePrefix(key)
    if (p.indexId !== 0 || p.objectStoreId !== 0) continue
    const t = key[p.rest]
    if (p.databaseId === 0) {
      if (t === 201) {
        let off = p.rest + 1
        let origin, name
        ;[origin, off] = readStringWithLength(key, off)
        ;[name, off] = readStringWithLength(key, off)
        dbNames.set(decodeInt(value), name)
      }
    } else if (t === 50 && type === 1) {
      let off = p.rest + 1
      let osId
      ;[osId, off] = readVarint(key, off)
      if (key[off] === 0) storeNames.set(`${p.databaseId}/${osId}`, utf16be(value))
    }
  }
}

const targets = [...storeNames]
  .filter(([, name]) => name === 'chat_results')
  .map(([k]) => k.split('/').map(Number))

if (!targets.length) throw new Error('no `chat_results` object store found in this database')

console.log(`stores: ${targets.map(([d, o]) => `db${d}/store${o} (${dbNames.get(d) ?? 'unnamed'})`).join(', ')}`)

// ── pass 2: read every row of those stores ──────────────────────────────────

/**
 * fingerprint → { row, seq }.
 *
 * The same key can appear in several SST files (older levels keep superseded
 * versions), so the leveldb sequence number decides which write wins. A
 * tombstone with a higher sequence removes the key outright.
 */
const byKey = new Map()
let raw = 0
let failed = 0
let tombstones = 0
const errors = new Map()

for (const f of files) {
  for (const { key, value, seq, type } of readTable(path.join(DB_DIR, f))) {
    if (key.length < 2) continue
    const p = decodePrefix(key)
    if (p.indexId !== 1) continue
    if (!targets.some(([d, o]) => d === p.databaseId && o === p.objectStoreId)) continue

    raw++
    const idKey = key.subarray(p.rest).toString('hex')
    const prev = byKey.get(idKey)
    if (prev && prev.seq > seq) continue

    if (type !== 1) {
      tombstones++
      byKey.set(idKey, { seq, row: null, db: p.databaseId })
      continue
    }
    try {
      const { value: row } = decodeIdbValue(value)
      byKey.set(idKey, { seq, row, db: p.databaseId })
    } catch (err) {
      failed++
      errors.set(err.message, (errors.get(err.message) ?? 0) + 1)
    }
  }
}

console.log(`raw rows: ${raw}   unique keys: ${byKey.size}   tombstones: ${tombstones}   undecodable: ${failed}`)
for (const [msg, n] of errors) console.log(`  ! ${msg} × ${n}`)

// ── shape rows the way the archive does ─────────────────────────────────────

/** Epoch ms → `YYYY-MM-DD` in the archive's timezone. */
function localDate(ms) {
  return new Date(ms - TZ_OFFSET_MS).toISOString().slice(0, 10)
}

const days = new Map()
const undated = []
let backfilled = 0
let kept = 0
const types = new Map()

for (const { row, db } of byKey.values()) {
  if (!row || typeof row !== 'object') continue

  let ms = row.savedAtMs
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    // Roughly 1 row in 10k stores only the ISO string; the app needs the ms.
    const parsed = Date.parse(row.savedAt ?? '')
    if (Number.isFinite(parsed)) {
      ms = parsed
      backfilled++
    } else {
      undated.push({ ...row, _sources: [`${ORIGIN}|${dbNames.get(db) ?? `db${db}`}`] })
      continue
    }
  }

  // Alphabetical keys, `_sources` last — byte-for-byte the extension's layout.
  const out = {}
  for (const k of Object.keys(row).sort()) {
    if (k === 'savedAtMs') continue
    out[k] = row[k]
  }
  out.savedAtMs = ms
  const ordered = {}
  for (const k of Object.keys(out).sort()) ordered[k] = out[k]
  ordered._sources = [`${ORIGIN}|${dbNames.get(db) ?? `db${db}`}`]

  types.set(row.type, (types.get(row.type) ?? 0) + 1)
  const date = localDate(ms)
  if (!days.has(date)) days.set(date, [])
  days.get(date).push(ordered)
  kept++
}

// ── write ───────────────────────────────────────────────────────────────────

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT_DIR, 'days'), { recursive: true })

const dates = [...days.keys()].sort()
const dayIndex = []

for (const date of dates) {
  const rows = days.get(date)
  rows.sort((a, b) => a.savedAtMs - b.savedAtMs || (a.saveOrder ?? 0) - (b.saveOrder ?? 0))
  fs.writeFileSync(
    path.join(OUT_DIR, 'days', `chat-${date}.json`),
    JSON.stringify(rows, null, 2),
  )
  dayIndex.push({ date, entries: rows.length })
}

// Calendar gaps are worth naming: a missing day inside the span is real data
// loss, not an empty file.
const spanDays = []
if (dates.length) {
  for (let t = Date.parse(dates[0]); t <= Date.parse(dates[dates.length - 1]); t += 86_400_000) {
    spanDays.push(new Date(t).toISOString().slice(0, 10))
  }
}
const missing = spanDays.filter((d) => !days.has(d))

if (undated.length) {
  fs.writeFileSync(path.join(OUT_DIR, '_undated.json'), JSON.stringify(undated, null, 2))
}

const index = {
  generatedAt: new Date().toISOString(),
  timezoneOffsetMinutes: TZ_OFFSET_MINUTES,
  origins: [ORIGIN],
  databases: targets.map(([d, o]) => ({
    origin: ORIGIN,
    database: dbNames.get(d) ?? `db${d} (name row not in backup)`,
    store: storeNames.get(`${d}/${o}`),
    entries: raw,
  })),
  totalEntriesRaw: raw,
  totalEntriesDeduped: kept,
  daysWithData: dates.length,
  daysWithoutData: missing.length,
  days: dayIndex,
}
fs.writeFileSync(path.join(OUT_DIR, '_index.json'), JSON.stringify(index, null, 2))

console.log()
console.log(`messages   ${kept.toLocaleString('en-US')}`)
console.log(`types      ${[...types].map(([t, n]) => `${t}=${n}`).join('  ')}`)
console.log(`days       ${dates.length} with data` + (missing.length ? `  ·  ${missing.length} gap(s): ${missing.join(', ')}` : ''))
console.log(`span       ${dates[0]} → ${dates[dates.length - 1]}`)
if (backfilled) console.log(`backfilled ${backfilled} savedAtMs from savedAt`)
if (undated.length) console.log(`undated    ${undated.length} row(s) → _undated.json`)
