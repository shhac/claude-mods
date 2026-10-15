import { ACHIEVEMENTS, isEarned } from './achievements'
import { daysTogether, heartsOf, levelOf, meter } from './care'
import type { Care } from './care'

// What the pet's stats and achievements say, line by line: the menu's pages
// and the sidebar's sections draw the same.

// Where the xp stands within this level, 0 to 100.
export function levelProgress(xp: number) {
  const level = levelOf(xp)
  const from = 10 * (level - 1) ** 2
  const to = 10 * level ** 2
  return { level, nextAt: to, percent: Math.round(((xp - from) / (to - from)) * 100) }
}

export const heartsLine = (mood: number) => {
  const hearts = heartsOf(mood)
  return `${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`
}

export function headerLine(care: Care) {
  const { level } = levelProgress(care.xp)
  return `Lv${level}  ${heartsLine(care.mood)}`
}

export function statsLines(care: Care, now: number): readonly string[] {
  const { nextAt, percent } = levelProgress(care.xp)
  return [
    `xp      ${meter(percent)} ${care.xp}/${nextAt}`,
    `full    ${meter(care.fullness)}`,
    `energy  ${meter(care.energy)}`,
    `🔥 ${care.streak}-day streak · day ${daysTogether(care, now)}`,
    `${care.turns} replies · ${care.tools} tool calls`,
    `${care.pets} pats · ${care.treats} treats`,
    `${care.fetches} fetches · ${care.tricks} tricks`,
    `${care.testsPassed} green test runs, best ${care.bestGreenStreak} in a row`,
  ]
}

export type AchievementLine = { label: string; isEarned: boolean }

export const achievementLines = (care: Care): readonly AchievementLine[] =>
  ACHIEVEMENTS.map(one =>
    isEarned(care, one) ? { label: `✓ ${one.name}`, isEarned: true } : { label: `· ${one.name}: ${one.hint}`, isEarned: false },
  )

export const achievementCount = (care: Care) =>
  `${ACHIEVEMENTS.filter(one => isEarned(care, one)).length}/${ACHIEVEMENTS.length}`
