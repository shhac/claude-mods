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

// The pet rides the bottom-most row on screen: a floating box paints over the
// rows before it but under every row after, so only the last row leaves it
// whole. A row cut off at the bottom is the last; with none cut, the newest
// row drawn is. Either way its row `last` is the conversation's bottom row.
// The row that drew the pet last, so a new host can have the old one redrawn
// without it.
export const hosting: { requestId: string | undefined } = { requestId: undefined }

export function hostRow(): { requestId: string; last: number } | undefined {
  const entries = [...visible.entries()]
  const cut = entries.find(([, seen]) => seen.last < seen.of - 1)
  const [requestId, seen] = cut ?? entries.at(-1) ?? []

  return requestId === undefined || seen === undefined ? undefined : { requestId, last: seen.last }
}

export const clampOffset = (wanted: Offset, size: Size): Offset => ({
  right: Math.round(Math.min(Math.max(wanted.right, 0), Math.max(0, screen.columns - size.columns))),
  lift: Math.round(Math.min(Math.max(wanted.lift, 0), Math.max(0, screen.conversationRows - size.rows))),
})

// Where the pet's top row falls in the host row's own rows, for a pet `lift`
// rows up from the bottom of the conversation; above the host's top it
// reaches over the rows before it.
export const topInHost = (host: { last: number }, at: Offset, size: Size) => host.last - at.lift - size.rows + 1
