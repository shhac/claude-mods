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
  // 0 to 100, both: a treat fills the pet up, work tires it, rest restores it.
  fullness: number
  energy: number
  fetches: number
  tricks: number
  testsPassed: number
  // Test runs passed in a row, and the best such run.
  greenStreak: number
  bestGreenStreak: number
  // Replies watched between midnight and 5am.
  nightTurns: number
  // Each achievement earned, by id, with when.
  achievements: Record<string, number>
}

const MOOD_FLOOR = 30
const MOOD_LOST_PER_HOUR = 2
// Hunger and tiredness never get bad enough to sulk over.
const FULLNESS_FLOOR = 20
const ENERGY_FLOOR = 10
const FULLNESS_LOST_PER_HOUR = 8
const ENERGY_RESTORED_PER_HOUR = 25
const HUNGRY_BELOW = 40
const SLEEPY_BELOW = 25
const TIRED_BELOW = 15
const FEED_COOLDOWN_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10)
const clampMood = (mood: number) => Math.round(Math.min(100, Math.max(0, mood)))
// Kept to a tenth: a tool call tires the pet only a little.
const clampTo = (floor: number, value: number) => Math.round(Math.min(100, Math.max(floor, value)) * 10) / 10
const hourOf = (at: number) => new Date(at).getHours()

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
  fullness: 80,
  energy: 80,
  fetches: 0,
  tricks: 0,
  testsPassed: 0,
  greenStreak: 0,
  bestGreenStreak: 0,
  nightTurns: 0,
  achievements: {},
})

const numberOr = (record: Record<string, unknown>, key: keyof Care, fallback: number) => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Counts and xp never go below nothing: a negative xp would make no level.
const countOr = (record: Record<string, unknown>, key: keyof Care, fallback: number) =>
  Math.max(0, numberOr(record, key, fallback))

// What the store held, made whole: a field missing or garbled starts fresh.
export function careFrom(stored: unknown, now: number): Care {
  const fresh = newCare(now)
  if (typeof stored !== 'object' || stored === null) return fresh

  const record: Record<string, unknown> = { ...stored }
  return {
    xp: countOr(record, 'xp', fresh.xp),
    mood: clampMood(numberOr(record, 'mood', fresh.mood)),
    pets: countOr(record, 'pets', 0),
    treats: countOr(record, 'treats', 0),
    turns: countOr(record, 'turns', 0),
    tools: countOr(record, 'tools', 0),
    adoptedAt: numberOr(record, 'adoptedAt', now),
    lastSeenAt: numberOr(record, 'lastSeenAt', now),
    lastFedAt: numberOr(record, 'lastFedAt', 0),
    streak: Math.max(1, numberOr(record, 'streak', 1)),
    lastDay: typeof record.lastDay === 'string' ? record.lastDay : fresh.lastDay,
    fullness: clampTo(0, numberOr(record, 'fullness', fresh.fullness)),
    energy: clampTo(0, numberOr(record, 'energy', fresh.energy)),
    fetches: countOr(record, 'fetches', 0),
    tricks: countOr(record, 'tricks', 0),
    testsPassed: countOr(record, 'testsPassed', 0),
    greenStreak: countOr(record, 'greenStreak', 0),
    bestGreenStreak: countOr(record, 'bestGreenStreak', 0),
    nightTurns: countOr(record, 'nightTurns', 0),
    achievements: achievementsFrom(record.achievements),
  }
}

function achievementsFrom(stored: unknown): Record<string, number> {
  if (typeof stored !== 'object' || stored === null) return {}
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
}

export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 10)) + 1
const heartsOf = (mood: number) => Math.min(5, Math.max(0, Math.round(mood / 20)))

export const heartsLine = (mood: number) => {
  const hearts = heartsOf(mood)
  return `${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`
}

// Where the xp stands within this level, 0 to 100.
export function levelProgress(xp: number) {
  const level = levelOf(xp)
  const from = 10 * (level - 1) ** 2
  const to = 10 * level ** 2
  return { level, nextAt: to, percent: Math.round(((xp - from) / (to - from)) * 100) }
}

export const badgeOf = (care: Care) => `Lv${levelOf(care.xp)} ${heartsLine(care.mood)}`

// Back after a while: mood drifts down with the hours away and the pet gets
// a little hungry, never below the floors; it rested, so it has energy; and
// the visit counts towards the streak.
export function welcomeBack(care: Care, now: number): Care {
  const hoursAway = Math.max(0, (now - care.lastSeenAt) / (60 * 60 * 1000))
  const missed = Math.min(care.mood, Math.max(MOOD_FLOOR, care.mood - hoursAway * MOOD_LOST_PER_HOUR))
  const hungrier = Math.min(care.fullness, Math.max(FULLNESS_FLOOR, care.fullness - hoursAway * FULLNESS_LOST_PER_HOUR))
  const today = dayOf(now)
  const yesterday = dayOf(now - DAY_MS)
  const streak = care.lastDay === today ? care.streak : care.lastDay === yesterday ? care.streak + 1 : 1

  return {
    ...care,
    mood: clampMood(missed),
    fullness: clampTo(0, hungrier),
    energy: clampTo(0, care.energy + hoursAway * ENERGY_RESTORED_PER_HOUR),
    streak,
    lastDay: today,
    lastSeenAt: now,
  }
}

export const afterTurn = (care: Care, now: number): Care => ({
  ...care,
  xp: care.xp + 3,
  mood: clampMood(care.mood + 2),
  turns: care.turns + 1,
  fullness: clampTo(FULLNESS_FLOOR, care.fullness - 1),
  nightTurns: care.nightTurns + (hourOf(now) < 5 ? 1 : 0),
  lastSeenAt: now,
})

export const afterTool = (care: Care, isError: boolean): Care => ({
  ...care,
  xp: care.xp + 1,
  tools: care.tools + 1,
  mood: clampMood(care.mood - (isError ? 1 : 0)),
  energy: clampTo(ENERGY_FLOOR, care.energy - 0.5),
  fullness: clampTo(FULLNESS_FLOOR, care.fullness - 0.2),
})

// A test run Claude made: green ones earn a little and build a streak.
export const afterTest = (care: Care, hasPassed: boolean): Care =>
  hasPassed
    ? {
        ...care,
        xp: care.xp + 3,
        testsPassed: care.testsPassed + 1,
        greenStreak: care.greenStreak + 1,
        bestGreenStreak: Math.max(care.bestGreenStreak, care.greenStreak + 1),
      }
    : { ...care, mood: clampMood(care.mood - 1), greenStreak: 0 }

export const played = (care: Care, now: number): Care => ({
  ...care,
  xp: care.xp + 2,
  mood: clampMood(care.mood + 4),
  energy: clampTo(ENERGY_FLOOR, care.energy - 8),
  fetches: care.fetches + 1,
  lastSeenAt: now,
})

export const didTrick = (care: Care, now: number): Care => ({
  ...care,
  xp: care.xp + 1,
  mood: clampMood(care.mood + 2),
  tricks: care.tricks + 1,
  lastSeenAt: now,
})

export const isHungry = (care: Care) => care.fullness < HUNGRY_BELOW
export const isSleepy = (care: Care, now: number) => care.energy < SLEEPY_BELOW || hourOf(now) < 5
// Too tired to play, though never to be petted or fed.
export const isTired = (care: Care) => care.energy < TIRED_BELOW

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

  return {
    care: {
      ...care,
      mood: clampMood(care.mood + 15),
      fullness: clampTo(0, care.fullness + 40),
      energy: clampTo(0, care.energy + 10),
      treats: care.treats + 1,
      lastFedAt: now,
      lastSeenAt: now,
    },
  }
}

const TURN_MILESTONES = [10, 50, 100, 250, 500, 1000]
const TOOL_MILESTONES = [100, 1000, 5000]

// Something worth a cheer, crossed between one care and the next.
export function milestone(before: Care, after: Care) {
  const turns = TURN_MILESTONES.find(count => before.turns < count && after.turns >= count)
  if (turns !== undefined) return `${turns} replies watched together!`

  const tools = TOOL_MILESTONES.find(count => before.tools < count && after.tools >= count)
  return tools === undefined ? undefined : `${tools} tool calls! I'm learning so much`
}

// A ten-step bar of a 0–100 value.
export const meter = (value: number) => {
  const filled = Math.round(Math.min(100, Math.max(0, value)) / 10)
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`
}

export const daysTogether = (care: Care, now: number) => Math.floor((now - care.adoptedAt) / DAY_MS) + 1

export function describeCare(name: string, care: Care, now: number) {
  const { level, nextAt } = levelProgress(care.xp)

  return [
    `${name} · level ${level} (${care.xp}/${nextAt} xp)`,
    `mood ${heartsLine(care.mood)} ${care.mood}/100`,
    `day ${daysTogether(care, now)} together · ${care.streak}-day streak`,
    `fullness ${meter(care.fullness)} · energy ${meter(care.energy)}`,
    `watched ${care.turns} replies and ${care.tools} tool calls · petted ${care.pets}× · ${care.treats} treats`,
    `${care.fetches} games of fetch · ${care.tricks} tricks · ${care.testsPassed} green test runs (best streak ${care.bestGreenStreak})`,
  ].join('\n')
}
