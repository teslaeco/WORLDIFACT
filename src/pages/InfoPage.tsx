import { Link } from "react-router-dom";

export default function InfoPage({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <main className="info-page">
      <Link to="/">← Back to the valley</Link>
      <span className="eyebrow">WORLDIFACT · TERRAFORMING PLANET</span>
      <h1>{kind === "privacy" ? "Privacy and your data" : "Preview terms"}</h1>
      <p>Updated 22 September 2026. WORLDIFACT is an early playable prototype.</p>
      {kind === "privacy" ? <>
        <h2>Your shared account</h2>
        <p>WORLDIFACT reuses the existing Chess Cube Supabase account. Email, display name and credentials are processed by that identity provider; WORLDIFACT does not create a second password database. Sign-in tokens are kept in Secure, HttpOnly cookies. Account UUIDs link server-side generation allowances, job ownership and payment receipts. Successful email sign-in shares your identity across WORLDIFACT routes and the copied Chess app; separately hosted originals keep their own sessions.</p>
        <h2>Files and saved worlds</h2>
        <p>The WORLDIFACT scene editor and manufacturing model viewer read your GLB on your device. It does not upload that model. Up to 30 saved scene blueprints are stored in this browser. Export a blueprint before clearing your browser’s site data; clearing it removes the device archive. This local scene archive has no account or cloud backup.</p>
        <h2>Connected applications</h2>
        <p>The portals reuse our existing Chess, ISS, Terra, FORGE shop, World Builder and Froge studio. The shop, World Builder and studio currently load from their original public addresses; those services receive normal browser requests and retain their own sign-in, storage and backend connections. Chess offers guest play and the shared account in its WORLDIFACT copy. ISS retains manual JSON progress export. Terra loads published evidence and external observation sources; check their dates and notices in that application.</p>
        <h2>Optional AI generation</h2>
        <p>DEMO runs local rules and does not analyze reference images. If you choose enabled LIVE generation, your prompt and optional image are sent through our server to OpenAI. Submit only material you have permission to use. Do not include sensitive personal information.</p>
        <p>The server requests that Responses are not stored as application history. This does not mean OpenAI or the hosting provider retains no operational or safety data. Their policies and the operator’s account settings also apply.</p>
        <p>Preview access codes stay in page memory and are sent only to this site’s generation endpoint. Saved results may include a response identifier, timestamp, scene fingerprint and token counts; they exclude the access code and reference image.</p>
        <h2>Service operation</h2>
        <p>The hosting service processes network information, including IP addresses used for rate limiting. A server-side counter records how many generation attempts have been reserved for operational telemetry and duplicate-submit protection, without prompts, images or IP addresses. Separate per-account records enforce free generation limits, credit debits and refunds. These records contain account IDs and job IDs; they do not copy passwords or prompts. When enabled, checkout is processed by Stripe (cards and eligible Google Pay wallets) or PayPal. The selected provider receives payment details; Stripe also receives the account email for its customer record. WORLDIFACT keeps payment references and credit-ledger entries, but does not collect full card numbers or store the seller’s bank account details. WORLDIFACT includes no advertising or analytics SDK.</p>
        <p><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer">OpenAI privacy policy ↗</a></p>
        <h2>Contact</h2>
        <p>The project is maintained by Terraforming Planet. Use the <a href="https://github.com/teslaeco/WORLDIFACT/issues" target="_blank" rel="noreferrer">project issue tracker</a> for non-sensitive support. Do not post private files or personal information in public issues. A private operator contact must be confirmed before public LIVE activation.</p>
      </> : <>
        <h2>What the preview provides</h2>
        <p>You can explore procedural worlds, edit scene objects and export a GAME GLB or blueprint. Astra produces a structured scene specification; it does not reconstruct an arbitrary reference as a finished high-detail mesh. Exported geometry does not include the game’s controller code.</p>
        <h2>GAME and MAKE</h2>
        <p>A GAME export is not approval for physical production. MAKE candidates require checks for dimensions, walls, joints, materials, color and the selected supplier’s process. Prices are preliminary observations or clearly labelled assumptions. This site does not place manufacturing orders. AI membership and credit payments are a separate feature and are offered only when a configured, verified checkout is available.</p>
        <h2>Content and licences</h2>
        <p>Use only references and models you are entitled to use. The repository’s MIT licence covers its source and procedural code. It does not grant rights to imported photographs, characters, trademarks or third-party assets. Linked projects retain their own terms.</p>
        <h2>Availability and access</h2>
        <p>LIVE preview generation is subject to operational rate limits, input limits, provider availability and abuse protection. Free accounts receive two FAST generations in a rolling 24-hour period and one SLOW generation per UTC day. FAST draft downloads are included; SLOW downloads require an active subscription. Credit-funded generation costs 50 credits. Membership costs $29.99 USD per month and renews monthly until cancelled. Each paid month grants 1,500 credits (30 generations); one-time packs add 1,500 credits for $30 USD and do not require or activate a subscription. A credit pack alone does not unlock SLOW downloads. Packs have no automatic renewal. Monthly membership checkout remains unavailable until its payment configuration is complete. The amount and any renewal period are shown before checkout. No payment is inferred from a return URL; only server-verified provider payment data changes the balance. Refunded or disputed purchases can have their associated credit grant removed and require account review; repeated events never add or remove the same grant twice. Confirmed generation failures restore the consumed allowance or credits. Uncertain jobs remain reserved pending reconciliation to prevent double generation or billing. SLOW image previews are not yet available for free accounts; the generated result is retained without transferring the protected model file. Keep exported copies of important work. DEMO remains available when live generation is unavailable.</p>
        <p>These preview notes do not establish a manufacturing contract or promise production approval, fidelity, uptime or physical safety.</p>
      </>}
    </main>
  );
}
