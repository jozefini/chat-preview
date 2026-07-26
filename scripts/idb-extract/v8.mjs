/**
 * V8 structured-clone deserializer, enough of it to read the plain JSON-ish
 * objects Chrome stores in IndexedDB (objects, arrays, strings, numbers,
 * booleans, null/undefined, dates, maps/sets, back-references).
 *
 * An IndexedDB value on disk is:
 *   varint(record version) | Blink envelope (0xFF ver [+ trailer]) | V8 payload
 */

const TAG = {
  VERSION: 0xff,
  PADDING: 0x00,
  VERIFY_OBJECT_COUNT: 0x3f, // '?'
  THE_HOLE: 0x2d, // '-'
  UNDEFINED: 0x5f, // '_'
  NULL: 0x30, // '0'
  TRUE: 0x54, // 'T'
  FALSE: 0x46, // 'F'
  INT32: 0x49, // 'I'
  UINT32: 0x55, // 'U'
  DOUBLE: 0x4e, // 'N'
  BIGINT: 0x5a, // 'Z'
  UTF8_STRING: 0x53, // 'S'
  ONE_BYTE_STRING: 0x22, // '"'
  TWO_BYTE_STRING: 0x63, // 'c'
  OBJECT_REFERENCE: 0x5e, // '^'
  BEGIN_JS_OBJECT: 0x6f, // 'o'
  END_JS_OBJECT: 0x7b, // '{'
  BEGIN_SPARSE_ARRAY: 0x61, // 'a'
  END_SPARSE_ARRAY: 0x40, // '@'
  BEGIN_DENSE_ARRAY: 0x41, // 'A'
  END_DENSE_ARRAY: 0x24, // '$'
  DATE: 0x44, // 'D'
  TRUE_OBJECT: 0x79, // 'y'
  FALSE_OBJECT: 0x78, // 'x'
  NUMBER_OBJECT: 0x6e, // 'n'
  BIGINT_OBJECT: 0x7a, // 'z'
  STRING_OBJECT: 0x73, // 's'
  REGEXP: 0x52, // 'R'
  BEGIN_MAP: 0x3b, // ';'
  END_MAP: 0x3a, // ':'
  BEGIN_SET: 0x27, // '\''
  END_SET: 0x2c, // ','
  ARRAY_BUFFER: 0x42, // 'B'
  ARRAY_BUFFER_VIEW: 0x56, // 'V'
  RESIZABLE_ARRAY_BUFFER: 0x7e, // '~'
  ERROR: 0x72, // 'r'
  HOST_OBJECT: 0x5c, // '\\'
}

class Reader {
  constructor(buf) {
    this.buf = buf
    this.off = 0
    /** Back-reference table: every object gets the next id as it is created. */
    this.objects = []
    this.version = 15
  }

  byte() {
    if (this.off >= this.buf.length) throw new Error('eof')
    return this.buf[this.off++]
  }

  varint() {
    let result = 0
    let shift = 0
    while (true) {
      const b = this.byte()
      result += (b & 0x7f) * 2 ** shift
      if ((b & 0x80) === 0) return result
      shift += 7
      if (shift > 63) throw new Error('varint too long')
    }
  }

  /** Signed varint, zigzag-encoded (used by kInt32). */
  zigzag() {
    const n = this.varint()
    return n % 2 ? -(n + 1) / 2 : n / 2
  }

  double() {
    const v = this.buf.readDoubleLE(this.off)
    this.off += 8
    return v
  }

  bytes(n) {
    const b = this.buf.subarray(this.off, this.off + n)
    this.off += n
    return b
  }
}

function readString(r, tag) {
  if (tag === TAG.ONE_BYTE_STRING) {
    return r.bytes(r.varint()).toString('latin1')
  }
  if (tag === TAG.TWO_BYTE_STRING) {
    return r.bytes(r.varint()).toString('utf16le')
  }
  if (tag === TAG.UTF8_STRING) {
    return r.bytes(r.varint()).toString('utf8')
  }
  throw new Error(`not a string tag: 0x${tag.toString(16)}`)
}

function readValue(r) {
  let tag
  // Padding bytes may appear anywhere between values.
  do {
    tag = r.byte()
  } while (tag === TAG.PADDING)

  switch (tag) {
    case TAG.UNDEFINED:
      return undefined
    case TAG.NULL:
    case TAG.THE_HOLE:
      return null
    case TAG.TRUE:
      return true
    case TAG.FALSE:
      return false
    case TAG.INT32:
      return r.zigzag()
    case TAG.UINT32:
      return r.varint()
    case TAG.DOUBLE:
      return r.double()
    case TAG.UTF8_STRING:
    case TAG.ONE_BYTE_STRING:
    case TAG.TWO_BYTE_STRING:
      return readString(r, tag)
    case TAG.BIGINT: {
      const bitfield = r.varint()
      const len = bitfield >> 1
      const neg = !!(bitfield & 1)
      const bytes = r.bytes(len)
      let v = 0n
      for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i])
      return (neg ? -v : v).toString()
    }
    case TAG.DATE: {
      const ms = r.double()
      const d = { __date: ms }
      r.objects.push(d)
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null
    }
    case TAG.TRUE_OBJECT:
      r.objects.push(true)
      return true
    case TAG.FALSE_OBJECT:
      r.objects.push(false)
      return false
    case TAG.NUMBER_OBJECT: {
      const v = r.double()
      r.objects.push(v)
      return v
    }
    case TAG.BIGINT_OBJECT: {
      const v = readValue({ ...r, byte: () => TAG.BIGINT })
      return v
    }
    case TAG.STRING_OBJECT: {
      const s = readString(r, r.byte())
      r.objects.push(s)
      return s
    }
    case TAG.REGEXP: {
      const source = readString(r, r.byte())
      const flags = r.varint()
      const v = { __regexp: source, flags }
      r.objects.push(v)
      return v
    }
    case TAG.OBJECT_REFERENCE: {
      const id = r.varint()
      return r.objects[id]
    }
    case TAG.BEGIN_JS_OBJECT: {
      const obj = {}
      r.objects.push(obj)
      let n = 0
      while (true) {
        const peek = r.buf[r.off]
        if (peek === TAG.END_JS_OBJECT) {
          r.off++
          break
        }
        const key = readValue(r)
        const val = readValue(r)
        obj[String(key)] = val
        n++
      }
      r.varint() // declared property count, ignored
      return obj
    }
    case TAG.BEGIN_DENSE_ARRAY: {
      const len = r.varint()
      const arr = new Array(len)
      r.objects.push(arr)
      for (let i = 0; i < len; i++) arr[i] = readValue(r)
      // Trailing named properties, then END + counts.
      while (r.buf[r.off] !== TAG.END_DENSE_ARRAY) {
        const key = readValue(r)
        arr[String(key)] = readValue(r)
      }
      r.off++
      r.varint()
      r.varint()
      return arr
    }
    case TAG.BEGIN_SPARSE_ARRAY: {
      const len = r.varint()
      const arr = new Array(len)
      r.objects.push(arr)
      while (r.buf[r.off] !== TAG.END_SPARSE_ARRAY) {
        const key = readValue(r)
        arr[String(key)] = readValue(r)
      }
      r.off++
      r.varint()
      r.varint()
      return arr
    }
    case TAG.BEGIN_MAP: {
      const out = {}
      r.objects.push(out)
      while (r.buf[r.off] !== TAG.END_MAP) {
        const k = readValue(r)
        out[String(k)] = readValue(r)
      }
      r.off++
      r.varint()
      return out
    }
    case TAG.BEGIN_SET: {
      const out = []
      r.objects.push(out)
      while (r.buf[r.off] !== TAG.END_SET) out.push(readValue(r))
      r.off++
      r.varint()
      return out
    }
    case TAG.ARRAY_BUFFER: {
      const len = r.varint()
      const b = Buffer.from(r.bytes(len))
      r.objects.push(b)
      if (r.buf[r.off] === TAG.ARRAY_BUFFER_VIEW) {
        r.off++
        r.byte() // view type
        r.varint() // byte offset
        r.varint() // byte length
        if (r.version >= 14) r.varint() // flags
        r.objects.push(b)
      }
      return { __bytes: b.length }
    }
    case TAG.VERIFY_OBJECT_COUNT:
      r.varint()
      return readValue(r)
    default:
      throw new Error(`unsupported tag 0x${tag.toString(16)} at ${r.off - 1}`)
  }
}

/**
 * Full on-disk IndexedDB value → plain JS.
 * Returns `{ version, value }`; throws if the envelope is not recognisable.
 */
export function decodeIdbValue(buf) {
  let off = 0
  // IndexedDB record version varint.
  let shift = 0
  let recordVersion = 0
  while (true) {
    const b = buf[off++]
    recordVersion += (b & 0x7f) * 2 ** shift
    if ((b & 0x80) === 0) break
    shift += 7
  }

  // Blink envelope: 0xFF <blink version varint>, then optional trailer block.
  if (buf[off] !== 0xff) throw new Error('no blink envelope')
  off++
  let blinkVersion = 0
  shift = 0
  while (true) {
    const b = buf[off++]
    blinkVersion += (b & 0x7f) * 2 ** shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  // 0xFE = kTrailerOffsetTag: 8-byte offset + 4-byte size, big-endian.
  if (buf[off] === 0xfe) off += 13

  if (buf[off] !== 0xff) throw new Error('no v8 header')
  off++
  const r = new Reader(buf)
  r.off = off
  r.version = r.varint()
  return { recordVersion, blinkVersion, value: readValue(r) }
}
