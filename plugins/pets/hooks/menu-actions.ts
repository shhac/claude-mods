import { atom, read } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { MenuState } from '../types'
import { describeAchievements } from './achievements'
import { describeCare, fed } from './care'
import { feedPet, hidePet, patPet } from './commands'
import { isSizeName, mirror, setDock, setSize } from './controls'
import { keeper } from './keeper'
import type { MenuRow } from './menu-rows'

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
export const menuMirror: { state: MenuState; rows: readonly MenuRow[]; timer: Timer | undefined } = {
  state: 'closed',
  rows: [],
  timer: undefined,
}

// A load starts closed: the timers of the last one are gone.
export function resetMenu() {
  menuMirror.state = 'closed'
  menuMirror.rows = []
  menuMirror.timer = undefined
}

function setMenu($: EngineInterface, state: MenuState) {
  menuMirror.state = state
  $.ui.invalidate('ui.render')
}

async function rowsNow($: EngineInterface): Promise<readonly MenuRow[]> {
  const care = keeper.care
  const meal = care === undefined ? undefined : fed(care, await $.clock.now())
  const feedLabel = meal !== undefined && 'waitMinutes' in meal ? `Feed (full for ${meal.waitMinutes} min)` : 'Feed'

  return [
    { kind: 'action', id: 'pat', label: '♥ Pat', isDisabled: care === undefined },
    { kind: 'action', id: 'feed', label: feedLabel, isDisabled: meal === undefined || 'waitMinutes' in meal },
    {
      kind: 'choices',
      label: 'Size',
      choices: (['small', 'medium', 'large'] as const).map(name => ({ id: `size:${name}`, label: name, isCurrent: name === mirror.size })),
    },
    {
      kind: 'action',
      id: 'dock',
      label: mirror.dock === 'conversation' ? 'Sit on the prompt' : 'Back over the chat',
      isDisabled: false,
    },
    { kind: 'action', id: 'stats', label: 'Stats', isDisabled: care === undefined },
    { kind: 'action', id: 'hide', label: 'Hide', isDisabled: false },
  ]
}

function closeIn($: EngineInterface, ms: number) {
  menuMirror.timer?.cancel()
  menuMirror.timer = $.clock.after(ms, () => void closeMenu($))
}

export async function openMenu($: EngineInterface) {
  menuMirror.rows = await rowsNow($)
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
  await closeMenu($)

  const size = id.startsWith('size:') ? id.slice('size:'.length) : undefined
  if (isSizeName(size)) return setSize($, size)
  if (id === 'dock') return setDock($, mirror.dock === 'conversation' ? 'prompt' : 'conversation')
  if (id === 'hide') return hidePet($)

  const current = await read($, pet)
  if (current === null) return
  if (id === 'pat') return patPet($)
  if (id === 'feed') return feedPet($, current.displayName)
  if (id === 'stats' && keeper.care !== undefined) {
    const stats = describeCare(current.displayName, keeper.care, await $.clock.now())
    $.ui.toast(`${stats}\n${describeAchievements(keeper.care)}`, { timeoutMs: 10000 })
  }
}
