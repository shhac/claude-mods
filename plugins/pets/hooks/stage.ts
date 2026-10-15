import type { Offset } from '../types'

// The floating pet is drawn over the conversation from the bottom-most row:
// a floating box paints over the rows before it but under every row after, so
// only the last row leaves the picture whole, and it redraws on every scroll.
// The pointer, though, only reaches a floating box inside its own row, so each
// row the pet overlaps lays an invisible catcher over its share of the pet.
// This module works out where the rows are, the pet's place on the bottom row
// and which row catches which lines.

export type OnScreen = { first: number; last: number; of: number }
export type Size = { rows: number; columns: number }

type Seen = OnScreen & { order: number }

// A row's share of the pet: `top` is where it starts in the row's own lines,
// `skip` how many of the pet's lines lie above it.
export type Strip = { top: number; height: number; skip: number }

export type Plan = {
  at: Offset
  // The row the picture hangs from, and the picture's top in its own lines.
  host: string
  top: number
  catchers: ReadonlyMap<string, Strip>
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

export const clampOffset = (wanted: Offset, size: Size, lines: number): Offset => ({
  right: Math.round(Math.min(Math.max(wanted.right, 0), Math.max(0, screen.columns - size.columns))),
  lift: Math.round(Math.min(Math.max(wanted.lift, 0), Math.max(0, lines - size.rows))),
})

// Where the pet's lines `[lift, lift + rows)`, counted up from the content's
// bottom, cross each row's own lines.
export function stripsFor(rows: readonly Placed[], at: Offset, size: Size) {
  const strips = new Map<string, Strip>()

  for (const row of rows) {
    const low = Math.max(at.lift, row.fromBottom)
    const high = Math.min(at.lift + size.rows, row.fromBottom + row.lines)
    if (low >= high) continue

    strips.set(row.requestId, {
      top: row.seen.last - (high - 1 - row.fromBottom),
      height: high - low,
      skip: at.lift + size.rows - high,
    })
  }

  return strips
}

const keyOf = (plan: Omit<Plan, 'key'>) =>
  [
    `${plan.host}:${plan.top}:${plan.at.right}`,
    ...[...plan.catchers].map(([id, s]) => `${id}:${s.top}:${s.height}:${s.skip}`),
  ].join('|')

// The bottom-most row: one cut at the bottom, else the newest on screen.
function bottomRow(): Placed | undefined {
  const bottomUp = [...visible.entries()].sort(([, a], [, b]) => b.order - a.order)
  const cut = bottomUp.find(([, seen]) => isCutAtBottom(seen))
  const [requestId, seen] = cut ?? bottomUp[0] ?? []
  return requestId === undefined || seen === undefined ? undefined : { requestId, seen, fromBottom: 0, lines: linesOf(seen) }
}

// When the rows don't add up, only the bottom row is placed for sure: it holds
// the picture, and catches whatever of the pet lies on its own lines.
export function planFor(wanted: Offset, size: Size): Plan | undefined {
  const rows = layout()
  const host = rows?.[0] ?? bottomRow()
  if (host === undefined) return undefined

  const lines = rows === undefined ? screen.conversationRows : rows.reduce((sum, row) => sum + row.lines, 0)
  const at = clampOffset(wanted, size, lines)
  const plan = {
    at,
    host: host.requestId,
    top: host.seen.last - at.lift - size.rows + 1,
    catchers: stripsFor(rows ?? [host], at, size),
  }

  return { ...plan, key: keyOf(plan) }
}
