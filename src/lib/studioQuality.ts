import type { GLBInspection } from './glb.ts'
import { INDUSTRIAL_ELECTRICAL_PROFILE, REFERENCE_CHARACTER_PROFILE, TEXT_CHARACTER_DETAIL_PROFILE, ROBOT_DETAIL_PROFILE, type StudioQualityProfile } from './studioProtocol.ts'

/** Structural acceptance only. This deliberately does not claim visual likeness,
 * electrical correctness, rig quality or manufacturing readiness. */
export function passesStudioStructuralQuality(model: GLBInspection, qualityProfile: StudioQualityProfile): boolean {
  const base = model.meshCount > 0 && model.triangles > 0 && model.renderedTriangles > 0 && model.materialCount > 0
  if (!base) return false
  if (qualityProfile === INDUSTRIAL_ELECTRICAL_PROFILE) {
    // Reject a cabinet shell + photographed interior plane / sparse placeholder.
    return model.renderedTriangles >= 20_000 &&
      model.meshCount >= 8 &&
      model.substantialMeshCount >= 6 &&
      model.primitiveCount >= 8 &&
      model.materialCount >= 3 &&
      model.nodeCount >= 8
  }
  if (qualityProfile === REFERENCE_CHARACTER_PROFILE) {
    // Reject cutouts / extremely sparse proxy people. Human visual QA remains required.
    return model.renderedTriangles >= 25_000 &&
      model.meshCount >= 5 &&
      model.substantialMeshCount >= 4 &&
      model.primitiveCount >= 5 &&
      model.materialCount >= 3 &&
      model.nodeCount >= 5
  }
  if (qualityProfile === TEXT_CHARACTER_DETAIL_PROFILE) {
    // A low-poly cube/person marker is not a plausible detailed character.
    // This is a minimum structural screen, not anatomy or likeness review.
    return model.renderedTriangles >= 20_000 &&
      model.meshCount >= 5 && model.primitiveCount >= 5 &&
      model.substantialMeshCount >= 4 && model.materialCount >= 3 && model.nodeCount >= 5
  }
  if (qualityProfile === ROBOT_DETAIL_PROFILE) {
    // Require separate articulated/armored source parts, not a textured prism.
    return model.renderedTriangles >= 16_000 &&
      model.meshCount >= 7 && model.primitiveCount >= 7 &&
      model.substantialMeshCount >= 6 && model.materialCount >= 3 && model.nodeCount >= 7
  }
  return true
}
