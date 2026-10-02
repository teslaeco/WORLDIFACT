import type { AvatarAsset } from './avatarAsset.ts'

export const DEFAULT_WORLD_AVATAR = 'terraformer' satisfies AvatarAsset

type Session = { loading: boolean; userId: string | null; pathname: string }
type Assets = { clear: () => void; load: (choice: AvatarAsset) => Promise<ArrayBuffer> }

/** Keep public avatar reads alive through initial session discovery and navigation.
 * A later resolved identity change still invalidates every cached/in-flight asset. */
export function createAvatarPreloadLifecycle(assets: Assets) {
  let resolved = false
  let identity: string | null = null
  let epoch = 0
  let prefetched = false

  return {
    observe({ loading, userId, pathname }: Session) {
      if (loading) return
      if (resolved && identity !== userId) {
        epoch++
        prefetched = false
        assets.clear()
      }
      resolved = true
      identity = userId
      if (!userId || pathname !== '/world' || prefetched) return

      prefetched = true
      const requestEpoch = epoch
      const failed = () => { if (epoch === requestEpoch) prefetched = false }
      try {
        // The mounted world shares this exact default-avatar byte request.
        void assets.load(DEFAULT_WORLD_AVATAR).catch(failed)
      } catch {
        failed()
      }
    },
  }
}
