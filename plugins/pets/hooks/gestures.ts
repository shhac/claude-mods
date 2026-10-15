import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Offset } from '../types'
import { petted } from './care'
import { mirror, setDock, setOffset, sizeOf } from './controls'
import type { Drag } from './controls'
import { fieldOf } from './fields'
import { tend } from './keeper'
import { menuHover, pickFromMenu, toggleMenu } from './menu-actions'
import { react, steer } from './player'
import { belowRows, planFor, screen } from './stage'

// The pointer on the pet, its name tag and its menu: hovering, dragging,
// clicking, and the messages their surfaces post.

const isHovered = atom({ plugin: 'pets', key: 'isHovered' } as const, false)

const DOUBLE_CLICK_MS = 450
// A drag whose release never arrives (its row went away) ends on its own.
const DRAG_TIMEOUT_MS = 1500

// Docked, the pet's top is on the prompt box's top edge, three rows above the
// footer caption: the footer's floating boxes reach only over the bottom area.
export const PROMPT_DOCK_TOP = -3

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
async function hover($: EngineInterface, catcher: string, isOver: boolean) {
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
async function dragPet($: EngineInterface, requestId: string, gesture: string, move: { dx: number; dy: number }, isDrop: boolean) {
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
async function aimPet($: EngineInterface, requestId: string, aim: { fromRight: number; up: number }, isDrop: boolean) {
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
// click docks the pet on the prompt or back. (A right click opens the menu.)
async function click($: EngineInterface, button: unknown, isOnPet: boolean) {
  if (button !== 'left') return

  const now = await $.clock.now()
  const isDouble = now - mirror.lastClickAt < DOUBLE_CLICK_MS
  mirror.lastClickAt = isDouble ? Number.NEGATIVE_INFINITY : now
  if (isDouble) return setDock($, mirror.dock === 'conversation' ? 'prompt' : 'conversation')
  if (!isOnPet) return

  await tend($, petted)
  await react($, 'happy')
}

const numberField = (data: unknown, key: string) => {
  const value = fieldOf(data, key)
  return typeof value === 'number' ? value : 0
}

// A right click on the pet or its name tag opens its menu; the rest are clicks.
async function clickOrMenu($: EngineInterface, button: unknown, isOnPet: boolean) {
  if (button === 'right') return toggleMenu($)
  return click($, button, isOnPet)
}

// The pet's catcher, over the conversation or docked: a drag moves it, a
// click pets it, a double click docks it on the prompt or back, a right
// click opens its menu.
export async function onHandle($: EngineInterface, requestId: string, element: string, data: unknown) {
  const kind = fieldOf(data, 'kind')
  if (kind === 'hover') await hover($, `${requestId}:handle`, fieldOf(data, 'isOver') === true)
  if (kind === 'click') await clickOrMenu($, fieldOf(data, 'button'), true)
  if (kind !== 'drag' && kind !== 'drop') return

  // Docked, the catcher is the footer's: the pet follows the pointer, as
  // from the caption, counted from the footer row.
  if (requestId === mirror.footerId) {
    const columns = sizeOf(mirror.size).columns
    const aim = {
      fromRight: 1 + (columns - 1 - numberField(data, 'x')),
      up: -(PROMPT_DOCK_TOP + numberField(data, 'y')),
    }
    await aimPet($, requestId, aim, kind === 'drop')
    return
  }

  const gesture = `${requestId}:${element}:${numberField(data, 'gesture')}`
  const move = { dx: numberField(data, 'dx'), dy: numberField(data, 'dy') }
  await dragPet($, requestId, gesture, move, kind === 'drop')
}

// The footer caption: the same, but dragged, the pet follows the pointer.
export async function onGrip($: EngineInterface, requestId: string, data: unknown) {
  const kind = fieldOf(data, 'kind')
  if (kind === 'hover') await hover($, `${requestId}:grip`, fieldOf(data, 'isOver') === true)
  if (kind === 'click') await clickOrMenu($, fieldOf(data, 'button'), false)
  if (kind !== 'aim' && kind !== 'drop') return

  const aim = { fromRight: numberField(data, 'fromRight'), up: numberField(data, 'up') }
  await aimPet($, requestId, aim, kind === 'drop')
}

// The right-click menu: a pick, or the pointer coming and going.
export async function onMenu($: EngineInterface, data: unknown) {
  const kind = fieldOf(data, 'kind')
  if (kind === 'hover') menuHover($, fieldOf(data, 'isOver') === true)
  const id = fieldOf(data, 'id')
  if (kind === 'pick' && typeof id === 'string') await pickFromMenu($, id)
}
