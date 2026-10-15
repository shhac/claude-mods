import { atom, read } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Care } from '../types'
import { award } from './achievements'
import { badgeOf, careFrom, levelOf, milestone, welcomeBack } from './care'
import { react } from './player'
import { noteCare, say } from './voice'

const care = atom({ plugin: 'pets', key: 'care' } as const, null)

// Other sessions look after the same pet, so what this one saved soon goes
// stale; this often it takes up theirs.
const WATCH_MS = 5000

// Whose care is on screen; each pet keeps its own in the store.
const keeper: { petId: string | undefined } = { petId: undefined }

const careWatch: { timer: Timer | undefined } = { timer: undefined }

const storeKey = (petId: string) => `care:${petId}`

async function show($: EngineInterface, next: Care) {
  noteCare(next.mood, levelOf(next.xp))
  await $.state.set({ plugin: 'pets', key: 'care' }, next)
}

// The care of the pet on screen; read while drawing, a change redraws. One
// dispatch reads one moment: a care shown in it isn't read back until the next.
export async function careNow($: EngineInterface) {
  return (await read($, care)) ?? undefined
}

// Level and mood hearts, as the caption shows them.
export async function badgeNow($: EngineInterface) {
  const shown = await careNow($)
  return shown === undefined ? '' : badgeOf(shown)
}

export async function loadCare($: EngineInterface, petId: string) {
  const now = await $.clock.now()
  // Coming back can earn one (a streak), and older stores predate them.
  const { care: loaded, earned } = award(welcomeBack(careFrom(await $.store.get(storeKey(petId)), now), now), now)

  keeper.petId = petId
  await show($, loaded)
  await $.store.set(storeKey(petId), loaded)
  if (earned.length > 0) await say($, earned.map(one => `🏆 ${one.name}`).join(' · '))
  return loaded
}

// Applies a change to the pet's care as saved, not as this session last saw
// it, so other sessions' changes add up with this one's; a new level, a
// milestone or an achievement is celebrated by the session that made it. A
// change that finds nothing to do returns undefined: nothing is saved, though
// the care read is shown.
export async function tend($: EngineInterface, change: (care: Care, now: number) => Care | undefined) {
  const { petId } = keeper
  const held = await careNow($)
  if (petId === undefined || held === undefined) return undefined

  const now = await $.clock.now()
  const saved = await $.store.get(storeKey(petId))
  // With nothing saved (the store cleared), this session's care is all there
  // is: as of the dispatch's start, which is all a second tend in it can see.
  const was = saved === undefined ? held : careFrom(saved, now)
  const changed = change(was, now)
  if (changed === undefined) {
    await show($, was)
    return undefined
  }

  const { care: next, earned } = award(changed, now)
  await $.store.set(storeKey(petId), next)
  await show($, next)

  // A level or milestone gets the jump; an achievement only the bubble, so
  // whatever the pet was doing (cheering a reply, say) carries on.
  const level = levelOf(next.xp)
  const big = level > levelOf(was.xp) ? `Level ${level}! ✨` : milestone(was, next)
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
  const { petId } = keeper
  const { value: held, version } = await $.state.get({ plugin: 'pets', key: 'care' })
  if (petId === undefined || held === undefined || held === null) return

  const now = await $.clock.now()
  const saved = await $.store.get(storeKey(petId))
  if (saved === undefined) return

  const next = careFrom(saved, now)
  if (JSON.stringify(next) === JSON.stringify(held)) return

  // A tend or a switch while reading moved the care on: theirs stands.
  const { isSet } = await $.state.set({ plugin: 'pets', key: 'care' }, next, { ifVersion: version })
  if (isSet) noteCare(next.mood, levelOf(next.xp))
}
