export type ShopPreviewKind = 'interior' | 'tower' | 'character' | 'vehicle' | 'object'

export function shopPreviewKind(prompt: string): ShopPreviewKind {
  const value = prompt.toLowerCase()
  if (/(interior|room|living|dining|kitchen|bedroom|wnętrz|pokój|salon|jadaln|kuchn|sypial)/.test(value)) return 'interior'
  if (/(tower|building|house|skyscraper|wież|budyn|dom)/.test(value)) return 'tower'
  if (/(character|person|figur|human|posta|astronaut|queen)/.test(value)) return 'character'
  if (/(car|vehicle|rover|truck|auto|pojazd|samoch)/.test(value)) return 'vehicle'
  return 'object'
}
