import type { AssetRecord } from '../types/worldifact'

const manufacturabilityChecks = [
  'Correct scale and units',
  'Minimum wall thickness',
  'Closed and manifold geometry',
  'Connected components',
  'Selected process suitability (3D print, CNC, laser)',
]

interface AssetWorkflowPanelProps {
  assets: AssetRecord[]
}

export default function AssetWorkflowPanel({ assets }: AssetWorkflowPanelProps) {
  return (
    <section aria-label="GAME and MAKE workflow" className="workflow-panel">
      <h2>GAME / MAKE workflow</h2>
      <p>
        Rendering quality is not enough for production. MAKE targets require process-specific review before any
        fabrication claim.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Target</th>
              <th>Readiness</th>
              <th>Format / notes</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{asset.target}</td>
                <td>{asset.readiness}</td>
                <td>
                  <strong>{asset.format}</strong> — {asset.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Manufacturability checks required for MAKE</h3>
      <ul>
        {manufacturabilityChecks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>
    </section>
  )
}
