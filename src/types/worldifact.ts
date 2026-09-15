export type AssetTarget = 'GAME' | 'MAKE'

export type AssetReadiness =
  | 'concept'
  | 'game-ready'
  | 'validation-required'
  | 'manufacturing-reviewed'

export interface AssetRecord {
  id: string
  name: string
  target: AssetTarget
  readiness: AssetReadiness
  format: string
  notes: string
}

export interface PortalDefinition {
  id: string
  title: string
  shortTitle: string
  route: string
  tagline: string
  description: string
  color: string
  position: {
    x: number
    z: number
  }
  externalDemoEnv?: string
}
