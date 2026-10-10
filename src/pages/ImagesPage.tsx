import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageGenerator } from '../components/ImageGenerator'
import { useAccount } from '../lib/account'
import './ShopPage.css'

export default function ImagesPage() {
  const { user } = useAccount()
  const [prompt, setPrompt] = useState(''), [stage, setStage] = useState<HTMLDivElement | null>(null)
  return <main className="native-shop"><header className="shop-customer-header"><Link to="/account">← My account</Link><h1>My images</h1><Link to="/shop">AI Shop</Link></header>
    <section className="native-shop-workspace" aria-label="Generate and recover account images">
      <div className="native-shop-form"><label htmlFor="image-prompt">Describe your image</label><textarea id="image-prompt" value={prompt} maxLength={4000} rows={6} onChange={e => setPrompt(e.target.value)} />
        <ImageGenerator key={user?.id ?? 'guest'} prompt={prompt} stage={stage} onSettled={() => {}} />
      </div><div className="native-shop-preview" ref={setStage} />
    </section>
  </main>
}
