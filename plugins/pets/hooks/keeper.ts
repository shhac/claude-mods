import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { award } from './achievements'
import { badgeOf, careFrom, levelOf, milestone, welcomeBack } from './care'
import type { Care } from './care'
import { react } from './player'
import { noteCare, say } from './voice'

const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')

// The care of the pet on screen; each pet keeps its own in the store.
export const keeper: { petId: string | undefined; care: Care | undefined } = { petId: undefined, care: undefined }

const storeKey = (petId: string) => `care:${petId}`

export async function loadCare($: EngineInterface, petId: string) {
  const now = await $.clock.now()
  const care = welcomeBack(careFrom(await $.store.get(storeKey(petId)), now), now)

  keeper.petId = petId
  keeper.care = care
  noteCare(care.mood, levelOf(care.xp))
  await $.store.set(storeKey(petId), care)
  await update($, badge, () => badgeOf(care))
  return care
}

// Applies a change to the pet's care and saves it; a new level, a milestone
// or an achievement is celebrated.
export async function tend($: EngineInterface, change: (care: Care, now: number) => Care) {
  const { petId, care } = keeper
  if (petId === undefined || care === undefined) return undefined

  const now = await $.clock.now()
  const { care: next, earned } = award(change(care, now), now)
  keeper.care = next
  noteCare(next.mood, levelOf(next.xp))
  await $.store.set(storeKey(petId), next)
  await update($, badge, () => badgeOf(next))

  // A level or milestone gets the jump; an achievement only the bubble, so
  // whatever the pet was doing (cheering a reply, say) carries on.
  const level = levelOf(next.xp)
  const big = level > levelOf(care.xp) ? `Level ${level}! ✨` : milestone(care, next)
  const cheers = [big, ...earned.map(one => `🏆 ${one.name}`)].filter(cheer => cheer !== undefined)
  if (big !== undefined) await react($, 'levelUp')
  if (cheers.length > 0) await say($, cheers.join(' · '))

  return next
}
