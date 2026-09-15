import type { PortalDefinition } from '../types/worldifact.ts'

export const PORTALS: readonly PortalDefinition[] = [
  {
    id: 'chess-cube-512-ai',
    title: 'Chess Cube 512 AI',
    shortTitle: 'Chess Cube',
    route: '/portal/chess-cube-512-ai',
    tagline: 'Planned 8×8×8 chess playground',
    description:
      'Compete in volumetric chess matches, train AI opponents, and design custom boards and pieces.',
    color: '#90caf9',
    position: { x: -6, z: 1 },
    externalDemoEnv: 'VITE_WORLDIFACT_CHESS_DEMO_URL',
  },
  {
    id: 'terra-fix-iss',
    title: 'Terra — Fix ISS',
    shortTitle: 'Terra',
    route: '/portal/terra-fix-iss',
    tagline: 'ISS mission concept and Terra project',
    description:
      'Coordinate story-driven ISS repair scenarios and explore clearly labeled Earth-observation experiences.',
    color: '#ffcc80',
    position: { x: -13, z: -7 },
  },
  {
    id: '8-planets-in-8-days',
    title: '8 Planets in 8 Days',
    shortTitle: '8 Planets',
    route: '/portal/8-planets-in-8-days',
    tagline: 'Eight planetary mission concepts',
    description:
      'Travel across planets with unique physics, hazards and restoration technologies.',
    color: '#ce93d8',
    position: { x: 13, z: -7 },
  },
  {
    id: 'enchanted-ai-shop',
    title: 'Enchanted AI Shop',
    shortTitle: 'AI Shop',
    route: '/portal/enchanted-ai-shop',
    tagline: 'Review models and production costs',
    description:
      'Prototype object generation workflows that separate appearance review from manufacturing validation.',
    color: '#a5d6a7',
    position: { x: 6, z: 1 },
  },
  {
    id: 'ai-game-lab',
    title: 'AI Game Lab',
    shortTitle: 'Game Lab',
    route: '/portal/ai-game-lab',
    tagline: 'Compose worlds with procedural assets',
    description:
      'Create characters, vehicles, buildings and objects, then place them into reusable scenes.',
    color: '#80cbc4',
    position: { x: 0, z: 5 },
  },
] as const

export function getPortalById(id: string) {
  return PORTALS.find((portal) => portal.id === id)
}
