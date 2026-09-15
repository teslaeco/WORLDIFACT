# Platform connections — 15 September 2026

The control centre is `/control`. It is a navigation and connection-diagnostics foundation, **not a unified five-application editor**. Original applications and owner data remain intact. No paid generation or Oracle job is authorized.

## What is connected

| Component | Evidence | Remaining gate |
|---|---|---|
| Cloudflare | WORLDIFACT Worker deployment pipeline and runtime status endpoint | New release must pass exact asset/route integrity checks |
| OpenAI | Existing release verified model metadata and synchronized the Worker key | Paid generation remains disabled; no live generation evidence |
| Oracle | Public Froge source provides authenticated `/v1/health`, pairing and Blender job APIs | Current endpoint and authorized connector credential are absent in WORLDIFACT; no live health or renderer verification |
| Chess | Original public host retained; GitHub source editor linked | Source edit/publish is through its own authenticated repository |
| ISS / Terra | Copied, pinned application sources and assets | Source changes through GitHub; station saves remain local/manual |
| Planets | Original public FORGE World Builder connected | Owner identity, D1 worlds/assets, R2 and encrypted Oracle pairing remain on the original host |
| Shop | Original public shop connected | Current authorized source export and owner catalog/storage migration still unavailable |
| Studio | Original public Froge Studio connected; public repository confirmed | GitHub v18 is not proof of parity with Sites v47; do not replace the current app blindly |

Froge source inspected: `teslaeco/Froge-MPC-2-test` main `bac2827fc1ec31e71dc0f5c586df43c507338725` (Astra v18 reference reconstruction). The repository includes a Worker, D1 commerce, private R2 models and owner-bound AES-GCM connection credentials. A static HTML copy cannot preserve these services. Public source does not grant anonymous write access.

## Configure owner diagnostics

Use the existing GitHub **production** environment. The release workflow synchronizes these optional secrets through stdin; it never prints their values:

- `OWNER_ACCESS_TOKEN`: a separate random owner code, 32–256 letters, digits, `_` or `-`. Do not reuse an OpenAI key, Cloudflare token or the paid-generation access code. Keep it in a password manager. Enter it only in the password field on WORLDIFACT `/control`.
- `ORACLE_ENDPOINT` and `ORACLE_API_TOKEN`: supply both together only when an authorized connector credential and its current HTTPS Quick Tunnel origin are available. The API token is **not** the 32-character pairing code. Do not extract encrypted credentials from the existing Site or invent owner headers.

If only a pairing code is available, keep using the original signed-in Studio settings. WORLDIFACT does not yet implement the owner's login/pairing/storage migration. The existing installer documents `python3 ~/froge-connector/server.py --pair-info` for the current tunnel and pairing code; do not reinstall or reset the VM.

Absent optional secrets are not deleted or guessed. The public status endpoint reports configuration only, never secret values or the Oracle address. Owner checks require strict same-origin requests, constant-time code comparison and a server rate limiter. They call only OpenAI model metadata and Oracle health using GET, reject redirects and bound response size/time. A ready health response is not a successful Blender render. No `/responses`, `/jobs` or provider-switch request is made.

## Next integration work

1. Establish the owner authentication system for WORLDIFACT; do not trust client-supplied Sites identity headers on a public Worker.
2. Obtain authorized current Shop/Studio source exports and confirm exact versions. Earlier ownership-denied archives remain blocked.
3. Migrate schemas and owner data with backups, access checks and rollback before changing original hosts. Preserve private files and encryption keys.
4. Add a real owner-scoped scene/catalog editor backed by D1/R2 and version conflict handling. GitHub source-editor links are navigation, not embedded page-editing APIs.
5. Pair the existing Oracle service through that owner identity, verify health and capabilities; retain the no-paid gate.
6. Test authenticated save/reload, anonymous write denial, original app rendering and phone controls when browser inspection is available. Current browser approval block remains in force.

No additional Oracle VM, database or storage bucket was provisioned in this change. Full-platform readiness remains incomplete until the identity, current-source and storage gates above are resolved.
