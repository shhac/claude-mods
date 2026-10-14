import type { Offset } from '../types'

// The floating pet is drawn inside a conversation row, so it can sit anywhere
// over the conversation: a floating box is cut off at its site's region, and a
// row's region is the whole conversation viewport. This module works out
// which row hosts it and where, in that row's own rows.

export type OnScreen = { first: number; last: number; of: number }
type Size = { rows: number; columns: number }

// The last row reported for each conversation row on screen, in the order they
// were first drawn; rows report again whenever they cross a viewport edge.
const visible = new Map<string, OnScreen>()

export const screen = {
  columns: 80,
  rows: 40,
  // What the bottom slot (band, prompt, footer) leaves the conversation.
  conversationRows: 30,
}

export function noteRow(requestId: string, onScreen: OnScreen | null | undefined) {
  if (onScreen === null || onScreen === undefined) {
    visible.delete(requestId)
    return
  }

  visible.set(requestId, onScreen)
}

// The band's maxRows is what the bottom slot, capped at half the terminal, has
// left above the prompt; the rest of that half is the prompt and footer.
export function noteBottomSlot(rows: number, columns: number, bandMaxRows: number) {
  const promptRows = Math.max(0, Math.floor(rows / 2) - bandMaxRows)
  screen.rows = rows
  screen.columns = columns
  screen.conversationRows = Math.max(1, rows - promptRows)
}

// The row whose top is scrolled away starts above the viewport, so its row
// `first` is the viewport's top row. Without one the conversation fits, and the
// earliest row drawn is taken to start the viewport.
export function hostRow(): { requestId: string; first: number } | undefined {
  const entries = [...visible.entries()]
  const cut = entries.find(([, seen]) => seen.first > 0)
  const [requestId, seen] = cut ?? entries[0] ?? []

  return requestId === undefined || seen === undefined ? undefined : { requestId, first: seen.first }
}

export const clampOffset = (wanted: Offset, size: Size): Offset => ({
  right: Math.round(Math.min(Math.max(wanted.right, 0), Math.max(0, screen.columns - size.columns))),
  lift: Math.round(Math.min(Math.max(wanted.lift, 0), Math.max(0, screen.conversationRows - size.rows))),
})

// Where the pet's top row falls in the host row's own rows, for a pet `lift`
// rows up from the bottom of the conversation.
export const topInHost = (host: { first: number }, at: Offset, size: Size) =>
  host.first + screen.conversationRows - at.lift - size.rows
