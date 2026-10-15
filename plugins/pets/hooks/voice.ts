import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { fitBubble, remarkPrompt, remarkSystem, toolLine, toolQuestion } from './chatter'

export type Chatter = 'on' | 'quiet' | 'off'

const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)

const BUBBLE_MS = 8000
// A bubble is blanked before it goes: cells a floating box leaves can keep
// their old text until something else draws over them.
const BLANK_MS = 400
// Summaries cost a model call, so one at most this often.
const SUMMARY_GAP_MS = 10000
const MODEL = 'haiku'

export const voice: {
  chatter: Chatter
  generation: number
  lastSummaryAt: number
  summaries: Map<string, string>
} = {
  chatter: 'on',
  generation: 0,
  lastSummaryAt: 0,
  summaries: new Map(),
}

export async function say($: EngineInterface, text: string) {
  if (voice.chatter === 'off') return

  const line = fitBubble(text)
  if (line === '') return

  voice.generation += 1
  const generation = voice.generation
  await update($, bubble, () => line)
  $.clock.after(BUBBLE_MS, () => void blank($, generation))
}

async function blank($: EngineInterface, generation: number) {
  if (generation !== voice.generation) return

  const shown = await read($, bubble)
  if (shown === null) return

  await update($, bubble, () => ' '.repeat(shown.length))
  $.clock.after(BLANK_MS, () => void hush($, generation))
}

async function hush($: EngineInterface, generation: number) {
  if (generation === voice.generation) await update($, bubble, () => null)
}

async function ask($: EngineInterface, system: string | undefined, prompt: string) {
  try {
    const reply = await $.model.complete({ model: MODEL, system, prompt, maxTokens: 60, effort: 'low', timeoutMs: 8000 })
    return reply.isAnswered ? reply.text : undefined
  } catch {
    return undefined
  }
}

// A line about the tool Claude just called; a model summary for the calls the
// input doesn't explain, while chatter is on and not too often.
export async function narrateTool($: EngineInterface, tool: string, input: unknown) {
  if (voice.chatter === 'off') return

  const line = toolLine(tool, input)
  if (line !== undefined) return say($, line)
  if (voice.chatter !== 'on') return

  const question = toolQuestion(tool, input)
  const known = voice.summaries.get(question)
  if (known !== undefined) return say($, known)

  const now = await $.clock.now()
  if (now - voice.lastSummaryAt < SUMMARY_GAP_MS) return
  voice.lastSummaryAt = now

  const summary = await ask($, undefined, question)
  if (summary === undefined) return

  voice.summaries.set(question, summary)
  return say($, summary)
}

// A remark in the pet's voice on the reply that just landed.
export async function remark($: EngineInterface, name: string, answer: string) {
  if (voice.chatter !== 'on' || answer.trim() === '') return

  const text = await ask($, remarkSystem(name), remarkPrompt(answer))
  if (text !== undefined) await say($, text)
}
