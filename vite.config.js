import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * VITE_API_BASE values:
 *   "mock"          -> proxy to http://localhost:4010 (Prism mock)
 *   "staging"       -> proxy to https://go.smsiotpk.com (default)
 *   any full URL    -> proxy to that URL
 *
 * `/api/*` and `/auth/*` stay same-origin in the browser so the existing
 * relative-path API client (src/api/client.js) keeps working in every mode.
 */

const PROD_TARGET = 'https://go.smsiotpk.com'
const MOCK_TARGET = 'http://localhost:4010'

function resolveTarget(env) {
  const raw = (env.VITE_API_BASE || '').trim()
  if (!raw || raw === 'staging' || raw === 'prod') return PROD_TARGET
  if (raw === 'mock' || raw === 'local') return MOCK_TARGET
  return raw
}

/**
 * Vite middleware that short-circuits PUT /asset/{id}/attribute/{name} to a
 * bare 204 when running against the mock. Prism's request validator rejects
 * top-level primitive JSON bodies (`false`, `42`, ...) which is exactly what
 * the portal sends for attribute writes. Real backend accepts these — we
 * just bypass Prism for this one case so optimistic-update toggles work
 * cleanly in demo mode.
 */
function mockAttributeWriteBypass() {
  return {
    name: 'sms-mock-attribute-write-bypass',
    apply: 'serve',
    configureServer(server) {
      const re = /^\/api\/[^/]+\/asset\/[^/]+\/attribute\/[^/?]+/
      server.middlewares.use((req, res, next) => {
        if (req.method === 'PUT' && re.test(req.url || '')) {
          res.statusCode = 204
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = resolveTarget(env)
  const isMock = target === MOCK_TARGET

  // Prism mounts every spec path at root, ignoring the spec's
  // `/api/{realm}` server prefix. Strip that prefix on its way to the mock.
  const stripRealmPrefix = (p) => p.replace(/^\/api\/[^/]+/, '') || '/'

  console.log(`[vite] proxying /api and /auth -> ${target}${isMock ? ' (mock)' : ''}`)

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isMock ? [mockAttributeWriteBypass()] : []),
    ],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: !isMock,
          headers: isMock ? {} : { Origin: PROD_TARGET },
          rewrite: isMock ? stripRealmPrefix : undefined,
        },
        '/auth': {
          target,
          changeOrigin: true,
          secure: !isMock,
          headers: isMock ? {} : { Origin: PROD_TARGET },
          rewrite: isMock ? stripRealmPrefix : undefined,
        },
      },
    },
  }
})
