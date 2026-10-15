import { describe, expect, test } from 'claude-code/testing'

import { careFrom } from '../hooks/care'
import type { Care } from '../types'
import { BAND, BAND_PLACEMENT, codexHome, pet, SESSION, SIDEBAR_PANE } from './harness'

// The test plays a second session looking after the same pet, writing its
// care to the store this one reads.
const KEY = 'care:nullbyte'

function otherSession(saved: Map<string, unknown>, change: (care: Care) => Care) {
  saved.set(KEY, change(careFrom(saved.get(KEY), 0)))
}

describe('two sessions, one pet', () => {
  test("another session's pats and xp add up with this one's", async ($, on) => {
    const { saved } = codexHome(on)
    await $.session.start(SESSION)

    await $.command.run(pet('pat'))
    otherSession(saved, care => ({ ...care, pets: care.pets + 5, xp: care.xp + 20 }))
    await $.command.run(pet('pat'))

    const stats = (await $.command.run(pet('stats'))).text
    expect(stats).toContain('petted 7×')
    expect(stats).toContain('level 2 (20/')
  })

  test("another session's level shows here without a second celebration; one reached here is cheered", BAND_PLACEMENT, async ($, on) => {
    const { clock, saved } = codexHome(on)
    await $.session.start(SESSION)
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

  test('a level and an achievement earned elsewhere are not cheered here, even before the watcher looks', BAND_PLACEMENT, async ($, on) => {
    const { clock, saved } = codexHome(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount(BAND)

    const now = clock.now()
    otherSession(saved, care => ({ ...care, xp: 45, pets: 50, achievements: { 'pats-50': now } }))
    await $.command.run(pet('pat'))

    expect(await ui.find({ type: 'Text', text: /Level|Good pet/ })).toBeUndefined()
    const stats = (await $.command.run(pet('stats'))).text
    expect(stats).toContain('level 3 (45/')
    expect(stats).toContain('petted 51×')
    expect(stats).toContain('Good pet')
  })

  test('a treat given in another session meanwhile stands: no second one', async ($, on) => {
    const { clock, saved } = codexHome(on)
    await $.session.start(SESSION)

    const now = clock.now()
    otherSession(saved, care => ({ ...care, treats: 3, lastFedAt: now }))
    expect((await $.command.run(pet('feed'))).text).toBe('Nullbyte is still full. Try again in 30 min.')
    expect((await $.command.run(pet('stats'))).text).toContain('3 treats')
  })

  test('with nothing saved, a change builds on the care this session holds', async ($, on) => {
    const { saved } = codexHome(on)
    await $.session.start(SESSION)

    await $.command.run(pet('pat'))
    saved.delete(KEY)
    await $.command.run(pet('pat'))

    expect((await $.command.run(pet('stats'))).text).toContain('petted 2×')
  })

  test("the sidebar shows another session's pats, though no level or heart changed", { options: { chatter: 'off' } }, async ($, on) => {
    const { clock, saved } = codexHome(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start(SESSION)
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
