import { createServer as createViteServer } from 'vite'
import config from '../vite.config.ts'

/** Use the real application configuration without a shared .vite-temp config bundle. */
export function createServer(overrides) {
  return createViteServer({
    ...config,
    ...overrides,
    configFile: false,
    server: { ...config.server, ...overrides.server },
  })
}
