import type { EngineInterface } from 'claude-code'

import type { Offset, Reaction } from '../types'
import { didTrick, isTired, levelOf, played } from './care'
import type { Care } from './care'
import { mirror, setOffset, sizeOf } from './controls'
import { keeper, tend } from './keeper'
import { react, steer } from './player'
import { screen } from './stage'
import { say } from './voice'

// Playing with the pet: tricks it learns as it levels up, and fetch.

type Trick = { id: 'wave' | 'jump' | 'dance' | 'read'; name: string; level: number; line: string }

export const TRICKS: readonly Trick[] = [
  { id: 'wave', name: 'wave', level: 2, line: '👋 hiii' },
  { id: 'jump', name: 'jump', level: 3, line: 'boing! 🌟' },
  { id: 'dance', name: 'dance', level: 4, line: '💃 shimmy shimmy' },
  { id: 'read', name: 'read', level: 6, line: '📖 very scholarly, me' },
]

const TRICK_REACTION: Record<Trick['id'], Reaction> = { wave: 'wave', jump: 'jump', dance: 'dance', read: 'read' }

export const isUnlocked = (trick: Trick, care: Care | undefined) => levelOf(care?.xp ?? 0) >= trick.level

export async function doTrick($: EngineInterface, id: string) {
  const trick = TRICKS.find(one => one.id === id)
  if (trick === undefined) return
  if (!isUnlocked(trick, keeper.care)) return say($, `I'll learn to ${trick.name} at level ${trick.level}!`)

  await react($, TRICK_REACTION[trick.id])
  await tend($, didTrick)
  await say($, trick.line)
}

// Fetch runs across the conversation and back, in steps of this many columns.
const STEP_COLUMNS = 6
const STEP_MS = 110
const CATCH_MS = 700
const IN_PLACE_MS = 1200
const FETCH_COOLDOWN_MS = 60 * 1000

export const fetchGame: { generation: number; lastAt: number } = { generation: 0, lastAt: Number.NEGATIVE_INFINITY }

export async function playFetch($: EngineInterface) {
  const care = keeper.care
  if (care === undefined) return
  if (isTired(care)) return say($, 'too tired to play… 😴', 'think')

  const now = await $.clock.now()
  if (now - fetchGame.lastAt < FETCH_COOLDOWN_MS) return say($, 'let me catch my breath first!')
  fetchGame.lastAt = now
  fetchGame.generation += 1

  await say($, '🎾 !!!')
  if (mirror.dock !== 'conversation') return runInPlace($, fetchGame.generation)

  // Over the conversation it runs to the far edge and back to where it was.
  const home = mirror.offset
  const far = Math.max(0, screen.columns - sizeOf(mirror.size).columns)
  return run($, fetchGame.generation, home, far, 'out')
}

// One step of the run. A drag or another game ends it where it is.
function run($: EngineInterface, generation: number, home: Offset, far: number, leg: 'out' | 'back') {
  if (generation !== fetchGame.generation || mirror.drag !== undefined || mirror.dock !== 'conversation') {
    steer($, undefined)
    return
  }

  const target = leg === 'out' ? far : home.right
  const step = Math.sign(target - mirror.offset.right) * Math.min(STEP_COLUMNS, Math.abs(target - mirror.offset.right))
  if (step === 0) return arrive($, generation, home, far, leg)

  // Offsets count from the right, so a growing `right` runs left.
  steer($, step > 0 ? 'left' : 'right')
  void setOffset($, { ...mirror.offset, right: mirror.offset.right + step })
  $.clock.after(STEP_MS, () => run($, generation, home, far, leg))
}

function arrive($: EngineInterface, generation: number, home: Offset, far: number, leg: 'out' | 'back') {
  steer($, undefined)
  if (leg === 'out') {
    void say($, 'got it! 🎾')
    $.clock.after(CATCH_MS, () => run($, generation, home, far, 'back'))
    return
  }

  void finish($)
}

// Docked, there's nowhere to run: it runs on the spot.
function runInPlace($: EngineInterface, generation: number) {
  steer($, 'left')
  $.clock.after(IN_PLACE_MS, () => {
    if (generation !== fetchGame.generation) return
    steer($, 'right')
    $.clock.after(IN_PLACE_MS, () => {
      steer($, undefined)
      if (generation === fetchGame.generation) void finish($)
    })
  })
}

async function finish($: EngineInterface) {
  await tend($, played)
  await react($, 'happy')
  await say($, 'again! again! 🐾')
}
