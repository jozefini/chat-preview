# idb-extract

Turns a raw Chrome/Brave IndexedDB directory into a `chat-archive`-shaped
folder — the same JSON the watch-chat extension exports, so `scripts/prep.mjs`
can consume it unchanged.

Needed because the second chat (bbvipalb.site) was never exported by the
extension; all that exists is a copy of the browser's on-disk LevelDB.

```bash
npm i -D snappyjs
node scripts/idb-extract/export.mjs ~/Desktop/bbvipalb-site-indexeddb-backup chat2-archive-bbvipalb-2026-07-26
```

## Why it is hand-rolled

Every LevelDB binding refuses to open a Chrome IndexedDB directory:

```
Invalid argument: idb_cmp1 does not match existing comparator : leveldb.BytewiseComparator
```

Chrome registers a custom key comparator. A reader that only wants to walk
every row once does not need it, so `sst.mjs` parses the `.ldb` (SST) files
directly — footer → index block → data blocks, snappy-decompressed — and
ignores ordering entirely. Duplicates across levels are resolved by LevelDB
sequence number.

`v8.mjs` then decodes each value, which is `varint(record version)` followed by
a Blink envelope and a V8 structured-clone payload.

## Gotchas worth remembering

- **`EncodeInt` is not a varint.** Chrome writes database ids as little-endian
  bytes with leading zeroes dropped. Reading them as varints silently yields
  the wrong id whenever a byte has its high bit set — `df 00` is 223, not 95.
- **Key prefix widths** are packed into byte 0 of every key:
  `((dbLen-1) << 5) | ((osLen-1) << 2) | (idxLen-1)`.
- **`indexId` 1** is object-store data; 2 is the "exists" entry; 3 is the key
  generator. Only 1 carries messages.
- **Padding tags (`0x00`)** can appear between any two V8 values.
- Days are bucketed in **UTC+2**, matching `timezoneOffsetMinutes: -120` in the
  extension's own `_index.json`.
