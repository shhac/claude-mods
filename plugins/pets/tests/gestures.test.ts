import { describe, expect, test } from 'claude-code/testing'

import { aimFromDocked, offsetForAim, offsetForDrag } from '../hooks/gestures'

const MEDIUM = { rows: 4, columns: 7 }

describe('where the pointer puts the pet', () => {
  test('a drag moves it the other way to the offsets, which count from the right and up', () => {
    expect(offsetForDrag({ right: 10, lift: 5 }, { dx: 3, dy: -2 })).toEqual({ right: 7, lift: 7 })
  })

  test("the caption's drag puts the pet's middle under the pointer", () => {
    // 20 rows up from the footer, a 7-row prompt area, nothing below the last row.
    expect(offsetForAim({ fromRight: 30, up: 20 }, MEDIUM, 7, 0)).toEqual({ right: 27, lift: 12 })
    // Rows no hook sees sit under the last row: lift 0 is that much higher.
    expect(offsetForAim({ fromRight: 30, up: 20 }, MEDIUM, 7, 3).lift).toBe(9)
  })

  test("the docked catcher's cells read as the caption's", () => {
    // Its top-left cell: the pet's width in from the right, 3 rows up.
    expect(aimFromDocked(0, 0, 7)).toEqual({ fromRight: 7, up: 3 })
    expect(aimFromDocked(6, 3, 7)).toEqual({ fromRight: 1, up: 0 })
  })
})
