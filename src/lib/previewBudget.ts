export type PreviewCost = { triangles: number; draws: number; bytes: number }
export const PREVIEW_LIMIT = Object.freeze({ triangles: 2_000_000, draws: 1800, bytes: 96_000_000 })
export function fitsPreview(used: PreviewCost, next: PreviewCost): boolean {
  return (['triangles','draws','bytes'] as const).every(k => Number.isSafeInteger(next[k]) && next[k] >= 0 && Number.isSafeInteger(used[k]) && used[k] >= 0 && used[k]+next[k] <= PREVIEW_LIMIT[k])
}
export function sumPreview(a:PreviewCost,b:PreviewCost):PreviewCost{return {triangles:a.triangles+b.triangles,draws:a.draws+b.draws,bytes:a.bytes+b.bytes}}
