const messages = {
  config_unavailable: 'Google sign-in is temporarily unavailable. Use email or try again later.',
  flow_missing_or_expired: 'Sign-in expired or lost its browser session. Retry in the same tab and browser. On mobile, open WORLDIFAKT in Chrome with site cookies allowed.',
  state_mismatch: 'This sign-in does not match your browser session. Retry in the same tab and browser. On mobile, open WORLDIFAKT in Chrome with site cookies allowed.',
  invalid_callback: 'This sign-in link is incomplete. Start again with Continue with Google.',
  provider_denied: 'Google sign-in was cancelled or not approved. Try again when you are ready.',
  rate_limited: 'Too many sign-in attempts. Wait a minute, then try again.',
  exchange_failed: 'We could not finish Google sign-in. Start a new attempt from this page.',
  service_unavailable: 'The sign-in service is temporarily unavailable. Please try again shortly.',
  identity_failed: 'Your Google sign-in could not be verified. Please try again or use email.',
} as const

/** Only trusted, fixed copy is displayed; URL/provider error text is never echoed. */
export function accountOAuthError(reason: unknown): string {
  return typeof reason === 'string' && Object.hasOwn(messages, reason)
    ? messages[reason as keyof typeof messages]
    : 'Google sign-in could not be completed. Please try again.'
}
