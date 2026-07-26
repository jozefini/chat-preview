import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import path from 'node:path'

/**
 * Salts for the gate password digests. Only here to keep the baked-in hashes
 * off the shelf of precomputed rainbow tables — they are not themselves
 * secrets. The two roles use DIFFERENT salts, which is what lets the stored
 * unlock token identify which role it came from: a public digest can never be
 * mistaken for an admin one, even if both passwords were set to the same text.
 */
const PUBLIC_SALT = 'chat-preview:gate:v1:'
const ADMIN_SALT = 'chat-preview:admin:v1:'

export default defineConfig(({ mode }) => {
  // Empty prefix so the password can live under a bare `ARCHIVE_PASSWORD` name.
  // Deliberately NOT `VITE_*`: that prefix would make Vite inline the raw
  // password into the client bundle, which is exactly what we're avoiding.
  const env = loadEnv(mode, import.meta.dirname, '')
  const publicPassword = env.ARCHIVE_PASSWORD ?? ''
  const adminPassword = env.ADMIN_PASSWORD ?? ''

  if (!publicPassword && !adminPassword) {
    console.warn(
      '\n[chat-preview] Neither ARCHIVE_PASSWORD nor ADMIN_PASSWORD is set — the gate will' +
        '\n               reject every attempt. Set them in .env.local (see .env.example)' +
        '\n               or in the host env.\n',
    )
  } else if (!adminPassword) {
    console.warn(
      '\n[chat-preview] ADMIN_PASSWORD is not set — nobody can unlock the full archive.' +
        "\n               Visitors will only see each chat's published days.\n",
    )
  }

  // A shared password would make the admin branch unreachable-by-intent: the
  // gate tries admin first, so the "public" login would silently grant
  // everything. Loud, because it defeats the whole point of the split.
  if (publicPassword && publicPassword === adminPassword) {
    console.warn(
      '\n[chat-preview] ARCHIVE_PASSWORD and ADMIN_PASSWORD are identical — every visitor' +
        '\n               who knows the public password gets admin access. Use two' +
        '\n               different passwords.\n',
    )
  }

  // Only these digests ship to the browser; the passwords never do.
  const digest = (salt: string, password: string) =>
    password ? createHash('sha256').update(salt + password).digest('hex') : ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __ARCHIVE_PASSWORD_HASH__: JSON.stringify(digest(PUBLIC_SALT, publicPassword)),
      __ARCHIVE_PASSWORD_SALT__: JSON.stringify(PUBLIC_SALT),
      __ADMIN_PASSWORD_HASH__: JSON.stringify(digest(ADMIN_SALT, adminPassword)),
      __ADMIN_PASSWORD_SALT__: JSON.stringify(ADMIN_SALT),
    },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      // Honour an assigned PORT so the dev server can move off a busy 5173.
      port: Number(process.env.PORT) || 5173,
    },
    build: {
      // Day JSON lives in public/ and is fetched at runtime, so it never enters the
      // bundle graph. Keep the JS bundle small and cacheable.
      target: 'es2022',
    },
  }
})
