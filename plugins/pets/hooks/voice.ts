import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { BubbleKind } from '../types'
import {
  feelingAboutTool,
  feelingSystem,
  feelingWhileThinking,
  fitBubble,
  replyPrompt,
  thinkingPrompt,
  toolLine,
  toolPrompt,
} from './chatter'
import type { Persona, Scene } from './chatter'

export type Chatter = 'on' | 'quiet' | 'off'

const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)

const BUBBLE_MS = 8000
// A bubble is blanked before it goes: cells a floating box leaves can keep
// their old text until something else draws over them.
const BLANK_MS = 400
// Feelings come no more often than this, so the bubble isn't a running commentary.
const FEELING_GAP_MS = 12000
// A model call costs, so one at most this often; local lines fill in between.
const ASK_GAP_MS = 20000
// How long Claude has been quiet before the pet muses, and how often after.
const MUSE_AFTER_MS = 6000
const MUSE_AGAIN_MS = 15000
const MODEL = 'haiku'
const DONE_KEPT = 6
const SAID_KEPT = 4

export const voice: {
  chatter: Chatter
  generation: number
  lastFeltAt: number
  lastAskedAt: number
  // Turns each local line pool, so the same line doesn't come twice running.
  count: number
  // A new one stops the musing loop that was waiting.
  musing: number
  persona: Persona
  scene: Scene
} = {
  chatter: 'on',
  generation: 0,
  lastFeltAt: Number.NEGATIVE_INFINITY,
  lastAskedAt: Number.NEGATIVE_INFINITY,
  count: 0,
  musing: 0,
  persona: { name: 'Pet', description: '', mood: 70, level: 1 },
  scene: { request: '', done: [], said: [] },
}

const keepLast = <T>(items: readonly T[], item: T, kept: number) => [...items, item].slice(-kept)

export async function say($: EngineInterface, text: string, kind: BubbleKind = 'say') {
  if (voice.chatter === 'off') return

  const line = fitBubble(text)
  if (line === '') return

  voice.generation += 1
  const generation = voice.generation
  voice.scene = { ...voice.scene, said: keepLast(voice.scene.said, line, SAID_KEPT) }
  await update($, bubble, () => ({ text: line, kind, isFading: false }))
  $.clock.after(BUBBLE_MS, () => void blank($, generation))
}

// A reload drops the timers that would take a bubble away, and the session
// keeps the bubble: left, it would stay up for good.
export async function hushStale($: EngineInterface) {
  voice.generation += 1
  await blank($, voice.generation)
}

async function blank($: EngineInterface, generation: number) {
  if (generation !== voice.generation) return

  const shown = await read($, bubble)
  if (shown === null) return

  await update($, bubble, () => ({ ...shown, isFading: true }))
  $.clock.after(BLANK_MS, () => void hush($, generation))
}

async function hush($: EngineInterface, generation: number) {
  if (generation === voice.generation) await update($, bubble, () => null)
}

async function ask($: EngineInterface, prompt: string) {
  try {
    const system = feelingSystem(voice.persona)
    const reply = await $.model.complete({ model: MODEL, system, prompt, maxTokens: 60, timeoutMs: 8000 })
    return reply.isAnswered ? reply.text : undefined
  } catch {
    return undefined
  }
}

// The pet's feeling, from the model while chatter is on and it wasn't asked
// just now, else from the pet's own lines.
async function feel($: EngineInterface, prompt: string, fallback: string, kind: BubbleKind) {
  const now = await $.clock.now()
  if (now - voice.lastFeltAt < FEELING_GAP_MS) return
  voice.lastFeltAt = now
  voice.count += 1

  const mayAsk = voice.chatter === 'on' && now - voice.lastAskedAt >= ASK_GAP_MS
  if (mayAsk) voice.lastAskedAt = now
  const asked = mayAsk ? await ask($, prompt) : undefined
  await say($, asked ?? fallback, kind)
}

export function meetPet(name: string, description: string) {
  voice.persona = { ...voice.persona, name, description }
}

export function noteCare(mood: number, level: number) {
  voice.persona = { ...voice.persona, mood, level }
}

// A new ask from the person starts a new scene.
export function noteRequest(text: string) {
  voice.scene = { request: text.trim(), done: [], said: voice.scene.said }
}

export function stopMusing() {
  voice.musing += 1
}

// How the pet feels about the tool Claude just called.
export async function feelTool($: EngineInterface, tool: string, input: unknown) {
  stopMusing()
  if (voice.chatter === 'off') return

  const now = toolLine(tool, input)
  const scene = voice.scene
  voice.scene = { ...scene, done: keepLast(scene.done, now, DONE_KEPT) }
  await feel($, toolPrompt(scene, now), feelingAboutTool(tool, voice.count), 'say')
}

// Claude has gone quiet to think: after a while the pet muses, and again
// every so often until Claude does something.
export function awaitThought($: EngineInterface) {
  stopMusing()
  if (voice.chatter === 'off') return

  const musing = voice.musing
  $.clock.after(MUSE_AFTER_MS, () => void muse($, musing))
}

async function muse($: EngineInterface, musing: number) {
  if (musing !== voice.musing) return

  await feel($, thinkingPrompt(voice.scene), feelingWhileThinking(voice.count), 'think')
  if (musing === voice.musing) $.clock.after(MUSE_AGAIN_MS, () => void muse($, musing))
}

// How the pet feels about the reply that just landed.
export async function remark($: EngineInterface, answer: string) {
  stopMusing()
  if (voice.chatter !== 'on' || answer.trim() === '') return

  voice.lastAskedAt = await $.clock.now()
  const text = await ask($, replyPrompt(voice.scene, answer))
  if (text !== undefined) await say($, text)
}
