import { REFERENCE_LINKS } from '../config/references'
import './BrandShowcase.css'

const brands = [
  { id: 'openai', name: 'OpenAI', category: 'Intelligence', description: 'Explore the possibilities of AI.', action: 'Discover OpenAI', href: 'https://openai.com/', logo: '/brands/openai.svg' },
  { id: 'product-hunt', name: 'Product Hunt', category: 'Community', description: 'Follow the WORLDIFAKT launch.', action: 'Join the conversation', href: 'https://www.producthunt.com/products/worldifact', logo: '/brands/product-hunt-white.png' },
  { id: 'shopify', name: 'Shopify', category: 'Commerce', description: 'Explore a platform for your next store.', action: 'Explore Shopify', href: 'https://www.shopify.com/', logo: '/brands/shopify.svg' },
  { id: 'ebay', name: 'eBay', category: 'Marketplace', description: 'Discover a world of possibilities.', action: 'Explore eBay', href: 'https://www.ebay.com/', logo: '/brands/ebay.svg' },
  { id: 'blender', name: 'Blender', category: '3D creation', description: 'Give your imagination a new dimension.', action: 'Discover Blender', href: 'https://www.blender.org/', logo: '/brands/blender-white.png' },
  { id: 'forge', name: 'FORGE MCP', category: 'Our studio', description: 'Step into the original creation studio.', action: 'Open the studio', href: REFERENCE_LINKS.modelGenerator, logo: '/world-assets/polyhedron-led-poster.svg' },
] as const

export default function BrandShowcase() {
  return <section className="brand-showcase" aria-labelledby="brand-showcase-title">
    <div className="brand-showcase-heading">
      <div>
        <span className="brand-showcase-eyebrow">TECHNOLOGY, TOOLS & COMMUNITY</span>
        <h2 id="brand-showcase-title">Big ideas. <span>Wider horizons.</span></h2>
      </div>
      <p>Discover AI, 3D creation and the platforms<br className="brand-showcase-break" /> where ideas find their next chapter.</p>
    </div>
    <ul className="brand-showcase-grid">
      {brands.map((brand, index) => <li key={brand.id}>
        <a className={`brand-banner brand-banner--${brand.id}`} href={brand.href} target="_blank" rel="noopener noreferrer">
          <div className="brand-banner-top"><span>{brand.category}</span><span className="brand-banner-index" aria-hidden="true">0{index + 1}</span></div>
          <div className="brand-banner-logo">
            <img src={brand.logo} alt={brand.id === 'forge' ? '' : brand.name} width={180} height={52} loading="lazy" decoding="async" />
            {brand.id === 'forge' && <span>FORGE <b>MCP</b></span>}
          </div>
          <p>{brand.description}</p>
          <div className="brand-banner-action"><span>{brand.action}</span><span className="brand-banner-arrow" aria-hidden="true">↗</span></div>
          <span className="brand-banner-sr"> (opens in a new tab)</span>
        </a>
      </li>)}
    </ul>
    <section className="iss-petition" aria-labelledby="iss-petition-title">
      <div>
        <span className="brand-showcase-eyebrow">OUR PRESERVATION CAMPAIGN</span>
        <h2 id="iss-petition-title">Repair the ISS. Don’t destroy it.</h2>
        <p>Help us call for the study of repair and preservation of the International Space Station as humanity’s heritage. We would be grateful for your signature and for sharing the petition. Thank you for supporting this idea.</p>
        <small>A citizen-led proposal, not a claim of technical feasibility or space-agency endorsement.</small>
      </div>
      <a className="iss-petition-sign" href="https://c.org/QkbzHd5kWN" target="_blank" rel="noopener noreferrer">Sign the petition <span aria-hidden="true">↗</span><span className="brand-banner-sr"> (opens in a new tab)</span></a>
    </section>
  </section>
}
