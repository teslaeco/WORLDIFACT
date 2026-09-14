function toSafeHttpUrl(value: string | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function getOptionalExternalDemoUrl(envKey: string | undefined) {
  if (!envKey) {
    return null
  }

  const env = import.meta.env as Record<string, string | boolean | undefined>
  const value = env[envKey]
  if (typeof value !== 'string') {
    return null
  }

  return toSafeHttpUrl(value)
}
