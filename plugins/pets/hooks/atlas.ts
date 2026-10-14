import type { Activity, Reaction } from '../types'

// The Codex pet atlas contract: 8x9 cells of 192x208, one animation per row.
export const COLUMNS = 8
export const ROWS = 9
export const CELL_WIDTH = 192
export const CELL_HEIGHT = 208
export const FRAME_COUNT = COLUMNS * ROWS

export type Animation =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

const evenly = (count: number, ms: number, finalMs: number): readonly number[] => [
  ...Array.from({ length: count - 1 }, () => ms),
  finalMs,
]

export const ANIMATIONS: Record<Animation, { row: number; durations: readonly number[] }> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  'running-right': { row: 1, durations: evenly(8, 120, 220) },
  'running-left': { row: 2, durations: evenly(8, 120, 220) },
  waving: { row: 3, durations: evenly(4, 140, 280) },
  jumping: { row: 4, durations: evenly(5, 140, 280) },
  failed: { row: 5, durations: evenly(8, 140, 240) },
  waiting: { row: 6, durations: evenly(6, 150, 260) },
  running: { row: 7, durations: evenly(6, 120, 220) },
  review: { row: 8, durations: evenly(6, 150, 280) },
}

export const ACTIVITY_ANIMATION: Record<Activity, Animation> = {
  ready: 'idle',
  running: 'running',
  reviewing: 'review',
  waiting: 'waiting',
}

export const REACTION_ANIMATION: Record<Reaction, Animation> = {
  greeting: 'waving',
  celebrating: 'jumping',
  failed: 'failed',
}

// Labels follow the Codex CLI pet's states so a pet reads the same in both.
export const ACTIVITY_LABEL: Record<Activity, string> = {
  ready: 'Ready',
  running: 'Running',
  reviewing: 'Reviewing',
  waiting: 'Needs input',
}

export const REACTION_LABEL: Record<Reaction, string> = {
  greeting: 'Hello!',
  celebrating: 'Done!',
  failed: 'Blocked',
}

export const frameCount = (animation: Animation) => ANIMATIONS[animation].durations.length

const FALLBACK_FRAME_MS = 150

export const frameDuration = (animation: Animation, frame: number) =>
  ANIMATIONS[animation].durations[frame % frameCount(animation)] ?? FALLBACK_FRAME_MS

export const framePath = (framesDir: string, animation: Animation, frame: number) =>
  `${framesDir}/frame-${String(ANIMATIONS[animation].row * COLUMNS + frame).padStart(2, '0')}.png`

// Terminal cells are roughly twice as tall as they are wide.
export const columnsForRows = (rows: number) => Math.max(1, Math.round((rows * 2 * CELL_WIDTH) / CELL_HEIGHT))
