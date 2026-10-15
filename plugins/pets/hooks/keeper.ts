import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { award } from './achievements'
import { badgeOf, careFrom, levelOf, milestone, welcomeBack } from './care'
import type { Care } from './care'
import { react } from './player'
import { noteCare, say } from './voice'

const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')

// Other sessions look after the same pet, so what this one saved soon goes
// stale; this often it takes up theirs.
const WATCH_MS = 5000

// The care of the pet on screen; each pet keeps its own in the store.
export const keeper: { petId: string | undefined; care: Care | undefined; watching: number } = {
  petId: undefined,
  care: undefined,
  watching: 0,
}

const storeKey = (petId: string) => `care:${petId}`

async function show($: EngineInterface, care: Care) {
  keeper.care = care
  noteCare(care.mood, levelOf(care.xp))
  await update($, badge, () => badgeOf(care))
}

export async function loadCare($: EngineInterface, petId: string) {
  const now = await $.clock.now()
  // Coming back can earn one (a streak), and older stores predate them.
  const { care, earned } = award(welcomeBack(careFrom(await $.store.get(storeKey(petId)), now), now), now)

  keeper.petId = petId
  await show($, care)
  await $.store.set(storeKey(petId), care)
  if (earned.length > 0) await say($, earned.map(one => `🏆 ${one.name}`).join(' · '))
  return care
}

// Applies a change to the pet's care as saved, not as this session last saw
// it, so other sessions' changes add up with this one's; a new level, a
// milestone or an achievement is celebrated by the session that made it.
export async function tend($: EngineInterface, change: (care: Care, now: number) => Care) {
  const { petId } = keeper
  if (petId === undefined || keeper.care === undefined) return undefined

  const now = await $.clock.now()
  const care = careFrom(await $.store.get(storeKey(petId)), now)
  const { care: next, earned } = award(change(care, now), now)
  await $.store.set(storeKey(petId), next)
  await show($, next)

  // A level or milestone gets the jump; an achievement only the bubble, so
  // whatever the pet was doing (cheering a reply, say) carries on.
  const level = levelOf(next.xp)
  const big = level > levelOf(care.xp) ? `Level ${level}! ✨` : milestone(care, next)
  const cheers = [big, ...earned.map(one => `🏆 ${one.name}`)].filter(cheer => cheer !== undefined)
  if (big !== undefined) await react($, 'levelUp')
  if (cheers.length > 0) await say($, cheers.join(' · '))

  return next
}

// Started per load from session.start, as a reload drops the timer.
export function watchCare($: EngineInterface) {
  keeper.watching += 1
  void glance($, keeper.watching)
}

export function stopWatchingCare() {
  keeper.watching += 1
}

// Takes up what another session saved, quietly: the celebrating was theirs.
async function glance($: EngineInterface, generation: number) {
  if (generation !== keeper.watching) return

  const { petId, care } = keeper
  if (petId !== undefined && care !== undefined) {
    const saved = await $.store.get(storeKey(petId))
    // A tend or a switch while reading has newer care than the store did.
    const isUnchanged = keeper.petId === petId && keeper.care === care
    if (isUnchanged && saved !== undefined && JSON.stringify(saved) !== JSON.stringify(care)) {
      await show($, careFrom(saved, await $.clock.now()))
    }
  }
  $.clock.after(WATCH_MS, () => void glance($, generation))
}
