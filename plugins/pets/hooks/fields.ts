// Reading a field of a value whose shape isn't known: a tool's input, a
// surface's message, what the store held.

export function fieldOf(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null || !(key in data)) return undefined
  const record: Record<string, unknown> = { ...data }
  return record[key]
}
