/** Keep post-login navigation on a known first-party page. Never forward arbitrary URLs. */
export function safeAccountDestination(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '/world'
  try {
    const url = new URL(value, 'https://worldifact.invalid')
    if (url.origin !== 'https://worldifact.invalid' || url.username || url.password) return '/world'
    if (url.pathname === '/world') return '/world'
    if (url.pathname !== '/account/credits') return '/world'
    const query = new URLSearchParams()
    const paypal = url.searchParams.get('paypal')
    if (paypal === 'return' || paypal === 'cancelled') {
      query.set('paypal', paypal)
      const token = url.searchParams.get('token')
      if (paypal === 'return' && token && /^[A-Z0-9]{10,36}$/.test(token)) query.set('token', token)
    }
    const billing = url.searchParams.get('billing')
    if (billing === 'processing' || billing === 'cancelled') query.set('billing', billing)
    return `/account/credits${query.size ? `?${query}` : ''}`
  } catch { return '/world' }
}
