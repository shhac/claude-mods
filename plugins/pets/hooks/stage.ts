import type { Offset } from '../types'

// The floating pet is drawn over the conversation from the bottom-most row:
// a floating box paints over the rows before it but under every row after, so
// only the last row leaves the picture whole, and it redraws on every scroll.
// The pointer only reaches a floating box inside its parent's box, so that
// row's box is stretched over the pet too (drawings.tsx). This module works
// out where the rows are and the pet's place on the bottom row.

export type OnScreen = { first: number; last: number; of: number }
export type Size = { rows: number; columns: number }

type Seen = OnScreen & { order: number }

export type Plan = {
  at: Offset
  // The row the picture hangs from, the picture's top in its own lines, and
  // how many lines it has.
  host: string
  top: number
  hostLines: number
  key: string
}

// Rows are added up against a height worked out from the band, which a draw
// can run ahead of, so allow a little over before calling the reports wrong.
const SLACK_ROWS = 2

// The last report from each conversation row on screen.
const visible = new Map<string, Seen>()

// Rows keep their place in the conversation after they scroll away, so a row
// that comes back slots in where it was.
const order = new Map<string, number>()
const ends = { top: 0, bottom: 0 }

export const screen = {
  columns: 80,
  rows: 40,
  // What the bottom slot (band, prompt, footer) leaves the conversation.
  conversationRows: 30,
  // The prompt box, the lines under it and the footer.
  promptRows: 10,
}

const isCutAtTop = (seen: OnScreen) => seen.first > 0
const isCutAtBottom = (seen: OnScreen) => seen.last < seen.of - 1

// A row seen for the first time is new at the bottom, unless it comes in cut
// at the top while others are on screen: then a scroll up is revealing it.
const placeFor = (seen: OnScreen) => {
  const isRevealedAbove = visible.size > 0 && isCutAtTop(seen) && !isCutAtBottom(seen)
  if (isRevealedAbove) {
    ends.top -= 1
    return ends.top
  }

  ends.bottom += 1
  return ends.bottom
}

export function noteRow(requestId: string, onScreen: OnScreen | null | undefined) {
  if (onScreen === null || onScreen === undefined) {
    visible.delete(requestId)
    return
  }

  const place = order.get(requestId) ?? placeFor(onScreen)
  order.set(requestId, place)
  visible.set(requestId, { ...onScreen, order: place })
}

// A /clear or a resume drops the rows without reporting them off screen.
export function forgetRows() {
  visible.clear()
  order.clear()
  ends.top = 0
  ends.bottom = 0
}

// The band's maxRows is what the bottom slot, capped at half the terminal, has
// left above the prompt; the rest of that half is the prompt and footer.
// Says whether the conversation's size changed, which moves the pet's limits.
export function noteBottomSlot(rows: number, columns: number, bandMaxRows: number) {
  const promptRows = Math.max(0, Math.floor(rows / 2) - bandMaxRows)
  const conversationRows = Math.max(1, rows - promptRows)
  const hasChanged = conversationRows !== screen.conversationRows || columns !== screen.columns

  screen.rows = rows
  screen.columns = columns
  screen.promptRows = promptRows
  screen.conversationRows = conversationRows
  return hasChanged
}

export type Placed = { requestId: string; seen: Seen; fromBottom: number; lines: number }

const linesOf = (seen: OnScreen) => seen.last - seen.first + 1

// Rows on screen, bottom first, each with how far its last visible line sits
// above the bottom of the content. Undefined when the reports don't add up
// (a row that left without saying so), and the pet falls back to one row.
export function layout(): readonly Placed[] | undefined {
  const bottomUp = [...visible.entries()].sort(([, a], [, b]) => b.order - a.order)

  // Nothing can lie below a row cut at the bottom or above one cut at the top:
  // rows there left without reporting it.
  const lowest = Math.max(0, bottomUp.findIndex(([, seen]) => isCutAtBottom(seen)))
  const found = bottomUp.findLastIndex(([, seen]) => isCutAtTop(seen))
  const highest = found < 0 ? bottomUp.length - 1 : found
  bottomUp.slice(0, lowest).forEach(([id]) => visible.delete(id))
  bottomUp.slice(highest + 1).forEach(([id]) => visible.delete(id))

  const rows = bottomUp.slice(lowest, highest + 1)
  const isWholeBetween = rows.every(
    ([, seen], index) => (index === 0 || !isCutAtBottom(seen)) && (index === rows.length - 1 || !isCutAtTop(seen)),
  )
  const total = rows.reduce((sum, [, seen]) => sum + linesOf(seen), 0)
  if (rows.length === 0 || !isWholeBetween || total > screen.conversationRows + SLACK_ROWS) return undefined

  return rows.map(([requestId, seen], index) => ({
    requestId,
    seen,
    lines: linesOf(seen),
    fromBottom: rows.slice(0, index).reduce((sum, [, below]) => sum + linesOf(below), 0),
  }))
}

// `below` rows under the last row we know of can take the pet too: a negative
// lift.
export function clampOffset(wanted: Offset, size: Size, lines: number, below = 0): Offset {
  // Not -0, which a saved offset would carry around.
  const lowest = below > 0 ? -below : 0
  return {
    right: Math.round(Math.min(Math.max(wanted.right, 0), Math.max(0, screen.columns - size.columns))),
    lift: Math.round(Math.min(Math.max(wanted.lift, lowest), Math.max(lowest, lines - size.rows))),
  }
}

const totalOf = (rows: readonly Placed[]) => rows.reduce((sum, row) => sum + row.lines, 0)

// Rows under the last row a hook sees: notices no hook is told of (a reload, a
// recap, a drafted bug report), still in the conversation. They can only be
// counted where the conversation fills the screen, its top row cut; with
// the logo above a short one, the pet could be pushed off the bottom.
function belowOf(rows: readonly Placed[] | undefined) {
  const top = rows?.at(-1)
  if (rows === undefined || top === undefined || !isCutAtTop(top.seen)) return 0
  return Math.max(0, screen.conversationRows - totalOf(rows))
}

export const belowRows = () => belowOf(layout())

const keyOf = (plan: Omit<Plan, 'key'>) => `${plan.host}:${plan.top}:${plan.at.right}:${plan.hostLines}`

// The bottom-most row: one cut at the bottom, else the newest on screen.
function bottomRow(): Placed | undefined {
  const bottomUp = [...visible.entries()].sort(([, a], [, b]) => b.order - a.order)
  const cut = bottomUp.find(([, seen]) => isCutAtBottom(seen))
  const [requestId, seen] = cut ?? bottomUp[0] ?? []
  return requestId === undefined || seen === undefined ? undefined : { requestId, seen, fromBottom: 0, lines: linesOf(seen) }
}

// When the rows don't add up, the bottom row is still the host, held to the
// conversation's height.
export function planFor(wanted: Offset, size: Size): Plan | undefined {
  const rows = layout()
  const host = rows?.[0] ?? bottomRow()
  if (host === undefined) return undefined

  const lines = rows === undefined ? screen.conversationRows : totalOf(rows)
  const at = clampOffset(wanted, size, lines, belowOf(rows))
  const plan = {
    at,
    host: host.requestId,
    top: host.seen.last - at.lift - size.rows + 1,
    hostLines: host.seen.of,
  }

  return { ...plan, key: keyOf(plan) }
}

// For `/pet debug`: the rows the pet is laid over, and what it can't see.
export function describeStage() {
  const rows = layout()
  const known = rows === undefined ? 'no fit, bottom row only' : `${rows.length} rows ${totalOf(rows)} ln`
  return `${known} · ${belowOf(rows)} below · view ${screen.conversationRows}/${screen.rows}`
}
