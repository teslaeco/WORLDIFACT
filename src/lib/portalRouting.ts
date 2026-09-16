import { getPortalById } from '../config/portals.ts'

/** Resolve a WORLDIFACT portal id to a safe in-app route. */
export function routeForPortal(id: string) {
  return getPortalById(id)?.route ?? '/'
}
