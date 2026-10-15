import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Dock, Offset, SizeName } from '../types'
import { columnsForRows } from './atlas'
import { petted } from './care'
import { tend } from './keeper'
import { react, steer } from './player'
import { belowRows, forgetRows, planFor, screen } from './stage'
import type { Size } from './stage'

// Moving the pet, resizing it and docking it, by drag, click or command.

export const HOME_OFFSET: Offset = { right: 0, lift: 0 }
export const SIZE_ROWS: Record<SizeName, number> = { small: 3, medium: 4, large: 6 }
export const NEXT_SIZE: Record<SizeName, SizeName> = { small: 'medium', medium: 'large', large: 'small' }
const DOUBLE_CLICK_MS = 450
// A drag whose release never arrives (its row went away) ends on its own.
const DRAG_TIMEOUT_MS = 1500

const offset = atom({ plugin: 'pets', key: 'offset' } as const, HOME_OFFSET)
const size = atom({ plugin: 'pets', key: 'size' } as const, 'medium')
const dock = atom({ plugin: 'pets', key: 'dock' } as const, 'conversation')
const isHovered = atom({ plugin: 'pets', key: 'isHovered' } as const, false)

const SIZE_NAMES = new Set<string>(['small', 'medium', 'large'])

export const isOffset = (value: unknown): value is Offset =>
  typeof value === 'object' &&
  value !== null &&
  'right' in value &&
  typeof value.right === 'number' &&
  'lift' in value &&
  typeof value.lift === 'number'

export const isSizeName = (value: unknown): value is SizeName => typeof value === 'string' && SIZE_NAMES.has(value)
export const isDock = (value: unknown): value is Dock => value === 'conversation' || value === 'prompt'

export const sizeOf = (name: SizeName): Size => ({ rows: SIZE_ROWS[name], columns: columnsForRows(SIZE_ROWS[name]) })

// Where the host row last drew the catcher, in its own lines, so a drag can
// hold it there.
export type Catcher = { top: number; right: number; height: number }

type Drag = {
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
  await update($, size, () => mirror.size)

  mirror.isDebug = (await $.store.get('debug')) === true

  const savedDock = await $.store.get('dock')
  mirror.dock = isDock(savedDock) ? savedDock : 'conversation'
  await update($, dock, () => mirror.dock)
}

export async function setOffset($: EngineInterface, next: Offset) {
  mirror.offset = next
  const was = await read($, offset)
  if (was.right !== next.right || was.lift !== next.lift) await update($, offset, () => next)
}

export async function setSize($: EngineInterface, next: SizeName) {
  mirror.size = next
  await update($, size, () => next)
  await $.store.set('size', next)
}

export async function setDock($: EngineInterface, next: Dock) {
  mirror.dock = next
  await update($, dock, () => next)
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

const FRAME_FADE_MS = 400

async function lightUp($: EngineInterface) {
  const isLit = mirror.hovering.size > 0
  if ((await read($, isHovered)) === isLit) return

  mirror.isFrameFading = !isLit
  await update($, isHovered, () => isLit)
  if (!isLit) $.clock.after(FRAME_FADE_MS, () => fadeOut($))
}

function fadeOut($: EngineInterface) {
  if (!mirror.isFrameFading) return
  mirror.isFrameFading = false
  $.ui.invalidate('ui.render')
}

// Typing can take the pet from under a resting pointer, and no catcher
// tells it left. A moved catcher is caught by the host row, which checks
// the plan the light was lit for.
export async function forgetHover($: EngineInterface) {
  if (mirror.hovering.size === 0) return
  mirror.hovering.clear()
  await lightUp($)
}

// The pointer came over a catcher or the name tag, or left it.
export async function hover($: EngineInterface, catcher: string, isOver: boolean) {
  mirror.hoverKey = mirror.planKey
  if (isOver) mirror.hovering.add(catcher)
  else mirror.hovering.delete(catcher)
  await lightUp($)
}

// A drop moves the catcher from under the pointer, so it never tells it left.
async function endDrag($: EngineInterface) {
  mirror.drag?.watchdog?.cancel()
  mirror.drag = undefined
  mirror.hovering.clear()
  steer($, undefined)
  await lightUp($)
  $.ui.invalidate('ui.render')
}

// Keeps a drag alive while messages come; one that stops hearing ends itself.
function guardDrag($: EngineInterface, drag: Drag) {
  drag.watchdog?.cancel()
  drag.watchdog = $.clock.after(DRAG_TIMEOUT_MS, () => {
    if (mirror.drag === drag) void endDrag($)
  })
}

// Moves the pet to where a drag says, held inside the conversation.
async function moveTo($: EngineInterface, drag: Drag, wanted: Offset, isDrop: boolean) {
  const was = mirror.offset
  const at = planFor(wanted, sizeOf(mirror.size))?.at ?? wanted
  await setOffset($, at)

  if (isDrop) {
    await $.store.set('offset', at)
    await endDrag($)
    return
  }

  guardDrag($, drag)
  // Pet coordinates count from the right, so a falling `right` runs right.
  if (at.right !== was.right) steer($, at.right < was.right ? 'right' : 'left')
}

const heldBy = (requestId: string) => (mirror.catcher?.requestId === requestId ? mirror.catcher.at : undefined)

// The pet dragged by its catcher: `dx`, `dy` are the whole way from the press.
export async function dragPet($: EngineInterface, requestId: string, gesture: string, move: { dx: number; dy: number }, isDrop: boolean) {
  const current = mirror.drag
  const drag: Drag =
    current !== undefined && current.gesture === gesture
      ? current
      : { gesture, requestId, from: mirror.offset, catcher: heldBy(requestId), watchdog: undefined }
  mirror.drag = drag

  await moveTo($, drag, { right: drag.from.right - move.dx, lift: drag.from.lift - move.dy }, isDrop)
}

// The pet dragged by the footer caption: its middle follows the pointer, which
// counts up from the footer. The conversation's bottom sits the prompt area's
// height above it, and lift 0, the last row we know of, is higher by the rows
// no hook sees.
export async function aimPet($: EngineInterface, requestId: string, aim: { fromRight: number; up: number }, isDrop: boolean) {
  if (mirror.dock !== 'conversation') await setDock($, 'conversation')

  const petSize = sizeOf(mirror.size)
  const drag: Drag = mirror.drag ?? { gesture: 'grip', requestId, from: mirror.offset, catcher: undefined, watchdog: undefined }
  mirror.drag = drag

  const wanted = {
    right: aim.fromRight - Math.floor(petSize.columns / 2),
    lift: aim.up - (screen.promptRows - 1) - Math.floor(petSize.rows / 2) - belowRows(),
  }
  await moveTo($, drag, wanted, isDrop)
}

// A click on the pet pets it, one on the caption doesn't; on either, a double
// click docks the pet on the prompt or back, and a right click resizes it.
export async function click($: EngineInterface, button: unknown, isOnPet: boolean) {
  if (button === 'right') return setSize($, NEXT_SIZE[mirror.size])
  if (button !== 'left') return

  const now = await $.clock.now()
  const isDouble = now - mirror.lastClickAt < DOUBLE_CLICK_MS
  mirror.lastClickAt = isDouble ? Number.NEGATIVE_INFINITY : now
  if (isDouble) return setDock($, mirror.dock === 'conversation' ? 'prompt' : 'conversation')
  if (!isOnPet) return

  await tend($, petted)
  await react($, 'happy')
}
