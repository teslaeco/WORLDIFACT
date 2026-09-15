# Privacy and data notice — release draft

Updated 15 September 2026. The matching in-app notice is at `/privacy`.

WORLDIFACT is maintained by the Terraforming Planet project. A private operator contact and the operator's legal identity must be confirmed before public LIVE activation. Non-sensitive support is available through the [project issue tracker](https://github.com/teslaeco/WORLDIFACT/issues); do not post private information in public issues.

- Local GLB files are read in browser memory. The model viewer does not upload them.
- The device archive stores up to 30 successful scene blueprints and generation metadata in local storage. Export a copy before clearing the site's browser data; clearing it removes this archive. No cloud backup or user account is implemented.
- DEMO uses local rules and does not analyze a reference image. LIVE sends the prompt and optional image through the Worker to OpenAI only on the user's generation action.
- The Worker requests `store:false`, does not log prompts/images and has no application content database. This does not assert zero retention by hosting or AI providers. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and the actual operator account settings.
- A rate limiter processes the client IP. The Durable Object stores a global reserved-attempt count, without prompt, image or IP data. It persists until an operator-managed retirement of that deployment; expiry stops generation but does not erase the count.
- The preview access code exists in page memory and a request header to this site. It is not put in local storage, provider input, URLs or exported generation evidence.
- Saved generation metadata can contain a provider response ID, timestamp, token counts and a scene hash. These are debugging/evidence fields, not a cryptographic identity certificate.
- No advertising or analytics SDK is included. Supplier links open independent sites with their own terms and data practices. The WORLDIFACT cost panel sends no quote request and makes no purchase.

Release review still required: confirm operator contact, hosting logs/settings and the provider project configuration. This draft makes no regulatory compliance claim.
