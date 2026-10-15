import { atom, read } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { MenuState } from '../types'
import { fed, isHungry } from './care'
import type { Care } from './care'
import { feedPet, hidePet, patPet } from './commands'
import { PLACES, SIZE_NAMES, isDock, isSizeName, mirror, setDock, setSize } from './controls'
import { keeper } from './keeper'
import type { MenuRow } from './menu-rows'
import { achievementCount } from './achievements'
import { achievementLines, headerLine, statsLines } from './pages'
import { TRICKS, doTrick, isFetchTired, isUnlocked, playFetch } from './play'

// The pet's right-click menu: what it offers, when it closes, and what a
// pick does.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)

// Untouched this long, the menu closes; left by the pointer, sooner.
const IDLE_MS = 10000
const LEFT_MS = 1500
// Drawn blank a moment as it goes, so it leaves no cells behind.
const FADE_MS = 400

// Kept out of the session's state: only the host row draws the menu, and a
// row that read an atom would redraw on every change of it.
export const menuMirror: { state: MenuState; page: MenuPage; rows: readonly MenuRow[]; timer: Timer | undefined } = {
  state: 'closed',
  page: 'actions',
  rows: [],
  timer: undefined,
}

// A load starts closed: the timers of the last one are gone.
export function resetMenu() {
  menuMirror.state = 'closed'
  menuMirror.page = 'actions'
  menuMirror.rows = []
  menuMirror.timer = undefined
}

function setMenu($: EngineInterface, state: MenuState) {
  menuMirror.state = state
  $.ui.invalidate('ui.render')
}

function feedLabel(care: Care | undefined, now: number) {
  const meal = care === undefined ? undefined : fed(care, now)
  if (meal !== undefined && 'waitMinutes' in meal) return `Feed (full for ${meal.waitMinutes} min)`
  return care !== undefined && isHungry(care) ? 'Feed (hungry!)' : 'Feed'
}

export type MenuPage = 'actions' | 'stats' | 'achievements' | 'config'
const PAGES = new Set<string>(['actions', 'stats', 'achievements', 'config'])
const isPage = (value: string): value is MenuPage => PAGES.has(value)

const action = (id: string, label: string, isDisabled = false): MenuRow => ({ kind: 'action', id, label, isDisabled })
const back = action('page:actions', '‹ Back')
const text = (label: string): MenuRow => ({ kind: 'text', label, isDim: false })

export function feedButton(care: Care | undefined, now: number) {
  const meal = care === undefined ? undefined : fed(care, now)
  return { id: 'feed', label: feedLabel(care, now), isDisabled: meal === undefined || 'waitMinutes' in meal }
}

export const fetchButton = (care: Care | undefined) => {
  const isTooTired = isFetchTired()
  return { id: 'fetch', label: isTooTired ? 'Fetch (too tired)' : '🎾 Fetch', isDisabled: care === undefined || isTooTired }
}

export const trickButtons = () =>
  TRICKS.map(trick => ({
    id: `trick:${trick.id}`,
    label: isUnlocked(trick) ? trick.name : `${trick.name}·Lv${trick.level}`,
    isDisabled: !isUnlocked(trick),
  }))

function actionRows(care: Care | undefined, now: number): readonly MenuRow[] {
  const meal = care === undefined ? undefined : fed(care, now)
  const isTooTired = isFetchTired()

  return [
    action('pat', '♥ Pat', care === undefined),
    action('feed', feedLabel(care, now), meal === undefined || 'waitMinutes' in meal),
    action('fetch', isTooTired ? 'Fetch (too tired)' : '🎾 Fetch', care === undefined || isTooTired),
    {
      kind: 'choices',
      label: 'Tricks',
      choices: TRICKS.map(trick => ({
        id: `trick:${trick.id}`,
        label: isUnlocked(trick) ? trick.name : `${trick.name}·Lv${trick.level}`,
        isCurrent: isUnlocked(trick),
        isDisabled: !isUnlocked(trick),
      })),
    },
    action('page:stats', 'Stats ›', care === undefined),
    action('page:achievements', care === undefined ? 'Achievements ›' : `Achievements ${achievementCount(care)} ›`, care === undefined),
    action('page:config', 'Config ›'),
  ]
}

function configRows(): readonly MenuRow[] {
  const place = PLACES.map(one => ({ id: `place:${one.id}`, label: one.label, isCurrent: one.id === mirror.dock, isDisabled: false }))
  const size = SIZE_NAMES.map(name => ({ id: `size:${name}`, label: name, isCurrent: name === mirror.size, isDisabled: false }))

  return [
    { kind: 'choices', label: 'Place', choices: place },
    { kind: 'choices', label: 'Size ', choices: size },
    action('hide', 'Hide (/pet on brings it back)'),
    back,
  ]
}

async function rowsNow($: EngineInterface, page: MenuPage): Promise<readonly MenuRow[]> {
  const care = keeper.care
  const now = await $.clock.now()
  if (page === 'config' || care === undefined) return page === 'actions' ? actionRows(care, now) : configRows()
  if (page === 'stats') return [{ kind: 'text', label: headerLine(care), isDim: false }, ...statsLines(care, now).map(text), back]
  if (page === 'achievements') {
    return [...achievementLines(care).map(line => ({ kind: 'text' as const, label: line.label, isDim: !line.isEarned })), back]
  }
  return actionRows(care, now)
}

function closeIn($: EngineInterface, ms: number) {
  menuMirror.timer?.cancel()
  menuMirror.timer = $.clock.after(ms, () => void closeMenu($))
}

// It opens on the actions; the other pages are a pick away.
export async function openMenu($: EngineInterface, page: MenuPage = 'actions') {
  menuMirror.page = page
  menuMirror.rows = await rowsNow($, page)
  setMenu($, 'open')
  closeIn($, IDLE_MS)
}

export async function closeMenu($: EngineInterface) {
  if (menuMirror.state !== 'open') return

  menuMirror.timer?.cancel()
  setMenu($, 'fading')
  $.clock.after(FADE_MS, () => shut($))
}

function shut($: EngineInterface) {
  if (menuMirror.state === 'fading') setMenu($, 'closed')
}

// A right click on the pet or its name tag.
export async function toggleMenu($: EngineInterface) {
  if (menuMirror.state === 'open') return closeMenu($)
  return openMenu($)
}

export function menuHover($: EngineInterface, isOver: boolean) {
  closeIn($, isOver ? IDLE_MS : LEFT_MS)
}

export async function pickFromMenu($: EngineInterface, id: string) {
  const page = id.startsWith('page:') ? id.slice('page:'.length) : undefined
  if (page !== undefined && isPage(page)) return openMenu($, page)

  await closeMenu($)
  return act($, id)
}

// What a pick does, from the menu or a sidebar button.
export async function act($: EngineInterface, id: string) {
  if (id === 'fetch') return playFetch($)
  if (id.startsWith('trick:')) return doTrick($, id.slice('trick:'.length))

  const size = id.startsWith('size:') ? id.slice('size:'.length) : undefined
  if (isSizeName(size)) return setSize($, size)
  const place = id.startsWith('place:') ? id.slice('place:'.length) : undefined
  if (isDock(place)) return setDock($, place)
  if (id === 'hide') return hidePet($)

  const current = await read($, pet)
  if (current === null) return
  if (id === 'pat') return patPet($)
  if (id === 'feed') return feedPet($, current.displayName)
}
