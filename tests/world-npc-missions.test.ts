import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMissionInteraction,
  createMissionState,
  missionInteraction,
  missionMessage,
  missionStatus,
  missionTarget,
  type MissionContext,
} from "../src/lib/worldNpcMissions.ts";

const contexts: MissionContext[] = [
  { id:"planter", task:"planting", npc:{x:10,z:10}, target:{x:20,z:15} },
  { id:"carrier", task:"carrying", npc:{x:-10,z:-10}, target:{x:-25,z:-15} },
];

test("player accepts one nearby field mission and receives a marked target", () => {
  const initial=createMissionState();
  const interaction=missionInteraction(contexts,initial,{x:11,z:10});
  assert.ok(interaction);
  assert.equal(interaction.kind,"accept");
  assert.equal(interaction.missionId,"planter");
  assert.match(interaction.label,/plant/i);
  const active=applyMissionInteraction(initial,interaction);
  assert.equal(active.activeId,"planter");
  assert.deepEqual(missionTarget(contexts,active),{x:20,z:15});
  assert.match(missionStatus(contexts,active),/marked restoration point/i);
});

test("active mission completes only at its target and records progress", () => {
  const accepted=applyMissionInteraction(createMissionState(),missionInteraction(contexts,createMissionState(),{x:10,z:10})!);
  assert.equal(missionInteraction(contexts,accepted,{x:10,z:10}),null);
  const completion=missionInteraction(contexts,accepted,{x:20,z:15});
  assert.ok(completion);
  assert.equal(completion.kind,"complete");
  assert.match(missionMessage(completion),/complete/i);
  const done=applyMissionInteraction(accepted,completion);
  assert.equal(done.activeId,null);
  assert.deepEqual(done.completedIds,["planter"]);
  assert.match(missionStatus(contexts,done),/1\/2 complete/);
});

test("completed worker is not offered again and next worker can start", () => {
  const state={activeId:null,completedIds:["planter"]} as const;
  assert.equal(missionInteraction(contexts,state,{x:10,z:10}),null);
  const next=missionInteraction(contexts,state,{x:-10,z:-10});
  assert.ok(next);
  assert.equal(next.missionId,"carrier");
  assert.match(next.label,/carry/i);
});

test("invalid or distant player positions never create an interaction", () => {
  const state=createMissionState();
  assert.equal(missionInteraction(contexts,state,{x:999,z:999}),null);
  assert.equal(missionInteraction(contexts,state,{x:Number.NaN,z:0}),null);
});
