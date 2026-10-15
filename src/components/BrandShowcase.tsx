import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import './BrandShowcase.css'

const destinations = [
  { name: 'Chess Cube 512 AI', label: '512 squares · 8 × 8 × 8', route: '/chess', icon: '♜', color: '#70a8ff' },
  { name: 'Terra — Fix ISS', label: 'Earth observation · ISS simulation', route: '/iss', icon: '◉', color: '#5ee8c3' },
  { name: '8 Planets in 8 Days', label: 'Explore eight worlds', route: '/planets', icon: '✦', color: '#cf91ff' },
  { name: 'Enchanted AI Shop', label: 'Create objects and 3D assets', route: '/shop', icon: '◇', color: '#ffca7a' },
  { name: 'AI Game Lab', label: 'Build characters and worlds', route: '/lab', icon: '⬡', color: '#63f2d3' },
  { name: 'My Worlds', label: 'Open your saved worlds', route: '/account/worlds', icon: '◎', color: '#ff82cf' },
] as const

const resources = [
  { name: 'OpenAI', url: 'https://openai.com/' },
  { name: 'Product Hunt', url: 'https://www.producthunt.com/products/worldifact' },
  { name: 'Blender', url: 'https://www.blender.org/' },
  { name: 'Unreal Engine', url: 'https://www.unrealengine.com/' },
  { name: 'Unity', url: 'https://unity.com/' },
  { name: 'Shopify', url: 'https://www.shopify.com/' },
  { name: 'eBay', url: 'https://www.ebay.com/' },
  { name: 'WebMCP', url: 'https://github.com/webmachinelearning/webmcp' },
  { name: 'GPT-6 Astra Challenge', url: 'https://www.producthunt.com/contests/gpt-6-astra-challenge' },
  { name: 'NASA', url: 'https://www.nasa.gov/' },
  { name: 'ESA', url: 'https://www.esa.int/' },
  { name: 'JAXA', url: 'https://global.jaxa.jp/' },
  { name: 'CNSA', url: 'https://www.cnsa.gov.cn/' },
  { name: 'ISRO', url: 'https://www.isro.gov.in/' },
  { name: 'FORGE MCP', url: '/lab' },
] as const

export default function BrandShowcase() {
  return <section className="brand-showcase portal-showcase" aria-labelledby="portal-showcase-title">
    <div className="brand-showcase-heading">
      <div><span className="brand-showcase-eyebrow">SIX WORLDS · ONE UNIVERSE</span>
        <h2 id="portal-showcase-title">Choose your <span>next world.</span></h2></div>
      <p>Play, explore and create. Select a portal to enter.</p>
    </div>
    <nav className="neon-portals" aria-label="Six WORLDIFACT portals">
      {destinations.map((item, index) => <Link key={item.route} to={item.route} className="neon-portal"
        style={{ '--portal-glow': item.color } as CSSProperties}>
        <span className="neon-portal-number">0{index + 1}</span>
        <span className="neon-portal-symbol" aria-hidden="true">{item.icon}</span>
        <strong>{item.name}</strong><small>{item.label}</small>
        <span className="neon-portal-enter">Enter portal ↗</span>
      </Link>)}
    </nav>
    <div className="resource-heading"><span className="brand-showcase-eyebrow">TECHNOLOGY · COMMUNITY · SPACE RESEARCH</span><small>Explore independent resources · No partnership or endorsement implied</small></div>
    <div className="resource-marquee" aria-label="External technology and research resources" role="region" tabIndex={0}>
      <div className="resource-marquee-track">
        {[0, 1].map(copy => <div className="resource-marquee-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
          {resources.map(resource => <a key={resource.name} href={resource.url}
            tabIndex={copy === 1 ? -1 : undefined}
            target={resource.url.startsWith('/') ? undefined : '_blank'}
            rel={resource.url.startsWith('/') ? undefined : 'noopener noreferrer'}>{resource.name}<span aria-hidden="true"> ↗</span></a>)}
        </div>)}
      </div>
    </div>
    <section className="iss-petition" aria-labelledby="iss-petition-title">
      <div><span className="brand-showcase-eyebrow">OUR PRESERVATION CAMPAIGN</span>
        <h2 id="iss-petition-title">Repair the ISS. Don’t destroy it.</h2>
        <p>Help us call for the study of repair and preservation of the International Space Station as humanity’s heritage. We would be grateful for your signature and for sharing the petition.</p>
        <small>A citizen-led proposal, not a claim of technical feasibility or space-agency endorsement.</small>
      </div>
      <a className="iss-petition-sign" href="https://c.org/QkbzHd5kWN" target="_blank" rel="noopener noreferrer">Sign the petition ↗</a>
    </section>
  </section>
}
