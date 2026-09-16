export const PLANET_CAMPAIGN = [
  { id: 'mercury', name: 'Mercury', day: 1, hazard: 'Solar heat', mission: 'Cross the sunlit ridge and cool the rover.' },
  { id: 'venus', name: 'Venus', day: 2, hazard: 'Pressure + clouds', mission: 'Reach the protected research beacon.' },
  { id: 'earth', name: 'Earth', day: 3, hazard: 'Flooded valley', mission: 'Restore a bridge between two habitats.' },
  { id: 'mars', name: 'Mars', day: 4, hazard: 'Dust storm', mission: 'Power the outpost before visibility drops.' },
  { id: 'jupiter', name: 'Jupiter', day: 5, hazard: 'Radiation', mission: 'Navigate a protected orbital platform.' },
  { id: 'saturn', name: 'Saturn', day: 6, hazard: 'Ring debris', mission: 'Thread a safe route through the ring station.' },
  { id: 'uranus', name: 'Uranus', day: 7, hazard: 'Extreme cold', mission: 'Restart the thermal grid.' },
  { id: 'neptune', name: 'Neptune', day: 8, hazard: 'High winds', mission: 'Reach the final storm beacon.' },
] as const

export type PlanetCampaignEntry = (typeof PLANET_CAMPAIGN)[number]
