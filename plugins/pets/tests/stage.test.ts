import { expect, test } from 'claude-code/testing'

import { clampOffset, forgetRows, hostRow, noteBottomSlot, noteRow, topInHost } from '../hooks/stage'

test('the host is the row cut at the viewport bottom, else the newest drawn', () => {
  noteRow('a', { first: 3, last: 9, of: 10 })
  noteRow('b', { first: 0, last: 4, of: 5 })
  expect(hostRow()).toEqual({ requestId: 'b', last: 4 })

  noteRow('c', { first: 0, last: 6, of: 30 })
  expect(hostRow()).toEqual({ requestId: 'c', last: 6 })

  noteRow('c', null)
  expect(hostRow()).toEqual({ requestId: 'b', last: 4 })
})

test("a /clear's unreported rows don't keep the pet", () => {
  noteRow('old', { first: 0, last: 9, of: 20 })
  forgetRows()
  noteRow('new', { first: 0, last: 2, of: 3 })
  expect(hostRow()).toEqual({ requestId: 'new', last: 2 })
})

test('the conversation is the terminal less the prompt and footer', () => {
  noteBottomSlot(66, 194, 26)
  const size = { rows: 4, columns: 7 }

  expect(clampOffset({ right: 500, lift: 500 }, size)).toEqual({ right: 187, lift: 55 })
  expect(clampOffset({ right: -3, lift: -3 }, size)).toEqual({ right: 0, lift: 0 })
  expect(topInHost({ last: 20 }, { right: 0, lift: 0 }, size)).toBe(17)
  expect(topInHost({ last: 20 }, { right: 0, lift: 30 }, size)).toBe(-13)
})
