import { expect, test } from 'claude-code/testing'

import { clampOffset, forgetRows, layout, noteBottomSlot, noteRow, planFor, stripsFor } from '../hooks/stage'

const PET = { rows: 4, columns: 7 }

// The harness screen we measured: a reply scrolled 51 rows in, its last 40
// rows on screen, then the 2-row "Cogitated" line under it.
function measuredScreen() {
  forgetRows()
  noteBottomSlot(59, 194, 21)
  noteRow('reply', { first: 51, last: 90, of: 91 })
  noteRow('took', { first: 0, last: 1, of: 2 })
}

test('rows stack up from the bottom in the order they arrived', () => {
  measuredScreen()

  expect(layout()?.map(row => [row.requestId, row.fromBottom, row.lines])).toEqual([
    ['took', 0, 2],
    ['reply', 2, 40],
  ])
})

test("each row the pet overlaps catches its share, and the shares add up to the pet", () => {
  measuredScreen()
  const rows = layout() ?? []

  // At the bottom: the last two lines on the 2-row line, the first two on the reply.
  const strips = stripsFor(rows, { right: 0, lift: 0 }, PET)
  expect(strips.get('took')).toEqual({ top: 0, height: 2, skip: 2 })
  expect(strips.get('reply')).toEqual({ top: 89, height: 2, skip: 0 })

  for (const lift of [0, 1, 2, 3, 10, 38]) {
    const shares = [...stripsFor(rows, { right: 0, lift }, PET).values()].sort((a, b) => a.skip - b.skip)
    const ends = shares.map(share => share.skip + share.height)
    expect(shares.map(share => share.skip)).toEqual([0, ...ends.slice(0, -1)])
    expect(ends.at(-1)).toBe(4)
  }
})

test('the picture hangs whole from the bottom row', () => {
  measuredScreen()

  const plan = planFor({ right: 3, lift: 10 }, PET)
  expect(plan?.host).toBe('took')
  // Ten rows up from the bottom of a 2-row row, 4 rows tall.
  expect(plan?.top).toBe(1 - 10 - 4 + 1)
  expect([...(plan?.catchers.keys() ?? [])]).toEqual(['reply'])
  expect(plan?.catchers.get('reply')).toEqual({ top: 90 - (13 - 2), height: 4, skip: 0 })
})

test('the pet is held inside the content and the screen', () => {
  measuredScreen()

  expect(planFor({ right: 500, lift: 500 }, PET)?.at).toEqual({ right: 187, lift: 38 })
  expect(clampOffset({ right: -3, lift: -3 }, PET, 42)).toEqual({ right: 0, lift: 0 })
})

test('the pet can go below the last row we know of, over notices no hook sees', () => {
  // 42 rows known of a 51-row conversation that fills the screen: 9 below.
  measuredScreen()

  const plan = planFor({ right: 0, lift: -100 }, PET)
  expect(plan?.at.lift).toBe(-9)
  expect(plan?.host).toBe('took')
  // Under the host's last line; no row there can lay a catcher.
  expect(plan?.top).toBe(1 + 9 - 4 + 1)
  expect([...(plan?.catchers.keys() ?? [])]).toEqual([])
})

test("a short conversation keeps the pet above its last row: the logo's height isn't known", () => {
  forgetRows()
  noteBottomSlot(59, 194, 21)
  noteRow('reply', { first: 0, last: 9, of: 10 })

  expect(planFor({ right: 0, lift: -100 }, PET)?.at.lift).toBe(0)
})

test('a row revealed above by a scroll goes on top, not at the bottom', () => {
  forgetRows()
  noteBottomSlot(59, 194, 21)
  noteRow('reply', { first: 0, last: 30, of: 31 })
  noteRow('took', { first: 0, last: 1, of: 2 })
  noteRow('older', { first: 12, last: 19, of: 20 })

  expect(layout()?.map(row => row.requestId)).toEqual(['took', 'reply', 'older'])
})

test('rows that left without saying so are dropped from the ends', () => {
  forgetRows()
  noteBottomSlot(59, 194, 21)
  noteRow('gone', { first: 0, last: 4, of: 5 })
  noteRow('top', { first: 0, last: 9, of: 10 })
  noteRow('bottom', { first: 0, last: 9, of: 30 })
  noteRow('after', { first: 0, last: 2, of: 3 })
  // A scroll: 'top' is cut at the top now, so 'gone' went above unreported.
  noteRow('top', { first: 3, last: 9, of: 10 })

  // Nothing lies above a row cut at the top, nor below one cut at the bottom.
  expect(layout()?.map(row => row.requestId)).toEqual(['bottom', 'top'])
})

test("reports that don't add up fall back to the bottom row alone", () => {
  forgetRows()
  noteBottomSlot(59, 194, 21)
  noteRow('a', { first: 0, last: 29, of: 30 })
  noteRow('b', { first: 0, last: 29, of: 30 })

  expect(layout()).toBeUndefined()
  const plan = planFor({ right: 0, lift: 0 }, PET)
  expect(plan?.host).toBe('b')
  expect([...(plan?.catchers.keys() ?? [])]).toEqual(['b'])
})

test('a /clear forgets every row', () => {
  measuredScreen()
  forgetRows()
  noteRow('new', { first: 0, last: 2, of: 3 })

  expect(planFor({ right: 0, lift: 0 }, PET)?.host).toBe('new')
})

test('the conversation is the terminal less the prompt and footer', () => {
  forgetRows()
  expect(noteBottomSlot(66, 194, 26)).toBe(true)
  expect(noteBottomSlot(66, 194, 26)).toBe(false)
  expect(planFor({ right: 0, lift: 0 }, PET)).toBeUndefined()
})
