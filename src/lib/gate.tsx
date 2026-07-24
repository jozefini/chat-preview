import { useCallback, useState, type FormEvent, type ReactNode } from 'react'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE PASSWORD GATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing renders until the visitor types the password from `ARCHIVE_PASSWORD`.
 *
 * The password is turned into a salted SHA-256 digest at BUILD time (see
 * vite.config.ts) so the bundle carries the hash, never the password. What the
 * gate then does is compare digests.
 *
 * Be clear-eyed about what this is: a client-side lock on a static site. It
 * keeps the archive from opening to anyone who lands on the URL, and it keeps
 * the password itself out of the shipped JS — but `public/data/*.json` is still
 * served unauthenticated, so someone who guesses those URLs can read the data
 * without ever meeting the gate. For a hard boundary the site has to sit behind
 * something server-side (Vercel Deployment Protection, or middleware that gates
 * /data too).
 */

declare const __ARCHIVE_PASSWORD_HASH__: string
declare const __ARCHIVE_PASSWORD_SALT__: string

/** Stores the accepted digest, so rotating the password invalidates old unlocks. */
const UNLOCK_KEY = 'chat-preview:unlocked'

function readUnlock(): string | null {
  try {
    return localStorage.getItem(UNLOCK_KEY)
  } catch {
    return null // Storage blocked (private mode / disabled cookies) — gate every load.
  }
}

function writeUnlock(token: string): void {
  try {
    localStorage.setItem(UNLOCK_KEY, token)
  } catch {
    // Non-fatal: the session still unlocks, it just won't be remembered.
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => !!__ARCHIVE_PASSWORD_HASH__ && readUnlock() === __ARCHIVE_PASSWORD_HASH__,
  )
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (checking) return

      if (!__ARCHIVE_PASSWORD_HASH__) {
        setError('No password is configured for this build.')
        return
      }

      setChecking(true)
      setError(null)
      try {
        const attempt = await sha256Hex(__ARCHIVE_PASSWORD_SALT__ + value)
        if (attempt !== __ARCHIVE_PASSWORD_HASH__) {
          setError('Wrong password.')
          setValue('')
          return
        }
        writeUnlock(attempt)
        setUnlocked(true)
      } finally {
        setChecking(false)
      }
    },
    [checking, value],
  )

  if (unlocked) return <>{children}</>

  return (
    <div className="flex h-[100dvh] items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <h1 className="text-base font-semibold tracking-tight">Chat Preview</h1>
        <p className="mt-1 text-xs text-neutral-500">
          This archive is private. Enter the password to continue.
        </p>

        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          aria-invalid={!!error}
          className="mt-5 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-white/25 focus:outline-none"
        />

        <button
          type="submit"
          disabled={checking || !value}
          className="mt-3 w-full rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>

        <p className="mt-3 min-h-4 text-xs text-red-400" role="alert">
          {error}
        </p>

        {!__ARCHIVE_PASSWORD_HASH__ && (
          <p className="mt-2 text-xs text-amber-400/80">
            This build has no <code className="text-amber-300">ARCHIVE_PASSWORD</code> set, so no
            password can work. Set it and rebuild.
          </p>
        )}
      </form>
    </div>
  )
}
