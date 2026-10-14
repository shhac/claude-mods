import { expect, test } from 'claude-code/testing'

import { clampOffset, hostRow, noteBottomSlot, noteRow, topInHost } from '../hooks/stage'

test('the host is the row cut at the viewport top, else the earliest drawn', () => {
  noteRow('a', { first: 0, last: 9, of: 10 })
  noteRow('b', { first: 0, last: 4, of: 5 })
  expect(hostRow()).toEqual({ requestId: 'a', first: 0 })

  noteRow('c', { first: 12, last: 20, of: 21 })
  expect(hostRow()).toEqual({ requestId: 'c', first: 12 })

  noteRow('c', null)
  expect(hostRow()).toEqual({ requestId: 'a', first: 0 })
})

test('the conversation is the terminal less the prompt and footer', () => {
  noteBottomSlot(66, 194, 26)
  const size = { rows: 4, columns: 7 }

  expect(clampOffset({ right: 500, lift: 500 }, size)).toEqual({ right: 187, lift: 55 })
  expect(clampOffset({ right: -3, lift: -3 }, size)).toEqual({ right: 0, lift: 0 })
  expect(topInHost({ first: 2 }, { right: 0, lift: 0 }, size)).toBe(57)
})
