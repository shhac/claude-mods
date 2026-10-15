import { describe, expect, test } from 'claude-code/testing'

import { BAND, BAND_PLACEMENT, codexHome, pet, SIDEBAR_PANE } from './harness'

// The test plays a second session looking after the same pet, writing its
// care to the store this one reads.
const KEY = 'care:nullbyte'

function otherSession(saved: Map<string, unknown>, change: (care: Record<string, unknown>) => Record<string, unknown>) {
  const care = saved.get(KEY)
  if (typeof care !== 'object' || care === null) throw new Error('no care saved yet')
  saved.set(KEY, change({ ...care }))
}

const numberIn = (care: Record<string, unknown>, key: string) => Number(care[key] ?? 0)

describe('two sessions, one pet', () => {
  test("another session's pats and xp add up with this one's", async ($, on) => {
    const saved = new Map<string, unknown>()
    codexHome(on, saved)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    await $.command.run(pet('pat'))
    otherSession(saved, care => ({ ...care, pets: numberIn(care, 'pets') + 5, xp: numberIn(care, 'xp') + 20 }))
    await $.command.run(pet('pat'))

    const stats = (await $.command.run(pet('stats'))).text
    expect(stats).toContain('petted 7×')
    expect(stats).toContain('level 2 (20/')
  })

  test("another session's level shows here without a second celebration; one reached here is cheered", BAND_PLACEMENT, async ($, on) => {
    const saved = new Map<string, unknown>()
    const { clock } = codexHome(on, saved)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(BAND)
    const cheered = async () => ui.find({ type: 'Text', text: /Level/ })

    otherSession(saved, care => ({ ...care, xp: 45 }))
    await clock.advance(5000)
    expect((await $.command.run(pet('stats'))).text).toContain('level 3 (45/')
    await $.command.run(pet('pat'))
    expect(await cheered()).toBeUndefined()

    otherSession(saved, care => ({ ...care, xp: 89 }))
    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/a.ts' })
    expect(await cheered()).toBeDefined()
    expect((await $.command.run(pet('stats'))).text).toContain('level 4 (90/')
  })

  test('a treat given in another session meanwhile stands: no second one', async ($, on) => {
    const saved = new Map<string, unknown>()
    const { clock } = codexHome(on, saved)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const now = clock.now()
    otherSession(saved, care => ({ ...care, treats: 3, lastFedAt: now }))
    await $.command.run(pet('feed'))

    expect((await $.command.run(pet('stats'))).text).toContain('3 treats')
  })

  test('with nothing saved, a change builds on the care this session holds', async ($, on) => {
    const saved = new Map<string, unknown>()
    codexHome(on, saved)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    await $.command.run(pet('pat'))
    saved.delete(KEY)
    await $.command.run(pet('pat'))

    expect((await $.command.run(pet('stats'))).text).toContain('petted 2×')
  })

  test("the sidebar shows another session's pats, though no level or heart changed", { options: { chatter: 'off' } }, async ($, on) => {
    const saved = new Map<string, unknown>()
    const { clock } = codexHome(on, saved)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.command.run(pet('dock sidebar'))
    const side = await $.ui.mount(SIDEBAR_PANE)
    expect(await side.find({ type: 'Text', text: /0 pats/ })).toBeDefined()
    // The greeting over and the pet quiet, only the watcher's take-up redraws.
    await clock.advance(30000)

    otherSession(saved, care => ({ ...care, pets: 3 }))
    await clock.advance(5000)

    expect(await side.find({ type: 'Text', text: /3 pats/ })).toBeDefined()
  })
})
