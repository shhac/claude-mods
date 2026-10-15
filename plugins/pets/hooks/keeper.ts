import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { badgeOf, careFrom, levelOf, welcomeBack } from './care'
import type { Care } from './care'
import { react } from './player'
import { say } from './voice'

const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')

// The care of the pet on screen; each pet keeps its own in the store.
export const keeper: { petId: string | undefined; care: Care | undefined } = { petId: undefined, care: undefined }

const storeKey = (petId: string) => `care:${petId}`

export async function loadCare($: EngineInterface, petId: string) {
  const now = await $.clock.now()
  const care = welcomeBack(careFrom(await $.store.get(storeKey(petId)), now), now)

  keeper.petId = petId
  keeper.care = care
  await $.store.set(storeKey(petId), care)
  await update($, badge, () => badgeOf(care))
  return care
}

// Applies a change to the pet's care and saves it; a new level is celebrated.
export async function tend($: EngineInterface, change: (care: Care, now: number) => Care) {
  const { petId, care } = keeper
  if (petId === undefined || care === undefined) return undefined

  const now = await $.clock.now()
  const next = change(care, now)
  keeper.care = next
  await $.store.set(storeKey(petId), next)
  await update($, badge, () => badgeOf(next))

  const level = levelOf(next.xp)
  if (level > levelOf(care.xp)) {
    await react($, 'levelUp')
    await say($, `Level ${level}! ✨`)
  }

  return next
}
