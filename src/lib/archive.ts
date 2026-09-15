import { validateGenerationResult } from "./blueprint.ts";
import type { GenerationResult } from "./blueprint.ts";
export interface ArchivedWorld {
  id: string;
  createdAt: string;
  result: GenerationResult;
}
const KEY = "worldifact.worlds.v1";
function archivedWorld(value: unknown): value is ArchivedWorld {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).length !== 3 ||
    !["id", "createdAt", "result"].every((key) => Object.hasOwn(item, key)) ||
    typeof item.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      item.id,
    ) ||
    typeof item.createdAt !== "string"
  )
    return false;
  try {
    if (new Date(item.createdAt).toISOString() !== item.createdAt) return false;
    validateGenerationResult(item.result);
    return true;
  } catch {
    return false;
  }
}
export function readArchive(
  storage?: Pick<Storage, "getItem">,
): ArchivedWorld[] {
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(archivedWorld).slice(0, 30);
  } catch {
    return [];
  }
}
export function saveArchive(
  result: GenerationResult,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  validateGenerationResult(result);
  const item: ArchivedWorld = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    result,
  };
  const items = [item, ...readArchive(storage)].slice(0, 30);
  storage.setItem(KEY, JSON.stringify(items));
  return items;
}
