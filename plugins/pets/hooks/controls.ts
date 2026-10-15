import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Dock, Offset, SizeName } from '../types'
import { columnsForRows } from './atlas'
import { forgetRows } from './stage'
import { say } from './voice'
import type { Size } from './stage'

// Where the pet is, how big, and where it's docked: the state, kept for
// next time, and its setters. (Moving it by pointer is gestures.ts.)

export const HOME_OFFSET: Offset = { right: 0, lift: 0 }
export const SIZE_ROWS: Record<SizeName, number> = { small: 3, medium: 4, large: 6 }
export const NEXT_SIZE: Record<SizeName, SizeName> = { small: 'medium', medium: 'large', large: 'small' }

const offset = atom({ plugin: 'pets', key: 'offset' } as const, HOME_OFFSET)

// The sizes and places there are, in the order every list shows them.
export const SIZE_NAMES: readonly SizeName[] = ['small', 'medium', 'large']
export const PLACES: readonly { id: Dock; label: string }[] = [
  { id: 'conversation', label: 'chat' },
  { id: 'prompt', label: 'prompt' },
  { id: 'sidebar', label: 'sidebar' },
]

export const isOffset = (value: unknown): value is Offset =>
  typeof value === 'object' &&
  value !== null &&
  'right' in value &&
  typeof value.right === 'number' &&
  'lift' in value &&
  typeof value.lift === 'number'

export const isSizeName = (value: unknown): value is SizeName => SIZE_NAMES.some(name => name === value)
export const isDock = (value: unknown): value is Dock => PLACES.some(place => place.id === value)

// The sidebar's pane, and the width it asks for beside the conversation. The
// id is ours alone (pane ids take no dots, so the namespace is dashed).
export const SIDEBAR = 'app-paulie-claude-mods-pets-sidebar'
const SIDEBAR_COLUMNS = 34

export const sizeOf = (name: SizeName): Size => ({ rows: SIZE_ROWS[name], columns: columnsForRows(SIZE_ROWS[name]) })

// Where the host row last drew the catcher, in its own lines, so a drag can
// hold it there.
export type Catcher = { top: number; right: number; height: number }

export type Drag = {
  // Which press: the posting row, its catcher and its press count.
  gesture: string
  requestId: string
  from: Offset
  catcher: Catcher | undefined
  watchdog: Timer | undefined
}

// What the drawing hooks need without subscribing to it: a row that reads an
// atom redraws whenever it changes, and most rows draw nothing of the pet.
export const mirror: {
  offset: Offset
  size: SizeName
  dock: Dock
  planKey: string
  catcher: { requestId: string; at: Catcher } | undefined
  drag: Drag | undefined
  lastClickAt: number
  // Which catchers the pointer is over, the pet's or the name tag's: moving
  // from one to another can tell of the new one first.
  hovering: Set<string>
  // Draws the catcher, so where the pet can be grabbed shows.
  isDebug: boolean
  // The frame just went out: drawn blank a moment, as the bubble is.
  isFrameFading: boolean
  // Where the catcher was when the pointer came over it.
  hoverKey: string
  // The footer's drawing, which holds the docked pet's catcher.
  footerId: string
  // What kind of row hosts the pet, for /pet debug.
  hostKind: string
} = {
  offset: HOME_OFFSET,
  size: 'medium',
  dock: 'conversation',
  planKey: '',
  catcher: undefined,
  drag: undefined,
  lastClickAt: Number.NEGATIVE_INFINITY,
  hovering: new Set(),
  isDebug: false,
  isFrameFading: false,
  hoverKey: '',
  footerId: '',
  hostKind: '',
}

// A load starts the module's own state over; the session's state and the
// store keep what the person chose.
export function resetControls(defaultSize: SizeName) {
  forgetRows()
  mirror.offset = HOME_OFFSET
  mirror.size = defaultSize
  mirror.dock = 'conversation'
  mirror.planKey = ''
  mirror.catcher = undefined
  mirror.drag = undefined
  mirror.lastClickAt = Number.NEGATIVE_INFINITY
  mirror.hovering.clear()
  mirror.isDebug = false
}

export async function restoreControls($: EngineInterface, defaultSize: SizeName) {
  const savedOffset = await $.store.get('offset')
  if (isOffset(savedOffset)) await setOffset($, savedOffset)

  const savedSize = await $.store.get('size')
  mirror.size = isSizeName(savedSize) ? savedSize : defaultSize

  mirror.isDebug = (await $.store.get('debug')) === true

  // A sidebar opened unasked needs a wide terminal; without one the pet
  // floats this session, and the choice is kept for the next.
  const savedDock = await $.store.get('dock')
  const wanted = isDock(savedDock) ? savedDock : 'conversation'
  mirror.dock = wanted === 'sidebar' && !(await openSidebar($)) ? 'conversation' : wanted
}

// Says whether the sidebar is drawn. One that isn't would wait and turn up
// later, beside a pet already drawn elsewhere, so it's closed.
async function openSidebar($: EngineInterface) {
  const opened = await $.ui.open({ id: SIDEBAR, title: 'Pet', columns: SIDEBAR_COLUMNS })
  if (opened.isPlaced) return true

  await $.ui.close({ id: SIDEBAR })
  return false
}

export async function setOffset($: EngineInterface, next: Offset) {
  mirror.offset = next
  const was = await read($, offset)
  if (was.right !== next.right || was.lift !== next.lift) await update($, offset, () => next)
}

// Size and place change seldom, so every drawing redraws for them: the
// mirror is all there is of them, kept for next time in the store.
export async function setSize($: EngineInterface, next: SizeName) {
  mirror.size = next
  await $.store.set('size', next)
  $.ui.invalidate('ui.render')
}

// Says whether the pet went there: the sidebar needs room.
export async function setDock($: EngineInterface, next: Dock) {
  if (next === 'sidebar' && mirror.dock !== 'sidebar' && !(await openSidebar($))) {
    await say($, 'no room for my sidebar here 😿')
    return false
  }

  const was = mirror.dock
  await settleDock($, next)
  if (was === 'sidebar' && next !== 'sidebar') await $.ui.close({ id: SIDEBAR })
  return true
}

// Where the pet is now, kept for next time; the sidebar already open or shut.
export async function settleDock($: EngineInterface, next: Dock) {
  mirror.dock = next
  await $.store.set('dock', next)
  $.ui.invalidate('ui.render')
}

export async function setDebug($: EngineInterface, isDebug: boolean) {
  mirror.isDebug = isDebug
  await $.store.set('debug', isDebug)
  $.ui.invalidate('ui.render')
}

export async function goHome($: EngineInterface) {
  await setOffset($, HOME_OFFSET)
  await $.store.set('offset', HOME_OFFSET)
  if (mirror.dock !== 'conversation') await setDock($, 'conversation')
}
