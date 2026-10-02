import * as THREE from 'three';
import { disposeObject } from './worldGeometry.ts';

export type SwappableAvatar = { root: THREE.Group; dispose: () => void };
/** Swap only the avatar. The world, landmark, vehicles and WebGL context keep their identity. */
export function createWorldAvatarSlot<T extends SwappableAvatar>(scene: THREE.Scene, first: T) {
  let current = first;
  let disposed = false;
  scene.add(current.root);
  return {
    get current() { return current; },
    replace(next: T) {
      if (disposed) { next.dispose(); disposeObject(next.root); return; }
      next.root.position.copy(current.root.position);
      next.root.quaternion.copy(current.root.quaternion);
      const previous = current;
      current = next;
      scene.add(next.root);
      previous.root.removeFromParent();
      previous.dispose();
      disposeObject(previous.root);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      current.dispose();
      current.root.removeFromParent();
      disposeObject(current.root);
    },
  };
}
