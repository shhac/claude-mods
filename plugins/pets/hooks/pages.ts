import type { Care } from '../types'
import { ACHIEVEMENTS, isEarned } from './achievements'
import { daysTogether, heartsLine, levelProgress, meter } from './care'

// What the pet's stats and achievements say, line by line: the menu's pages
// and the sidebar's sections draw the same.

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

