/** Serialize visible-card work; never retain model bytes or private thumbnails globally. */
export function createThumbnailQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => { signal.throwIfAborted(); return task() })
    tail = result.catch(() => {})
    return result
  }
}
export const enqueueThumbnail = createThumbnailQueue()
export const THUMBNAIL_MAX_BYTES = 16 * 1024 * 1024
