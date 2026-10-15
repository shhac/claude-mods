import { atom, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

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
export const keeper: { petId: string | undefined; care: Care | undefined } = { petId: undefined, care: undefined }

const careWatch: { timer: Timer | undefined } = { timer: undefined }

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
// milestone or an achievement is celebrated by the session that made it. A
// change that finds nothing to do returns undefined: nothing is saved, though
// the care read is shown.
export async function tend($: EngineInterface, change: (care: Care, now: number) => Care | undefined) {
  const { petId, care: held } = keeper
  if (petId === undefined || held === undefined) return undefined

  const now = await $.clock.now()
  const saved = await $.store.get(storeKey(petId))
  // With nothing saved (the store cleared), this session's care is all there is.
  const care = saved === undefined ? held : careFrom(saved, now)
  const changed = change(care, now)
  if (changed === undefined) {
    await show($, care)
    return undefined
  }

  const { care: next, earned } = award(changed, now)
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
  careWatch.timer?.cancel()
  careWatch.timer = $.clock.every(WATCH_MS, () => void glance($))
}

export function stopWatchingCare() {
  careWatch.timer?.cancel()
  careWatch.timer = undefined
}

// Takes up what another session saved, quietly: the celebrating was theirs.
async function glance($: EngineInterface) {
  const { petId, care } = keeper
  if (petId === undefined || care === undefined) return

  const now = await $.clock.now()
  const saved = await $.store.get(storeKey(petId))
  if (saved === undefined) return
  // A tend or a switch while reading has newer care than the store did.
  if (keeper.petId !== petId || keeper.care !== care) return

  const next = careFrom(saved, now)
  if (JSON.stringify(next) !== JSON.stringify(care)) await show($, next)
}
