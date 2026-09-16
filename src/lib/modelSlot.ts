/** Own one loaded model per preview lifetime. Never accept an obsolete result. */
export function createModelSlot<T extends object>(release: (model: T) => void) {
  let open = true
  let current: T | null = null
  const released = new WeakSet<T>()
  function releaseOnce(model: T) {
    if (released.has(model)) return
    released.add(model)
    release(model)
  }
  return {
    get current() { return current },
    replace(model: T): boolean {
      if (released.has(model)) return false
      if (!open) { releaseOnce(model); return false }
      if (current === model) return true
      const previous = current
      current = model
      if (previous) releaseOnce(previous)
      return true
    },
    dispose() {
      if (!open) return
      open = false
      const previous = current
      current = null
      if (previous) releaseOnce(previous)
    },
  }
}
