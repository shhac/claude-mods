import type { EngineInterface, Timer } from 'claude-code'

import type { MenuState } from '../types'
import { achievementCount } from './achievements'
import { act, feedButton, fetchButton, patButton, trickButtons } from './actions'
import type { ActionButton } from './actions'
import type { Care } from './care'
import { PLACES, SIZE_NAMES, mirror } from './controls'
import { keeper } from './keeper'
import type { MenuRow } from './menu-rows'
import { achievementLines, headerLine, statsLines } from './pages'

// The pet's right-click menu: what it offers, when it closes, and what a
// pick does.

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

export type MenuPage = 'actions' | 'stats' | 'achievements' | 'config'
const PAGES = new Set<string>(['actions', 'stats', 'achievements', 'config'])
const isPage = (value: string): value is MenuPage => PAGES.has(value)

const action = (id: string, label: string, isDisabled = false): MenuRow => ({ kind: 'action', id, label, isDisabled })
const back = action('page:actions', '‹ Back')
const text = (label: string): MenuRow => ({ kind: 'text', label, isDim: false })

const asRow = (button: ActionButton): MenuRow => ({ kind: 'action', ...button })

function actionRows(care: Care | undefined, now: number): readonly MenuRow[] {
  const tricks = trickButtons().map(button => ({ ...button, isCurrent: !button.isDisabled }))

  return [
    asRow(patButton(care)),
    asRow(feedButton(care, now)),
    asRow(fetchButton(care)),
    { kind: 'choices', label: 'Tricks', choices: tricks },
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
  if (page === 'config') return configRows()
  // Stats and achievements need a pet's care; without one they can't be picked.
  if (page === 'actions' || care === undefined) return actionRows(care, now)
  if (page === 'stats') return [text(headerLine(care)), ...statsLines(care, now).map(text), back]
  return [...achievementLines(care).map(line => ({ kind: 'text' as const, label: line.label, isDim: !line.isEarned })), back]
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
