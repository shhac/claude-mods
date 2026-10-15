// A little looking-after, tamagotchi style: the pet grows as it watches you
// work, likes being petted and fed, and misses you a bit while you're away,
// though never so much it sulks.

export type Care = {
  xp: number
  // 0 to 100.
  mood: number
  pets: number
  treats: number
  turns: number
  tools: number
  adoptedAt: number
  lastSeenAt: number
  lastFedAt: number
  // Days in a row the pet has been visited.
  streak: number
  lastDay: string
}

const MOOD_FLOOR = 30
const MOOD_LOST_PER_HOUR = 2
const FEED_COOLDOWN_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10)
const clampMood = (mood: number) => Math.round(Math.min(100, Math.max(0, mood)))

export const newCare = (now: number): Care => ({
  xp: 0,
  mood: 70,
  pets: 0,
  treats: 0,
  turns: 0,
  tools: 0,
  adoptedAt: now,
  lastSeenAt: now,
  lastFedAt: 0,
  streak: 1,
  lastDay: dayOf(now),
})

const numberOr = (record: Record<string, unknown>, key: keyof Care, fallback: number) => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// What the store held, made whole: a field missing or garbled starts fresh.
export function careFrom(stored: unknown, now: number): Care {
  const fresh = newCare(now)
  if (typeof stored !== 'object' || stored === null) return fresh

  const record: Record<string, unknown> = { ...stored }
  return {
    xp: numberOr(record, 'xp', fresh.xp),
    mood: clampMood(numberOr(record, 'mood', fresh.mood)),
    pets: numberOr(record, 'pets', 0),
    treats: numberOr(record, 'treats', 0),
    turns: numberOr(record, 'turns', 0),
    tools: numberOr(record, 'tools', 0),
    adoptedAt: numberOr(record, 'adoptedAt', now),
    lastSeenAt: numberOr(record, 'lastSeenAt', now),
    lastFedAt: numberOr(record, 'lastFedAt', 0),
    streak: numberOr(record, 'streak', 1),
    lastDay: typeof record.lastDay === 'string' ? record.lastDay : fresh.lastDay,
  }
}

export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 10)) + 1
export const heartsOf = (mood: number) => Math.min(5, Math.max(0, Math.round(mood / 20)))
export const badgeOf = (care: Care) => {
  const hearts = heartsOf(care.mood)
  return `Lv${levelOf(care.xp)} ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`
}

// Back after a while: mood drifts down with the hours away, never below the
// floor, and the visit counts towards the streak.
export function welcomeBack(care: Care, now: number): Care {
  const hoursAway = Math.max(0, (now - care.lastSeenAt) / (60 * 60 * 1000))
  const missed = Math.min(care.mood, Math.max(MOOD_FLOOR, care.mood - hoursAway * MOOD_LOST_PER_HOUR))
  const today = dayOf(now)
  const yesterday = dayOf(now - DAY_MS)
  const streak = care.lastDay === today ? care.streak : care.lastDay === yesterday ? care.streak + 1 : 1

  return { ...care, mood: clampMood(missed), streak, lastDay: today, lastSeenAt: now }
}

export const afterTurn = (care: Care, now: number): Care => ({
  ...care,
  xp: care.xp + 3,
  mood: clampMood(care.mood + 2),
  turns: care.turns + 1,
  lastSeenAt: now,
})

export const afterTool = (care: Care, isError: boolean): Care => ({
  ...care,
  xp: care.xp + 1,
  tools: care.tools + 1,
  mood: clampMood(care.mood - (isError ? 1 : 0)),
})

export const petted = (care: Care, now: number): Care => ({
  ...care,
  mood: clampMood(care.mood + 5),
  pets: care.pets + 1,
  lastSeenAt: now,
})

// A treat, at most one per half hour; otherwise how many minutes to wait.
export function fed(care: Care, now: number): { care: Care } | { waitMinutes: number } {
  const waitMs = care.lastFedAt + FEED_COOLDOWN_MS - now
  if (waitMs > 0) return { waitMinutes: Math.ceil(waitMs / 60000) }

  return { care: { ...care, mood: clampMood(care.mood + 15), treats: care.treats + 1, lastFedAt: now, lastSeenAt: now } }
}

export const daysTogether = (care: Care, now: number) => Math.floor((now - care.adoptedAt) / DAY_MS) + 1

export function describeCare(name: string, care: Care, now: number) {
  const level = levelOf(care.xp)
  const nextAt = level * level * 10
  const hearts = heartsOf(care.mood)

  return [
    `${name} · level ${level} (${care.xp}/${nextAt} xp)`,
    `mood ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)} ${care.mood}/100`,
    `day ${daysTogether(care, now)} together · ${care.streak}-day streak`,
    `watched ${care.turns} replies and ${care.tools} tool calls · petted ${care.pets}× · ${care.treats} treats`,
  ].join('\n')
}
