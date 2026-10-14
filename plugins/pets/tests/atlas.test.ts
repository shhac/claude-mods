import { describe, expect, test } from 'claude-code/testing'

import { ANIMATIONS, COLUMNS, ROWS, columnsForRows, frameDuration, framePath } from '../hooks/atlas'
import { parseCodexSelection, parseManifest } from '../hooks/pets'

describe('Codex atlas contract', () => {
  test('rows and frame counts match the Codex pet layout', () => {
    expect(COLUMNS * ROWS).toBe(72)
    expect(ANIMATIONS.idle).toEqual({ row: 0, durations: [280, 110, 110, 140, 140, 320] })
    expect(ANIMATIONS.waiting.row).toBe(6)
    expect(ANIMATIONS.running.durations).toEqual([120, 120, 120, 120, 120, 220])
    expect(ANIMATIONS.review.row).toBe(8)
  })

  test('frames are addressed row-major as sliced', () => {
    expect(framePath('/f', 'idle', 0)).toBe('/f/frame-00.png')
    expect(framePath('/f', 'running', 3)).toBe('/f/frame-59.png')
    expect(framePath('/f', 'review', 5)).toBe('/f/frame-69.png')
  })

  test('durations wrap with the frame count', () => {
    expect(frameDuration('waving', 3)).toBe(280)
    expect(frameDuration('waving', 4)).toBe(140)
  })

  test('the picture keeps the cell aspect in terminal cells', () => {
    expect(columnsForRows(4)).toBe(7)
    expect(columnsForRows(5)).toBe(9)
    expect(columnsForRows(8)).toBe(15)
  })
})

describe('Codex pet packages', () => {
  test('reads a Codex pet.json', () => {
    const text = JSON.stringify({
      id: 'dawnbyte',
      displayName: 'Dawnbyte',
      description: 'A cat.',
      spritesheetPath: 'spritesheet.webp',
    })

    expect(parseManifest('dawnbyte', '/p/dawnbyte', text)).toEqual({
      id: 'dawnbyte',
      displayName: 'Dawnbyte',
      description: 'A cat.',
      spritesheet: '/p/dawnbyte/spritesheet.webp',
    })
  })

  test('falls back to the folder name and the default spritesheet', () => {
    expect(parseManifest('blob', '/p/blob', '{}')).toEqual({
      id: 'blob',
      displayName: 'blob',
      description: '',
      spritesheet: '/p/blob/spritesheet.webp',
    })
  })

  test("follows Codex's own pet choice", () => {
    expect(parseCodexSelection('model = "x"\npet = "custom:nullbyte"\n')).toBe('nullbyte')
    expect(parseCodexSelection('pet = "builtin:dot"')).toBeUndefined()
  })
})
