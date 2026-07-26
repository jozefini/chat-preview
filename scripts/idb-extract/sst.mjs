/**
 * Minimal LevelDB .ldb (SST, format v2) reader.
 *
 * Chrome's IndexedDB uses a custom key comparator ("idb_cmp1"), which makes
 * every off-the-shelf LevelDB binding refuse to open the directory. We only
 * ever want to READ every row once, and iteration order does not matter for
 * that, so we skip the comparator entirely and walk the SST files ourselves.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { uncompress as snappyUncompress } from 'snappyjs'

const FOOTER_LEN = 48
const MAGIC = 0xdb4775248b80fb57n

export function readVarint(buf, off) {
  let result = 0
  let shift = 0
  while (true) {
    const b = buf[off++]
    result |= (b & 0x7f) * 2 ** shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return [result, off]
}

function readBlockHandle(buf, off) {
  let offset, size
  ;[offset, off] = readVarint(buf, off)
  ;[size, off] = readVarint(buf, off)
  return [{ offset, size }, off]
}

function decompressBlock(buf, handle) {
  const raw = buf.subarray(handle.offset, handle.offset + handle.size)
  const type = buf[handle.offset + handle.size] // trailer: 1 byte type + 4 byte crc
  switch (type) {
    case 0:
      return raw
    case 1:
      return Buffer.from(snappyUncompress(raw))
    case 2:
      return zlib.inflateSync(raw)
    case 3:
      return Buffer.from(zlib.brotliDecompressSync(raw))
    case 4:
      return zlib.zstdDecompressSync ? zlib.zstdDecompressSync(raw) : (() => { throw new Error('zstd unsupported') })()
    default:
      throw new Error(`unknown block compression type ${type}`)
  }
}

/** Yields [key, value] for every entry in one block. Keys stay prefix-decoded. */
function* blockEntries(block) {
  const numRestarts = block.readUInt32LE(block.length - 4)
  const restartsOffset = block.length - 4 - numRestarts * 4
  let off = 0
  let lastKey = Buffer.alloc(0)

  while (off < restartsOffset) {
    let shared, nonShared, valueLen
    ;[shared, off] = readVarint(block, off)
    ;[nonShared, off] = readVarint(block, off)
    ;[valueLen, off] = readVarint(block, off)
    if (shared === 0 && nonShared === 0 && valueLen === 0) break

    const key = Buffer.concat([lastKey.subarray(0, shared), block.subarray(off, off + nonShared)])
    off += nonShared
    const value = block.subarray(off, off + valueLen)
    off += valueLen
    lastKey = key
    yield [key, value]
  }
}

/**
 * Every record in one .ldb file.
 *
 * Keys come back as *internal* keys (user key + 8-byte sequence/type trailer);
 * `type` 1 is a put and 0 is a deletion tombstone. Sequence numbers are what
 * lets a caller pick the newest value when the same user key appears in
 * several files.
 */
export function* readTable(file) {
  const buf = fs.readFileSync(file)
  const footer = buf.subarray(buf.length - FOOTER_LEN)
  if (footer.readBigUInt64LE(FOOTER_LEN - 8) !== MAGIC) {
    throw new Error(`${file}: bad SST magic`)
  }
  let off = 0
  let metaindexHandle, indexHandle
  ;[metaindexHandle, off] = readBlockHandle(footer, off)
  ;[indexHandle, off] = readBlockHandle(footer, off)

  const index = decompressBlock(buf, indexHandle)
  for (const [, handleBytes] of blockEntries(index)) {
    const [handle] = readBlockHandle(handleBytes, 0)
    let block
    try {
      block = decompressBlock(buf, handle)
    } catch (err) {
      // A single unreadable block should not cost us the other 30 MB.
      console.error(`  ! ${file}@${handle.offset}: ${err.message}`)
      continue
    }
    for (const [internalKey, value] of blockEntries(block)) {
      if (internalKey.length < 8) continue
      const n = internalKey.length - 8
      const trailer = internalKey.readBigUInt64LE(n)
      yield {
        key: internalKey.subarray(0, n),
        value,
        seq: Number(trailer >> 8n),
        type: Number(trailer & 0xffn),
      }
    }
  }
}
