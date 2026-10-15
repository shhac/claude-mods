import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { fed, isHungry, petted } from './care'
import type { Care } from './care'
import { isDock, isSizeName, setDock, setSize } from './controls'
import { keeper, tend } from './keeper'
import { TRICKS, doTrick, isFetchTired, isUnlocked, playFetch } from './play'
import { react } from './player'
import { say } from './voice'

// What the pet can be asked to do, and the buttons for it: the menu, the
// sidebar and /pet all share them.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)

export type ActionButton = { id: string; label: string; isDisabled: boolean }

export const patButton = (care: Care | undefined): ActionButton => ({ id: 'pat', label: '♥ Pat', isDisabled: care === undefined })

export function feedButton(care: Care | undefined, now: number): ActionButton {
  const meal = care === undefined ? undefined : fed(care, now)
  if (care === undefined || meal === undefined) return { id: 'feed', label: 'Feed', isDisabled: true }
  if ('waitMinutes' in meal) return { id: 'feed', label: `Feed (full for ${meal.waitMinutes} min)`, isDisabled: true }
  return { id: 'feed', label: isHungry(care) ? 'Feed (hungry!)' : 'Feed', isDisabled: false }
}

export function fetchButton(care: Care | undefined): ActionButton {
  const isTooTired = isFetchTired()
  return { id: 'fetch', label: isTooTired ? 'Fetch (too tired)' : '🎾 Fetch', isDisabled: care === undefined || isTooTired }
}

export const trickButtons = (): readonly ActionButton[] =>
  TRICKS.map(trick => ({
    id: `trick:${trick.id}`,
    label: isUnlocked(trick) ? trick.name : `${trick.name}·Lv${trick.level}`,
    isDisabled: !isUnlocked(trick),
  }))

// Resolves what to say back, for /pet.
export async function feedPet($: EngineInterface, name: string) {
  const care = keeper.care
  if (care === undefined) return 'No pet to feed.'

  const meal = fed(care, await $.clock.now())
  if ('waitMinutes' in meal) return `${name} is still full. Try again in ${meal.waitMinutes} min.`

  await tend($, () => meal.care)
  await react($, 'happy')
  await say($, 'nom nom nom 🍪')
  return `${name} loved that.`
}

export async function patPet($: EngineInterface) {
  await tend($, petted)
  await react($, 'happy')
}

export async function hidePet($: EngineInterface, isOff = true) {
  await update($, isHidden, () => isOff)
  await $.store.set('isHidden', isOff)
}

const afterPrefix = (id: string, prefix: string) => (id.startsWith(prefix) ? id.slice(prefix.length) : undefined)

// What a pick does, by its id, from the menu or a sidebar button.
export async function act($: EngineInterface, id: string) {
  if (id === 'fetch') return playFetch($)
  const trick = afterPrefix(id, 'trick:')
  if (trick !== undefined) return doTrick($, trick)

  const size = afterPrefix(id, 'size:')
  if (isSizeName(size)) return setSize($, size)
  const place = afterPrefix(id, 'place:')
  if (isDock(place)) return setDock($, place)
  if (id === 'hide') return hidePet($)

  const current = await read($, pet)
  if (current === null) return
  if (id === 'pat') return patPet($)
  if (id === 'feed') return feedPet($, current.displayName)
}
