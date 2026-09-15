export const FOUNDATIONS = [
  {
    id: 'chess-cube-512-ai', route: '/chess', title: 'Chess Cube 512 AI',
    frame: '/apps/chess/guest.html',
    original: 'https://teslaeco.github.io/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/',
    hosting: 'copied',
  },
  {
    id: 'terra-fix-iss', route: '/iss', title: 'Terra — Fix ISS',
    frame: '/apps/iss/index.html',
    original: 'https://fix-iss-repair-game.terraformingplanet.chatgpt.site/',
    hosting: 'copied',
  },
  {
    id: '8-planets-in-8-days', route: '/planets', title: '8 Planets in 8 Days · FORGE World Builder',
    frame: 'https://forge-world-builder.terraformingplanet.chatgpt.site/',
    original: 'https://forge-world-builder.terraformingplanet.chatgpt.site/',
    hosting: 'connected',
  },
  {
    id: 'enchanted-ai-shop', route: '/shop', title: 'Enchanted AI Shop',
    frame: 'https://forge-studio-public.terraformingplanet.chatgpt.site/',
    original: 'https://forge-studio-public.terraformingplanet.chatgpt.site/',
    hosting: 'connected',
  },
  {
    id: 'ai-game-lab', route: '/lab', title: 'AI Game Lab · Froge MPC 2',
    frame: 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/',
    original: 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/',
    hosting: 'connected',
  },
  {
    id: 'terra-observation', route: '/terra', title: 'Terra · Earth observation',
    frame: '/apps/terra/index.html',
    original: 'https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/',
    hosting: 'copied',
  },
] as const

export function foundationForPath(path: string) {
  return FOUNDATIONS.find(app => app.route === (path === '/chess/shop' ? '/shop' : path))
}
