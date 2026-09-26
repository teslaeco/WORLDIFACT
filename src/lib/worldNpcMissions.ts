export type MissionTask = "planting" | "building" | "carrying" | "surveying";

export type MissionPoint = { x: number; z: number };
export type MissionContext = {
  id: string;
  task: MissionTask;
  npc: MissionPoint;
  target: MissionPoint;
};

export type MissionState = {
  activeId: string | null;
  completedIds: readonly string[];
};

export type MissionInteraction = {
  missionId: string;
  task: MissionTask;
  kind: "accept" | "complete";
  label: string;
  hint: string;
};

const TASK = {
  planting: {
    accept: "Help plant trees",
    complete: "Plant sapling",
    objective: "Go to the marked restoration point and plant the sapling.",
    done: "Tree planted · GAME restoration task complete.",
  },
  building: {
    accept: "Help build",
    complete: "Assemble element",
    objective: "Go to the marked work point and assemble the simple field element.",
    done: "Field element assembled · GAME construction task complete.",
  },
  carrying: {
    accept: "Help carry materials",
    complete: "Deliver materials",
    objective: "Take the marked route and deliver the materials to the work point.",
    done: "Materials delivered · GAME logistics task complete.",
  },
  surveying: {
    accept: "Help survey",
    complete: "Record survey point",
    objective: "Go to the marked point and record the terrain survey.",
    done: "Survey point recorded · GAME field task complete.",
  },
} as const satisfies Record<MissionTask, { accept: string; complete: string; objective: string; done: string }>;

export function createMissionState(): MissionState {
  return { activeId: null, completedIds: [] };
}

function distance(a: MissionPoint, b: MissionPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function missionInteraction(
  contexts: readonly MissionContext[],
  state: MissionState,
  player: MissionPoint,
  npcRadius = 4.6,
  targetRadius = 5.2,
): MissionInteraction | null {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  if (state.activeId) {
    const active = contexts.find(item => item.id === state.activeId);
    if (!active) return null;
    if (distance(player, active.target) <= targetRadius) {
      return {
        missionId: active.id,
        task: active.task,
        kind: "complete",
        label: TASK[active.task].complete,
        hint: TASK[active.task].objective,
      };
    }
    return null;
  }
  const completed = new Set(state.completedIds);
  const nearest = contexts
    .filter(item => !completed.has(item.id) && distance(player, item.npc) <= npcRadius)
    .sort((a, b) => distance(player, a.npc) - distance(player, b.npc))[0];
  if (!nearest) return null;
  return {
    missionId: nearest.id,
    task: nearest.task,
    kind: "accept",
    label: TASK[nearest.task].accept,
    hint: TASK[nearest.task].objective,
  };
}

export function applyMissionInteraction(state: MissionState, interaction: MissionInteraction): MissionState {
  if (interaction.kind === "accept") {
    if (state.activeId || state.completedIds.includes(interaction.missionId)) return state;
    return { activeId: interaction.missionId, completedIds: [...state.completedIds] };
  }
  if (state.activeId !== interaction.missionId) return state;
  return {
    activeId: null,
    completedIds: state.completedIds.includes(interaction.missionId)
      ? [...state.completedIds]
      : [...state.completedIds, interaction.missionId],
  };
}

export function missionMessage(interaction: MissionInteraction) {
  return interaction.kind === "accept" ? TASK[interaction.task].objective : TASK[interaction.task].done;
}

export function missionStatus(contexts: readonly MissionContext[], state: MissionState) {
  const completed = state.completedIds.filter(id => contexts.some(item => item.id === id)).length;
  const total = contexts.length;
  if (state.activeId) {
    const active = contexts.find(item => item.id === state.activeId);
    if (active) return `Field mission · ${TASK[active.task].objective} · ${completed}/${total} complete`;
  }
  return completed === total && total > 0
    ? `Field missions complete · ${completed}/${total} · GAME`
    : `Field missions · ${completed}/${total} complete · talk to a Forge worker`;
}

export function missionTarget(contexts: readonly MissionContext[], state: MissionState) {
  return state.activeId ? contexts.find(item => item.id === state.activeId)?.target ?? null : null;
}
