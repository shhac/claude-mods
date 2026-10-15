import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Activity, Reaction } from '../types'
import { ACTIVITY_ANIMATION, REACTION_ANIMATION, REACTION_THEN, frameCount, frameDuration, framePath } from './atlas'
import type { Animation } from './atlas'

const activity = atom({ plugin: 'pets', key: 'activity' } as const, 'ready')
const reaction = atom({ plugin: 'pets', key: 'reaction' } as const, null)
const detail = atom({ plugin: 'pets', key: 'detail' } as const, null)

export const IMAGE_KEY = 'pet'
const REACTION_LOOPS = 2
// The pet's site can change between draws (it rides a conversation row), so
// an unseen frame is retried soon rather than slowly.
const UNSEEN_RETRY_MS = 500

// Playback is the module's own: a reload starts it over, which is harmless.
export const playback: {
  animation: Animation
  frame: number
  reactionLoopsLeft: number
  // What a reaction plays next, once each, before going back to the activity.
  then: readonly Animation[]
  framesDir: string | undefined
  siteRequestId: string | undefined
  isLooping: boolean
  // Codex plays running-left/right while the pet is dragged.
  dragging: Animation | undefined
  dragFrame: number
  generation: number
  wait: Timer | undefined
} = {
  animation: 'idle',
  frame: 0,
  reactionLoopsLeft: 0,
  then: [],
  framesDir: undefined,
  siteRequestId: undefined,
  isLooping: false,
  dragging: undefined,
  dragFrame: 0,
  generation: 0,
  wait: undefined,
}

const shown = () =>
  playback.dragging === undefined
    ? { animation: playback.animation, frame: playback.frame }
    : { animation: playback.dragging, frame: playback.dragFrame }

export const currentFrame = (framesDir: string) => {
  const { animation, frame } = shown()
  return framePath(framesDir, animation, frame)
}

const play = (animation: Animation, loops = 0) => {
  playback.animation = animation
  playback.frame = 0
  playback.reactionLoopsLeft = loops
}

async function showFrame($: EngineInterface) {
  const { framesDir, siteRequestId } = playback
  if (framesDir === undefined || siteRequestId === undefined) return false

  const { deny } = await $.ui.blit({
    requestId: siteRequestId,
    key: IMAGE_KEY,
    source: { file: currentFrame(framesDir), format: 'png' },
  })

  return deny === undefined
}

async function advance($: EngineInterface) {
  if (playback.dragging !== undefined) {
    playback.dragFrame = (playback.dragFrame + 1) % frameCount(playback.dragging)
    return
  }

  const isLastFrame = playback.frame + 1 >= frameCount(playback.animation)
  playback.frame = isLastFrame ? 0 : playback.frame + 1
  if (!isLastFrame || playback.reactionLoopsLeft === 0) return

  playback.reactionLoopsLeft -= 1
  if (playback.reactionLoopsLeft > 0) return

  const [next, ...rest] = playback.then
  if (next !== undefined) {
    play(next, 1)
    playback.then = rest
    return
  }

  playback.animation = ACTIVITY_ANIMATION[await read($, activity)]
  await update($, reaction, () => null)
}

function schedule($: EngineInterface, generation: number, wait: number) {
  playback.wait = $.clock.after(wait, () => void loop($, generation))
}

// One loop at a time: wake() starts a new generation and every older loop
// stops at its next step.
async function loop($: EngineInterface, generation: number) {
  if (generation !== playback.generation) return

  const isSeen = await showFrame($)
  if (generation !== playback.generation) return

  const { animation, frame } = shown()
  const wait = isSeen ? frameDuration(animation, frame) : UNSEEN_RETRY_MS
  await advance($)
  schedule($, generation, wait)
}

// Shows the current frame now and carries on from it, cutting short any wait.
export function wake($: EngineInterface) {
  playback.wait?.cancel()
  playback.generation += 1
  void loop($, playback.generation)
}

// The one animation loop, started per load from session.start; other hooks
// change what it plays and wake it.
export function animate($: EngineInterface) {
  if (playback.isLooping) return
  playback.isLooping = true
  wake($)
}

export async function setActivity($: EngineInterface, next: Activity, nextDetail: string | null = null) {
  await update($, detail, () => nextDetail)
  if ((await read($, activity)) === next) return

  await update($, activity, () => next)
  if (playback.reactionLoopsLeft > 0) return

  play(ACTIVITY_ANIMATION[next])
  wake($)
}

export async function react($: EngineInterface, next: Reaction) {
  await update($, reaction, () => next)
  const then = REACTION_THEN[next] ?? []
  play(REACTION_ANIMATION[next], then.length > 0 ? 1 : REACTION_LOOPS)
  playback.then = then
  wake($)
}

// Runs the way the pet is being dragged, or stops running once it is dropped.
export function steer($: EngineInterface, direction: 'left' | 'right' | undefined) {
  const dragging: Animation | undefined =
    direction === undefined ? undefined : direction === 'left' ? 'running-left' : 'running-right'
  if (dragging === playback.dragging) return

  playback.dragging = dragging
  playback.dragFrame = 0
  wake($)
}
