import { levelOf } from './care'
import type { Care } from './care'

// Things a pet earns once, each cheered as it comes and listed in its stats.

export type Achievement = { id: string; name: string; hint: string; isEarned: (care: Care) => boolean }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-reply', name: 'Hello, world', hint: 'watch a first reply', isEarned: care => care.turns >= 1 },
  { id: 'tools-100', name: 'Toolbox', hint: 'watch 100 tool calls', isEarned: care => care.tools >= 100 },
  { id: 'tools-1000', name: 'Power user', hint: 'watch 1000 tool calls', isEarned: care => care.tools >= 1000 },
  { id: 'streak-7', name: 'Regular', hint: 'visit 7 days in a row', isEarned: care => care.streak >= 7 },
  { id: 'streak-30', name: 'Best friends', hint: 'visit 30 days in a row', isEarned: care => care.streak >= 30 },
  { id: 'treats-10', name: 'Well fed', hint: 'give 10 treats', isEarned: care => care.treats >= 10 },
  { id: 'pats-50', name: 'Good pet', hint: 'pet it 50 times', isEarned: care => care.pets >= 50 },
  { id: 'fetch-25', name: 'Fetch champion', hint: 'play fetch 25 times', isEarned: care => care.fetches >= 25 },
  { id: 'tricks-25', name: 'Show-off', hint: 'do 25 tricks', isEarned: care => care.tricks >= 25 },
  { id: 'green-10', name: 'All green', hint: '10 passing test runs in a row', isEarned: care => care.bestGreenStreak >= 10 },
  { id: 'level-5', name: 'Growing up', hint: 'reach level 5', isEarned: care => levelOf(care.xp) >= 5 },
  { id: 'level-10', name: 'All grown up', hint: 'reach level 10', isEarned: care => levelOf(care.xp) >= 10 },
  { id: 'night-owl', name: 'Night owl', hint: 'work together after midnight', isEarned: care => care.nightTurns >= 1 },
]

// Achievements this care earns that it hasn't been given yet, given now.
export function award(care: Care, now: number): { care: Care; earned: readonly Achievement[] } {
  const earned = ACHIEVEMENTS.filter(one => care.achievements[one.id] === undefined && one.isEarned(care))
  if (earned.length === 0) return { care, earned }

  const given = Object.fromEntries(earned.map(one => [one.id, now]))
  return { care: { ...care, achievements: { ...care.achievements, ...given } }, earned }
}

export const isEarned = (care: Care, achievement: Achievement) => care.achievements[achievement.id] !== undefined

// For the stats: how many, and which.
export function describeAchievements(care: Care) {
  const earned = ACHIEVEMENTS.filter(one => isEarned(care, one))
  const names = earned.length === 0 ? 'none yet' : earned.map(one => one.name).join(', ')
  return `🏆 ${earned.length}/${ACHIEVEMENTS.length}: ${names}`
}
