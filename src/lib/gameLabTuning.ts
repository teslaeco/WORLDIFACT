/** Bounded, zero-cost local playtest controls. Not an AI/code execution service. */
export type RenderQuality = 'eco' | 'balanced' | 'quality'
export type GameTuning = { vehicleMode: boolean; speedKmh: number; steeringPercent: number; renderQuality: RenderQuality }
export const DEFAULT_GAME_TUNING: Readonly<GameTuning> = Object.freeze({ vehicleMode: false, speedKmh: 80, steeringPercent: 70, renderQuality: 'balanced' })
export function validateGameTuning(input: unknown): GameTuning {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid game settings.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['vehicleMode','speedKmh','steeringPercent','renderQuality'].includes(key))) throw new Error('Unknown game setting.')
  if (typeof value.vehicleMode !== 'boolean' || !Number.isInteger(value.speedKmh) || (value.speedKmh as number) < 10 || (value.speedKmh as number) > 300 ||
      !Number.isInteger(value.steeringPercent) || (value.steeringPercent as number) < 10 || (value.steeringPercent as number) > 100 ||
      !['eco', 'balanced', 'quality'].includes(String(value.renderQuality))) throw new Error('Game settings outside supported limits.')
  return { vehicleMode: value.vehicleMode, speedKmh: value.speedKmh as number, steeringPercent: value.steeringPercent as number, renderQuality: value.renderQuality as RenderQuality }
}
export function parseGameLabPrompt(prompt: string, current: GameTuning): { settings: GameTuning; changes: string[] } {
  if (typeof prompt !== 'string' || prompt.length > 320) throw new Error('Keep game instructions under 320 characters.')
  const value = prompt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g,'l')
  let settings = { ...validateGameTuning(current) }
  const changes: string[] = []
  const speed = value.match(/(?:speed|predkosc|top speed|maksymalna predkosc)[^\d]{0,28}(\d{1,4})\s*(?:km\/?h|kph)?/)
  if (speed) { settings.speedKmh = Number(speed[1]); changes.push('Vehicle speed') }
  const steering = value.match(/(?:steering|sterowanie|skret|skrecanie)[^\d]{0,28}(\d{1,3})\s*%?/)
  if (steering) { settings.steeringPercent = Number(steering[1]); changes.push('Steering sensitivity') }
  if (/(?:render|graphics|grafika|jakosc|quality)/.test(value)) {
    if (/(?:eco|low|niska|oszczedn)/.test(value)) settings.renderQuality = 'eco'
    else if (/(?:high|ultra|wysoka|najwyzsza)/.test(value)) settings.renderQuality = 'quality'
    else if (/(?:balanced|medium|srednia|zbalansowan)/.test(value)) settings.renderQuality = 'balanced'
    else throw new Error('Choose Eco, Balanced or Quality rendering.')
    changes.push('Rendering quality')
  }
  if (/(?:drive|vehicle mode|driving mode|jazda samochodem|tryb jazdy)/.test(value)) { settings.vehicleMode = true; changes.push('Vehicle test mode') }
  if (/(?:walk mode|character mode|tryb postaci|chodzenie)/.test(value)) { settings.vehicleMode = false; changes.push('Character test mode') }
  if (!changes.length) throw new Error('Unknown instruction. Try "speed 120 km/h, steering 65%, render quality high" or "tryb jazdy".')
  return { settings: validateGameTuning(settings), changes }
}
