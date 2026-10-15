import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Dock } from '../types'
import { ACTIVITY_LABEL, REACTION_LABEL } from './atlas'
import { isHungry, isSleepy } from './care'
import { mirror } from './controls'
import type { Look } from './drawings'
import { keeper } from './keeper'
import { describeStage } from './stage'

// What the pet is, and what it's up to, as every place that shows it reads.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const activity = atom({ plugin: 'pets', key: 'activity' } as const, 'ready')
const reaction = atom({ plugin: 'pets', key: 'reaction' } as const, null)
const detail = atom({ plugin: 'pets', key: 'detail' } as const, null)
const isHovered = atom({ plugin: 'pets', key: 'isHovered' } as const, false)

// What the pet does, shown while the pointer is over it or its name tag.
const HINTS: Record<Dock, string> = {
  conversation: 'drag · 2-click: dock · right-click: menu',
  prompt: 'drag, 2-click: undock · right-click: menu',
  sidebar: '',
}

// What a drawing needs of the pet: whether there is one, and its frames.
export async function petLook($: EngineInterface): Promise<Look | undefined> {
  if (await read($, isHidden)) return undefined

  const current = await read($, pet)
  return current === null ? undefined : { displayName: current.displayName, framesDir: current.framesDir }
}

// Between turns the pet says how it is: sleepy, hungry, or just ready.
async function restingLabel($: EngineInterface) {
  const care = keeper.care
  if (care === undefined) return ACTIVITY_LABEL.ready
  if (isSleepy(care, await $.clock.now())) return 'Sleepy 💤'
  return isHungry(care) ? 'Hungry' : ACTIVITY_LABEL.ready
}

export async function statusLine($: EngineInterface) {
  if (mirror.isDebug) return `${mirror.hostKind} · ${describeStage()}`
  if ((await read($, isHovered)) && mirror.hoverKey === mirror.planKey) return HINTS[mirror.dock]

  const shownReaction = await read($, reaction)
  if (shownReaction !== null) return REACTION_LABEL[shownReaction]

  const tool = await read($, detail)
  const now = await read($, activity)
  const label = now === 'ready' ? await restingLabel($) : ACTIVITY_LABEL[now]
  return tool === null ? label : `${label} · ${tool}`
}
