import * as T from 'three';

const originalRender = T.WebGLRenderer.prototype.render;
let resetCameraUntil = 0;
const safeOffset = new T.Vector3(0, 2.15, 6.2);
const lookOffset = new T.Vector3(0, .48, 0);

function cameraSafe(camera, astronaut) {
  const look = astronaut.position.clone().add(lookOffset);
  if (performance.now() < resetCameraUntil) {
    camera.position.copy(look).add(safeOffset);
    camera.lookAt(look);
    return;
  }
  const rel = camera.position.clone().sub(look);
  let distance = rel.length();
  if (!Number.isFinite(distance) || distance < .1) {
    rel.copy(safeOffset); distance = rel.length();
  }
  distance = T.MathUtils.clamp(distance, 4.8, 8.4);
  const sourceDistance = Math.max(.1, rel.length());
  const yaw = Math.atan2(rel.x, rel.z);
  const pitch = T.MathUtils.clamp(Math.asin(T.MathUtils.clamp(rel.y / sourceDistance, -1, 1)), -.18, .52);
  rel.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
  camera.position.copy(look).add(rel);
  camera.lookAt(look);
}

T.WebGLRenderer.prototype.render = function(scene, camera) {
  if (!document.body.classList.contains('eva') || !camera?.isPerspectiveCamera || document.getElementById('map')?.getAttribute('aria-pressed') === 'true') {
    return originalRender.call(this, scene, camera);
  }
  const astronaut = scene.getObjectByName('FORGE_Astronaut_v3');
  const nasa = scene.getObjectByName('NASA_VTAD_ISS_HISTORICAL');
  const exterior = scene.getObjectByName('FORGE_Exterior_Training_Overlay');
  const interior = scene.getObjectByName('FORGE_Training_Interior');
  if (nasa) nasa.visible = true;
  if (exterior) exterior.visible = true;
  if (interior) interior.visible = false;
  if (!astronaut) return originalRender.call(this, scene, camera);

  cameraSafe(camera, astronaut);
  // Visual-only zero-gravity drift. Physics/collision position is restored after render.
  const oldY = astronaut.position.y, oldX = astronaut.rotation.x, oldZ = astronaut.rotation.z;
  const t = performance.now() * .001;
  astronaut.position.y = oldY + Math.sin(t * 1.55) * .035;
  astronaut.rotation.x = oldX + Math.sin(t * .72) * .016;
  astronaut.rotation.z = oldZ + Math.sin(t * .91) * .022;
  try { return originalRender.call(this, scene, camera); }
  finally { astronaut.position.y = oldY; astronaut.rotation.x = oldX; astronaut.rotation.z = oldZ; }
};

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reset-view')?.addEventListener('click', () => {
    resetCameraUntil = performance.now() + 1200;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true }));
  });
  document.getElementById('eva-guide')?.addEventListener('click', () => {
    if (document.body.classList.contains('eva')) {
      resetCameraUntil = performance.now() + 1200;
      return;
    }
    const bag = document.getElementById('bag-status')?.textContent || '';
    const suit = document.getElementById('suit-status')?.textContent || '';
    if (/NOT COLLECTED/i.test(bag)) document.getElementById('quick-bag')?.click();
    else if (!/EVA SUIT ON/i.test(suit)) document.getElementById('quick-suit')?.click();
    else document.getElementById('quick-airlock')?.click();
  });
});
