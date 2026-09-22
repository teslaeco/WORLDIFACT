import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { accountRequest } from '../lib/account'
import './CreditsPage.css'
import './AccountPage.css'
export default function ResetPasswordPage() {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = new FormData(event.currentTarget), password = String(form.get('password') || '')
    if (password !== form.get('confirm')) { setError('The passwords do not match.'); return }
    setBusy(true); setError('')
    try { await accountRequest('/api/account/password', { password }); setDone(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Your reset link has expired. Request a new one.'); }
    finally { setBusy(false) }
  }
  return <main className="credits-page"><header><Link className="credits-wordmark" to="/">WORLDIFACT</Link></header><section className="account-card" style={{ margin: '60px auto', maxWidth: 430 }}><h1>{done ? 'Password updated.' : 'A fresh start.'}</h1>{done ? <p><Link to="/login">Sign in with your new password →</Link></p> : <form onSubmit={submit}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label><button className="account-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></form>}{error && <p className="account-error" role="alert">{error}</p>}</section></main>
}
