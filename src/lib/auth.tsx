import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE PASSWORD GATE — two doors into the same archive
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing renders until the visitor types one of two passwords:
 *
 *   ARCHIVE_PASSWORD → role `public`. Sees only the days in `ALLOWED_DATES`
 *                      (src/config.ts), trimmed to each day's clock window.
 *   ADMIN_PASSWORD   → role `admin`. Sees the entire archive, every hour.
 *
 * Both are turned into salted SHA-256 digests at BUILD time (see
 * vite.config.ts) so the bundle carries hashes, never passwords. The two roles
 * use different salts, which is what lets the stored token identify the role
 * it was minted for — there is no separate, forgeable "isAdmin" flag in
 * storage. Rotating either password invalidates every unlock issued under it.
 *
 * Be clear-eyed about what this is: a client-side lock on a static site. Since
 * prep now publishes the whole archive so admins can read it, every day's JSON
 * sits at a guessable URL under `/data/days/`, served without auth. This gate
 * decides what the APP shows, not what the SERVER hands out. For a real
 * boundary the site needs Vercel Deployment Protection or middleware in front
 * of /data.
 */

declare const __ARCHIVE_PASSWORD_HASH__: string
declare const __ARCHIVE_PASSWORD_SALT__: string
declare const __ADMIN_PASSWORD_HASH__: string
declare const __ADMIN_PASSWORD_SALT__: string

export type Role = 'public' | 'admin'

/** Stores `role:digest`, so rotating a password invalidates old unlocks. */
const UNLOCK_KEY = 'chat-preview:unlocked'

interface Credentials {
  role: Role
  salt: string
  hash: string
}

/**
 * Admin first: whoever holds that password should get the wider role even if
 * the two passwords were misconfigured to the same text.
 */
const CREDENTIALS: Credentials[] = [
  { role: 'admin', salt: __ADMIN_PASSWORD_SALT__, hash: __ADMIN_PASSWORD_HASH__ },
  { role: 'public', salt: __ARCHIVE_PASSWORD_SALT__, hash: __ARCHIVE_PASSWORD_HASH__ },
].filter((c) => !!c.hash) as Credentials[]

/** No password configured at all — the gate can only ever reject. */
const NO_PASSWORDS = CREDENTIALS.length === 0

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── stored unlock ───────────────────────────────────────────────────────────

/**
 * The role this browser is unlocked as, or `null`.
 *
 * Deliberately a plain function reading storage rather than React state: the
 * router's loaders decide which days are routable and they run outside the
 * component tree. Both this and `useAuth()` end up at the same answer because
 * the token is only ever written by `unlock` below.
 */
export function readRole(): Role | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(UNLOCK_KEY)
  } catch {
    return null // Storage blocked (private mode / disabled cookies) — gate every load.
  }
  if (!raw) return null

  const at = raw.indexOf(':')
  if (at === -1) return null
  const role = raw.slice(0, at)
  const token = raw.slice(at + 1)

  // The token must still match a digest this build ships, which is what makes
  // a rotated password kick everyone out and a hand-edited role useless.
  const match = CREDENTIALS.find((c) => c.role === role && c.hash === token)
  return match ? match.role : null
}

function writeUnlock(role: Role, token: string): void {
  try {
    localStorage.setItem(UNLOCK_KEY, `${role}:${token}`)
  } catch {
    // Non-fatal: the session still unlocks, it just won't be remembered.
  }
}

function clearUnlock(): void {
  try {
    localStorage.removeItem(UNLOCK_KEY)
  } catch {
    // Nothing to clear if storage was never available.
  }
}

// ── context ─────────────────────────────────────────────────────────────────

export interface Auth {
  role: Role
  /** Sees the whole archive, unfiltered. */
  isAdmin: boolean
  logout: () => void
}

const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <PasswordGate>')
  return ctx
}

// ── the gate ────────────────────────────────────────────────────────────────

interface GateProps {
  children: ReactNode
  /**
   * Fired after a login or logout changes the role. The app uses it to drop
   * cached days and re-run route loaders, so a public session can't leave
   * decoded messages behind for the admin session that follows it — or, worse,
   * the other way round.
   */
  onRoleChange?: (role: Role | null) => void
}

export function PasswordGate({ children, onRoleChange }: GateProps) {
  const [role, setRole] = useState<Role | null>(readRole)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const logout = useCallback(() => {
    clearUnlock()
    setRole(null)
    setValue('')
    setError(null)
    onRoleChange?.(null)
  }, [onRoleChange])

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (checking) return

      if (NO_PASSWORDS) {
        setError('No password is configured for this build.')
        return
      }

      setChecking(true)
      setError(null)
      try {
        // Hash against every configured role rather than short-circuiting, so
        // one password is not measurably faster to reject than the other.
        const attempts = await Promise.all(
          CREDENTIALS.map(async (c) => ({ c, digest: await sha256Hex(c.salt + value) })),
        )
        const hit = attempts.find((a) => a.digest === a.c.hash)

        if (!hit) {
          setError('Wrong password.')
          setValue('')
          return
        }

        writeUnlock(hit.c.role, hit.digest)
        setRole(hit.c.role)
        setValue('')
        onRoleChange?.(hit.c.role)
      } finally {
        setChecking(false)
      }
    },
    [checking, value, onRoleChange],
  )

  const auth = useMemo<Auth | null>(
    () => (role ? { role, isAdmin: role === 'admin', logout } : null),
    [role, logout],
  )

  if (auth) return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>

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
          className="mt-3 w-full cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>

        <p className="mt-3 min-h-4 text-xs text-red-400" role="alert">
          {error}
        </p>

        {NO_PASSWORDS && (
          <p className="mt-2 text-xs text-amber-400/80">
            This build has no <code className="text-amber-300">ARCHIVE_PASSWORD</code> or{' '}
            <code className="text-amber-300">ADMIN_PASSWORD</code> set, so no password can work.
            Set one and rebuild.
          </p>
        )}
      </form>
    </div>
  )
}
