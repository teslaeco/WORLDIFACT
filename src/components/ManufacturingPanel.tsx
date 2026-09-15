import LocalModelReview from "./LocalModelReview";
import { useState } from "react";
import {
  estimateCost,
  OBSERVED_QUOTES,
  OBSERVED_BATCH_QUOTES,
  PRODUCTION_PROFILES,
  SUPPLIERS,
} from "../lib/manufacturing";
function boundedInput(value: string, minimum = 0, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : minimum;
}
export default function ManufacturingPanel() {
  const [supplier, setSupplier] = useState("JLC3DP"),
    [material, setMaterial] = useState("SLA resin"),
    [color, setColor] = useState("Single material color");
  const [size, setSize] = useState(100),
    [mass, setMass] = useState(40),
    [rate, setRate] = useState(0),
    [finish, setFinish] = useState(0),
    [setup, setSetup] = useState(0),
    [shipping, setShipping] = useState(0),
    [currency, setCurrency] = useState("EUR");
  const [detail, setDetail] = useState("Standard");
  const cost = (qty: number) =>
    estimateCost({
      baseMassG: mass,
      baseSizeMm: 100,
      sizeMm: size,
      quantity: qty,
      ratePerKg: rate,
      setup,
      finishPerPart: finish,
      shipping,
      wastePercent: 0,
    });
  return (
    <>
      <LocalModelReview />
      <div className="supplier-grid">
        {SUPPLIERS.map((s) => (
          <article key={s.name}>
            <span className="eyebrow">EXISTING B2B CONTACT</span>
            <h2>{s.name}</h2>
            <p>{s.status}</p>
            <p className="muted">{s.materials}</p>
            <small>{s.note}</small>
            <p>
              <a href={s.url} target="_blank" rel="noreferrer">
                Supplier information / quote ↗
              </a>
            </p>
          </article>
        ))}
      </div>
      <section className="cost-workbench">
        <div className="section-heading">
          <h2>First supplier comparison</h2>
          <span className="pill">JLC3DP · PRELIMINARY CALCULATOR PRICES</span>
        </div>
        <p>
          Observed 14 September 2026 UTC: one older Queen model, scaled to 100
          mm, quantity 1. The mesh still needs repair and engineering review.
          Prices may change after review.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Process / material</th>
                <th>Color</th>
                <th>Finish</th>
                <th>Part · USD</th>
                <th>vs white resin</th>
              </tr>
            </thead>
            <tbody>
              {OBSERVED_QUOTES.map((q) => (
                <tr key={q.process}>
                  <td>{q.process}</td>
                  <td>{q.color}</td>
                  <td>{q.finish}</td>
                  <td>${q.usd.toFixed(2)}</td>
                  <td>{(q.usd / 2.72).toFixed(2)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="result-note">
          *The uploaded STL contains geometry only. The WJP price tests a
          process; it does not validate textured color output. White and black
          use different resin products, so this is not a pure color surcharge.
        </p>
        <small>
          Shipping destination, tax, duties, 200 mm variants and bulk discounts
          remain unverified. Sculpteo pricing is blocked by human verification.
          No order was submitted.
        </small>
      </section>
      <section className="cost-workbench">
        <div className="section-heading"><h2>Size and batch evidence</h2><span className="pill">OBSERVED · NOT PRODUCTION APPROVAL</span></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Model</th><th>Process</th><th>Parts</th><th>Batch · USD</th><th>Per part · USD</th><th>Evidence</th></tr></thead>
          <tbody>{OBSERVED_BATCH_QUOTES.map((quote) => <tr key={`${quote.model}-${quote.quantity}`}>
            <td>{quote.model}</td><td>{quote.process}</td><td>{quote.quantity}</td><td>${quote.totalUsd.toFixed(2)}</td><td>${(quote.totalUsd / quote.quantity).toFixed(2)}</td><td>{quote.evidence}</td>
          </tr>)}</tbody>
        </table></div>
        <p>The ten-part Queen calculation shows no unit discount. The ISS quote is for a different model and process; it is not a size multiplier. Neither calculation includes verified shipping, taxes or an approved production mesh.</p>
        <p>ISS geometry audit: 27/27 parts remain open after conservative cleanup. Its nominal 370 mm source and the supplier screenshot have different reported bounds; reconcile the exact file and orientation before ordering.</p>
      </section>
      <section className="cost-workbench">
        <div className="section-heading">
          <h2>Cost scenarios</h2>
          <span className="pill">ASSUMPTIONS · NOT A SUPPLIER QUOTE</span>
        </div>
        <p>
          Both current suppliers price individual models and do not offer the
          requested manufacturing tariff per kg. This generic calculator is for
          your own assumptions or another verified rate. Defaults are only a 40
          g example at 100 mm; all prices start empty (0). No shipping, tax,
          minimum order or support charge is inferred.
        </p>
        <div className="cost-inputs">
          <label>
            Supplier
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              {SUPPLIERS.map((s) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Material / process
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              {[
                "SLA resin",
                "FDM PLA",
                "SLS / MJF nylon",
                "WJP full-color resin",
                "316L steel",
                "Titanium",
                "Wood / laser candidate",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Color process
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              {[
                "Single material color",
                "Dyed single color",
                "Multiple filament colors",
                "Full texture color",
                "Hand painting",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Detail target
            <select value={detail} onChange={(e) => setDetail(e.target.value)}>
              <option>Standard</option>
              <option>Fine facial details</option>
              <option>Thin mechanical features</option>
            </select>
          </label>
          <label>
            Largest dimension · mm
            <input
              type="number"
              min="10"
              max="500"
              value={size}
              onChange={(e) =>
                setSize(boundedInput(e.target.value, 10, 500))
              }
            />
          </label>
          <label>
            Measured mass at 100 mm · g
            <input
              type="number"
              min="0"
              value={mass}
              onChange={(e) => setMass(boundedInput(e.target.value))}
            />
          </label>
          <label>
            Quote currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option>EUR</option>
              <option>USD</option>
              <option>PLN</option>
            </select>
          </label>
          <label>
            Assumed production rate / kg
            <input
              type="number"
              min="0"
              value={rate}
              onChange={(e) => setRate(boundedInput(e.target.value))}
            />
          </label>
          <label>
            Finishing / part
            <input
              type="number"
              min="0"
              value={finish}
              onChange={(e) => setFinish(boundedInput(e.target.value))}
            />
          </label>
          <label>
            Setup / batch
            <input
              type="number"
              min="0"
              value={setup}
              onChange={(e) => setSetup(boundedInput(e.target.value))}
            />
          </label>
          <label>
            Shipping / batch
            <input
              type="number"
              min="0"
              value={shipping}
              onChange={(e) => setShipping(boundedInput(e.target.value))}
            />
          </label>
        </div>
        <p className="result-note">
          {supplier} · {material} · {color} · {detail}. Selecting these labels
          does not fetch a quote or guarantee this combination is available.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Parts</th>
                <th>Mass / part*</th>
                <th>Batch mass*</th>
                <th>Estimated batch</th>
                <th>Per part</th>
              </tr>
            </thead>
            <tbody>
              {[1, 10, 100].map((q) => {
                const c = cost(q);
                return (
                  <tr key={q}>
                    <td>{q}</td>
                    <td>{c.massG.toFixed(1)} g</td>
                    <td>{c.billableKg.toFixed(3)} kg</td>
                    <td>
                      {rate > 0
                        ? `${c.total.toFixed(2)} ${currency}`
                        : "Quote required"}
                    </td>
                    <td>
                      {rate > 0 ? `${c.unit.toFixed(2)} ${currency}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <small>
          *Solid-volume scaling: mass changes with size cubed. A 200 mm copy
          uses 8× the volume of a 100 mm copy. Hollow parts, fixed walls and
          supports require fresh measurements. Detail and color costs must come
          from a quote; we do not invent multipliers.
        </small>
      </section>
      <section className="cost-workbench">
        <div className="section-heading">
          <h2>Material and production profiles</h2>
          <span className="pill">DOCUMENTED LIMITS · SCREENING ONLY</span>
        </div>
        <p>
          Compare the process before changing a model. Wall, detail and
          clearance requirements are not interchangeable between white resin,
          full-color resin, nylon and metal.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier / process</th>
                <th>Color</th>
                <th>Reference</th>
                <th>Wall target</th>
                <th>Detail / clearance</th>
                <th>Observed part price</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTION_PROFILES.map((profile) => (
                <tr key={`${profile.supplier}-${profile.process}`}>
                  <td>
                    <strong>{profile.supplier}</strong>
                    <br />
                    <a href={profile.sourceUrl} target="_blank" rel="noreferrer">
                      {profile.process} ↗
                    </a>
                    <br />
                    <small>{profile.suitability}</small>
                  </td>
                  <td>{profile.color}</td>
                  <td>{profile.referenceSizeMm} mm</td>
                  <td>{profile.wallTarget}</td>
                  <td>
                    {profile.detailTarget}
                    <br />
                    <small>{profile.assemblyClearance}</small>
                  </td>
                  <td>
                    {profile.observedUsd === null
                      ? profile.quoteStatus
                      : `$${profile.observedUsd.toFixed(2)}*`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>
          *Observed only for one legacy Queen STL at 100 mm and quantity 1 on
          14 September 2026 UTC. Profile requirements come from supplier
          documentation; passing them does not approve a mesh or a product.
        </small>
      </section>
      <section>
        <h2>Every MAKE candidate needs a production revision</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Required work before production</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Julie</td>
                <td>
                  Recover current GLB/Blender; inspect face, teeth, neck,
                  fingers, garment seams and base.
                </td>
                <td>BLOCKED · original missing</td>
              </tr>
              <tr>
                <td>Queen of Neptune</td>
                <td>
                  Use current source; repair connected clothing, 6-blade fan,
                  fingers and hair; verify thickness at intended scale.
                </td>
                <td>VALIDATION REQUIRED</td>
              </tr>
              <tr>
                <td>ISS · 100 mm span</td>
                <td>
                  Split panels/truss into printable modules, reinforce fragile
                  struts, plan support and assembly.
                </td>
                <td>27 OPEN PARTS · NOT PRINT READY</td>
              </tr>
              <tr>
                <td>Wooden polyhedron</td>
                <td>
                  Confirm exact face topology and dimensions from references,
                  close mesh, design joints per process.
                </td>
                <td>ORIGINAL REQUIRED</td>
              </tr>
              <tr>
                <td>Generated game assets</td>
                <td>
                  Union/intersection review, normals, walls, clearance, units,
                  orientation, color packaging and supplier approval.
                </td>
                <td>GAME ≠ MAKE approval</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
