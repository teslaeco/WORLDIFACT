import { Link } from "react-router-dom";

export default function InfoPage({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <main className="info-page">
      <Link to="/">← Back to the valley</Link>
      <span className="eyebrow">WORLDIFACT · TERRAFORMING PLANET</span>
      <h1>{kind === "privacy" ? "Privacy and your data" : "Preview terms"}</h1>
      <p>Updated 15 September 2026. WORLDIFACT is an early playable prototype.</p>
      {kind === "privacy" ? <>
        <h2>Files and saved worlds</h2>
        <p>The WORLDIFACT scene editor and manufacturing model viewer read your GLB on your device. It does not upload that model. Up to 30 saved scene blueprints are stored in this browser. Export a blueprint before clearing your browser’s site data; clearing it removes the device archive. This local scene archive has no account or cloud backup.</p>
        <h2>Connected applications</h2>
        <p>The portals reuse our existing Chess, ISS, Terra, FORGE shop, World Builder and Froge studio. The shop, World Builder and studio currently load from their original public addresses; those services receive normal browser requests and retain their own sign-in, storage and backend connections. Chess opens in its existing guest mode. ISS retains manual JSON progress export. Terra loads published evidence and external observation sources; check their dates and notices in that application.</p>
        <h2>Optional AI generation</h2>
        <p>DEMO runs local rules and does not analyze reference images. If you choose enabled LIVE generation, your prompt and optional image are sent through our server to OpenAI. Submit only material you have permission to use. Do not include sensitive personal information.</p>
        <p>The server requests that Responses are not stored as application history. This does not mean OpenAI or the hosting provider retains no operational or safety data. Their policies and the operator’s account settings also apply.</p>
        <p>Preview access codes stay in page memory and are sent only to this site’s generation endpoint. Saved results may include a response identifier, timestamp, scene fingerprint and token counts; they exclude the access code and reference image.</p>
        <h2>Service operation</h2>
        <p>The hosting service processes network information, including IP addresses used for rate limiting. A server-side counter records how many generation attempts have been reserved for operational telemetry and duplicate-submit protection, without prompts, images or IP addresses. In ongoing LIVE mode this counter is not a cumulative customer quota. WORLDIFACT includes no advertising or analytics SDK.</p>
        <p><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer">OpenAI privacy policy ↗</a></p>
        <h2>Contact</h2>
        <p>The project is maintained by Terraforming Planet. Use the <a href="https://github.com/teslaeco/WORLDIFACT/issues" target="_blank" rel="noreferrer">project issue tracker</a> for non-sensitive support. Do not post private files or personal information in public issues. A private operator contact must be confirmed before public LIVE activation.</p>
      </> : <>
        <h2>What the preview provides</h2>
        <p>You can explore procedural worlds, edit scene objects and export a GAME GLB or blueprint. Astra produces a structured scene specification; it does not reconstruct an arbitrary reference as a finished high-detail mesh. Exported geometry does not include the game’s controller code.</p>
        <h2>GAME and MAKE</h2>
        <p>A GAME export is not approval for physical production. MAKE candidates require checks for dimensions, walls, joints, materials, color and the selected supplier’s process. Prices are preliminary observations or clearly labelled assumptions. This site does not place manufacturing orders or collect payments.</p>
        <h2>Content and licences</h2>
        <p>Use only references and models you are entitled to use. The repository’s MIT licence covers its source and procedural code. It does not grant rights to imported photographs, characters, trademarks or third-party assets. Linked projects retain their own terms.</p>
        <h2>Availability and access</h2>
        <p>LIVE preview generation is subject to operational rate limits, input limits, provider availability and abuse protection. Ongoing LIVE mode has no application-level cumulative customer-attempt quota or launch-window expiry. Keep exported copies of important work. DEMO remains available when live generation is unavailable.</p>
        <p>These preview notes do not establish a manufacturing contract or promise production approval, fidelity, uptime or physical safety.</p>
      </>}
    </main>
  );
}
