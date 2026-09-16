export const KINDS = [
  "rover",
  "habitat",
  "tree",
  "solar-array",
  "rock",
  "sculpture",
] as const;
export type AssetKind = (typeof KINDS)[number];
export interface WorldObject {
  id: string;
  name: string;
  kind: AssetKind;
  x: number;
  z: number;
  scale: number;
  rotation: number;
  color: string;
}
export interface WorldBlueprint {
  version: 1;
  title: string;
  biome: "valley" | "lunar" | "ocean";
  objects: WorldObject[];
}
export interface AssetSpec {
  version: 1;
  name: string;
  summary: string;
  game: {
    geometry: "procedural-spec";
    materialPlan: string;
    animationPlan: string;
    gameplayRole: string;
  };
  make: {
    validationStatus: "validation-required";
    dimensionsMm: { x: number; y: number; z: number };
    materialCandidate: string;
    processCandidate: "3d-print" | "cnc" | "laser" | "assembly" | "unknown";
    constraints: string[];
  };
}
export interface GenerationResult {
  mode: "LIVE" | "DEMO";
  provenance: "GENERATED" | "MOCK";
  blueprint: WorldBlueprint;
  assetSpec?: AssetSpec;
  requestId: string;
  model: string | null;
  limitation: string;
  evidence?: GenerationEvidence;
}
export interface GenerationEvidence {
  providerResponseId: string;
  receivedAt: string;
  blueprintSha256: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}
export const MAX_BLUEPRINT_BYTES = 100_000;
const number = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
const shortText = { type: "string", minLength: 1, maxLength: 200 };
export const blueprintSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "biome", "objects"],
  properties: {
    version: { type: "integer", enum: [1] },
    title: { type: "string", minLength: 1, maxLength: 80 },
    biome: { type: "string", enum: ["valley", "lunar", "ocean"] },
    objects: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "kind", "x", "z", "scale", "rotation", "color"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,40}$" },
          name: { type: "string", minLength: 1, maxLength: 60 },
          kind: { type: "string", enum: KINDS },
          x: number(-35, 35), z: number(-35, 35), scale: number(0.4, 3), rotation: number(0, 360),
          color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        },
      },
    },
  },
};
export const assetSpecSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "name", "summary", "game", "make"],
  properties: {
    version: { type: "integer", enum: [1] },
    name: { type: "string", minLength: 1, maxLength: 80 },
    summary: { type: "string", minLength: 1, maxLength: 240 },
    game: {
      type: "object", additionalProperties: false,
      required: ["geometry", "materialPlan", "animationPlan", "gameplayRole"],
      properties: {
        geometry: { type: "string", enum: ["procedural-spec"] },
        materialPlan: shortText, animationPlan: shortText, gameplayRole: shortText,
      },
    },
    make: {
      type: "object", additionalProperties: false,
      required: ["validationStatus", "dimensionsMm", "materialCandidate", "processCandidate", "constraints"],
      properties: {
        validationStatus: { type: "string", enum: ["validation-required"] },
        dimensionsMm: {
          type: "object", additionalProperties: false, required: ["x", "y", "z"],
          properties: { x: number(1, 5000), y: number(1, 5000), z: number(1, 5000) },
        },
        materialCandidate: { type: "string", minLength: 1, maxLength: 100 },
        processCandidate: { type: "string", enum: ["3d-print", "cnc", "laser", "assembly", "unknown"] },
        constraints: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 1, maxLength: 160 } },
      },
    },
  },
};
export const astraGenerationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["blueprint", "assetSpec"],
  properties: { blueprint: blueprintSchema, assetSpec: assetSpecSchema },
};
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function exact(v: Record<string, unknown>, keys: string[]) { return Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)); }
function bounded(v: unknown, lo: number, hi: number): v is number { return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi; }
function text(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max && Array.from(v).every((c) => c.charCodeAt(0) >= 32);
}
export function validateBlueprint(value: unknown): WorldBlueprint {
  if (!record(value) || !exact(value, ["version", "title", "biome", "objects"]) || value.version !== 1 ||
      !text(value.title, 80) || !["valley", "lunar", "ocean"].includes(String(value.biome)) ||
      !Array.isArray(value.objects) || value.objects.length < 1 || value.objects.length > 24)
    throw new Error("Invalid world blueprint");
  const ids = new Set<string>();
  for (const o of value.objects) {
    if (!record(o) || !exact(o, ["id", "name", "kind", "x", "z", "scale", "rotation", "color"]) ||
        typeof o.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(o.id) || ids.has(o.id) || !text(o.name, 60) ||
        !KINDS.includes(o.kind as AssetKind) || !bounded(o.x, -35, 35) || !bounded(o.z, -35, 35) ||
        !bounded(o.scale, 0.4, 3) || !bounded(o.rotation, 0, 360) || typeof o.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(o.color))
      throw new Error("Invalid world object");
    ids.add(o.id);
  }
  return value as unknown as WorldBlueprint;
}
export function validateAssetSpec(value: unknown): AssetSpec {
  if (!record(value) || !exact(value, ["version", "name", "summary", "game", "make"]) || value.version !== 1 ||
      !text(value.name, 80) || !text(value.summary, 240) || !record(value.game) || !record(value.make))
    throw new Error("Invalid asset spec");
  const game = value.game, make = value.make;
  if (!exact(game, ["geometry", "materialPlan", "animationPlan", "gameplayRole"]) || game.geometry !== "procedural-spec" ||
      !text(game.materialPlan, 200) || !text(game.animationPlan, 200) || !text(game.gameplayRole, 200))
    throw new Error("Invalid GAME plan");
  if (!exact(make, ["validationStatus", "dimensionsMm", "materialCandidate", "processCandidate", "constraints"]) ||
      make.validationStatus !== "validation-required" || !record(make.dimensionsMm) ||
      !exact(make.dimensionsMm, ["x", "y", "z"]) || !bounded(make.dimensionsMm.x, 1, 5000) ||
      !bounded(make.dimensionsMm.y, 1, 5000) || !bounded(make.dimensionsMm.z, 1, 5000) ||
      !text(make.materialCandidate, 100) || !["3d-print", "cnc", "laser", "assembly", "unknown"].includes(String(make.processCandidate)) ||
      !Array.isArray(make.constraints) || make.constraints.length < 1 || make.constraints.length > 6 ||
      !make.constraints.every((v) => text(v, 160))) throw new Error("Invalid MAKE plan");
  return value as unknown as AssetSpec;
}
export function validateGenerationResult(value: unknown): GenerationResult {
  if (!record(value) || !exact(value, ["mode", "provenance", "blueprint", ...(Object.hasOwn(value, "assetSpec") ? ["assetSpec"] : []), "requestId", "model", "limitation", ...(Object.hasOwn(value, "evidence") ? ["evidence"] : [])]) ||
      !text(value.requestId, 200) || !text(value.limitation, 500)) throw new Error("Invalid generation result");
  validateBlueprint(value.blueprint);
  const demo = value.mode === "DEMO" && value.provenance === "MOCK" && value.model === null;
  const live = value.mode === "LIVE" && value.provenance === "GENERATED" && value.model === "gpt-6-astra";
  if (!demo && !live) throw new Error("Invalid generation provenance");
  if (live && !Object.hasOwn(value, "assetSpec")) throw new Error("LIVE generation requires AssetSpec");
  if (Object.hasOwn(value, "assetSpec")) validateAssetSpec(value.assetSpec);
  if (Object.hasOwn(value, "evidence")) {
    const evidence = value.evidence;
    if (!live || !record(evidence) || !exact(evidence, ["providerResponseId", "receivedAt", "blueprintSha256", "inputTokens", "outputTokens", "totalTokens"]) ||
        typeof evidence.providerResponseId !== "string" || !/^resp_[a-zA-Z0-9_-]{1,190}$/.test(evidence.providerResponseId) ||
        typeof evidence.receivedAt !== "string" || !Number.isFinite(Date.parse(evidence.receivedAt)) || new Date(evidence.receivedAt).toISOString() !== evidence.receivedAt ||
        typeof evidence.blueprintSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.blueprintSha256)) throw new Error("Invalid generation evidence");
    const tokens = [evidence.inputTokens, evidence.outputTokens, evidence.totalTokens];
    if (!tokens.every((n) => n === null) && !(tokens.every((n) => bounded(n, 0, 10_000_000) && Number.isSafeInteger(n)) &&
        evidence.totalTokens === Number(evidence.inputTokens) + Number(evidence.outputTokens))) throw new Error("Invalid generation usage");
  }
  return value as unknown as GenerationResult;
}
export function parseBlueprintJson(textValue: string): WorldBlueprint {
  if (new TextEncoder().encode(textValue).byteLength > MAX_BLUEPRINT_BYTES) throw new Error("Blueprint file is too large");
  try { return validateBlueprint(JSON.parse(textValue)); } catch (error) {
    if (error instanceof Error && error.message === "Blueprint file is too large") throw error;
    throw new Error("Blueprint file is invalid");
  }
}
export function assetSpecForBlueprint(blueprint: WorldBlueprint): AssetSpec {
  validateBlueprint(blueprint);
  const focus = blueprint.objects[0];
  const mm = Math.max(100, Math.round(focus.scale * 500));
  return validateAssetSpec({
    version: 1,
    name: focus.name,
    summary: `Concept specification derived from the ${blueprint.title} scene.`,
    game: {
      geometry: "procedural-spec",
      materialPlan: `Use ${focus.color} as the primary material color; tune PBR values in the game pipeline.`,
      animationPlan: focus.kind === "rover" ? "Wheel and steering animation candidate; rigging not exported by the procedural preview." : "Static by default; animation requires a reviewed rig or interaction plan.",
      gameplayRole: `Use as a ${focus.kind} in the playable WORLDIFACT scene.`,
    },
    make: {
      validationStatus: "validation-required",
      dimensionsMm: { x: mm, y: mm, z: mm },
      materialCandidate: "Material to be selected after geometry and process review",
      processCandidate: "unknown",
      constraints: ["Verify scale and units", "Validate closed/manifold geometry", "Validate wall thickness and process tolerances"],
    },
  });
}
export function localSceneResult(blueprint: WorldBlueprint, limitation = "Locally composed procedural scene. Manufacturing validation is required."): GenerationResult {
  validateBlueprint(blueprint);
  return validateGenerationResult({ mode: "DEMO", provenance: "MOCK", blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: crypto.randomUUID(), model: null, limitation });
}
export function meadowBlueprint(): WorldBlueprint {
  return validateBlueprint({ version: 1, title: "Riverlight meadow", biome: "valley", objects: [
    { id: "rover-1", kind: "rover", name: "Photovoltaic explorer", x: 6, z: 13, scale: 1, rotation: 20, color: "#1e3c59" },
  ] });
}
export function demoBlueprint(prompt = ""): WorldBlueprint {
  const q = prompt.toLowerCase();
  const biome = /moon|lunar|księżyc/.test(q) ? "lunar" : /ocean|neptun/.test(q) ? "ocean" : "valley";
  const objects: WorldObject[] = [
    { id: "habitat-1", name: "River workshop", kind: "habitat", x: -9, z: 9, scale: 1, rotation: 0, color: "#ead5a7" },
    { id: "rover-1", name: "Solar rover", kind: "rover", x: 3, z: 12, scale: 1, rotation: 20, color: "#f4b34f" },
    { id: "array-1", name: "Community solar array", kind: "solar-array", x: -15, z: 14, scale: 1, rotation: 0, color: "#344fb4" },
    { id: "habitat-2", name: "Maker cabin", kind: "habitat", x: 13, z: 7, scale: 0.85, rotation: 330, color: "#a8ccbc" },
  ];
  if (/town|village|miastecz|osiedl/.test(q)) for (let i = 0; i < 4; i++) objects.push({ id: `village-${i}`, name: `Valley home ${i + 1}`, kind: "habitat", x: -18 + i * 12, z: -17, scale: 0.8, rotation: 180, color: ["#e3b982", "#c6bdde", "#a7cdd0", "#d4c89f"][i] });
  if (/red|czerw/.test(q)) objects.find((o) => o.kind === "rover")!.color = "#e85e55";
  if (/blue|niebies/.test(q)) objects.find((o) => o.kind === "rover")!.color = "#549fed";
  if (/forest|las|tree|drzew/.test(q)) for (let i = 0; i < 6; i++) objects.push({ id: `tree-${i}`, name: `Restored tree ${i + 1}`, kind: "tree", x: -23 + i * 8, z: 25, scale: 0.9, rotation: 0, color: "#387947" });
  if (/usu[nń]|bez dom|no houses|remove.*house|open meadow/.test(q)) return validateBlueprint({ ...meadowBlueprint(), biome, objects: objects.filter(o => o.kind !== "habitat" && o.kind !== "solar-array") });
  return validateBlueprint({ version: 1, title: biome === "lunar" ? "Moon workshop" : "Riverlight village", biome, objects });
}
