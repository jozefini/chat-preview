import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import path from 'node:path'

/**
 * Salt for the gate password digest. Only here to keep the baked-in hash off
 * the shelf of precomputed rainbow tables — it is not itself a secret.
 */
const PASSWORD_SALT = 'chat-preview:gate:v1:'

export default defineConfig(({ mode }) => {
  // Empty prefix so the password can live under a bare `ARCHIVE_PASSWORD` name.
  // Deliberately NOT `VITE_*`: that prefix would make Vite inline the raw
  // password into the client bundle, which is exactly what we're avoiding.
  const env = loadEnv(mode, import.meta.dirname, '')
  const password = env.ARCHIVE_PASSWORD ?? ''

  if (!password) {
    console.warn(
      '\n[chat-preview] ARCHIVE_PASSWORD is not set — the gate will reject every attempt.' +
        '\n               Set it in .env.local (see .env.example) or in the host env.\n',
    )
  }

  // Only this digest ships to the browser; the password never does.
  const passwordHash = password
    ? createHash('sha256')
        .update(PASSWORD_SALT + password)
        .digest('hex')
    : ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __ARCHIVE_PASSWORD_HASH__: JSON.stringify(passwordHash),
      __ARCHIVE_PASSWORD_SALT__: JSON.stringify(PASSWORD_SALT),
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
