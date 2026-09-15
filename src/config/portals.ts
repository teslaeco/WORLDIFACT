import type { PortalDefinition } from '../types/worldifact.ts'

export const PORTALS: readonly PortalDefinition[] = [
  {
    id: 'chess-cube-512-ai',
    title: 'Chess Cube 512 AI',
    shortTitle: 'Chess Cube',
    route: '/chess',
    tagline: 'Play the existing 8×8×8 chess engine',
    description:
      'Compete in volumetric chess matches, train AI opponents, and design custom boards and pieces.',
    color: '#90caf9',
    position: { x: -14, z: 0 },
    externalDemoEnv: 'VITE_WORLDIFACT_CHESS_DEMO_URL',
  },
  {
    id: 'terra-fix-iss',
    title: 'Terra — Fix ISS',
    shortTitle: 'Terra',
    route: '/iss',
    tagline: 'Repair the station and visit Earth observation',
    description:
      'Coordinate story-driven ISS repair scenarios and explore clearly labeled Earth-observation experiences.',
    color: '#ffcc80',
    position: { x: -6, z: 0 },
  },
  {
    id: '8-planets-in-8-days',
    title: '8 Planets in 8 Days',
    shortTitle: '8 Planets',
    route: '/planets',
    tagline: 'Explore the existing FORGE World Builder',
    description:
      'Travel across planets with unique physics, hazards and restoration technologies.',
    color: '#ce93d8',
    position: { x: 16, z: 0 },
  },
  {
    id: 'enchanted-ai-shop',
    title: 'Enchanted AI Shop',
    shortTitle: 'AI Shop',
    route: '/shop',
    tagline: 'Open the original FORGE shop and your projects',
    description:
      'Prototype object generation workflows that separate appearance review from manufacturing validation.',
    color: '#a5d6a7',
    position: { x: 8, z: 0 },
  },
  {
    id: 'ai-game-lab',
    title: 'AI Game Lab',
    shortTitle: 'Game Lab',
    route: '/lab',
    tagline: 'Open the existing Froge MPC 2 studio',
    description:
      'Create characters, vehicles, buildings and objects, then place them into reusable scenes.',
    color: '#80cbc4',
    position: { x: 8, z: -10 },
  },
] as const

export function getPortalById(id: string) {
  return PORTALS.find((portal) => portal.id === id)
}
