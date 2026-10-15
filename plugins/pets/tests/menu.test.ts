import { describe, expect, test } from 'claude-code/testing'

import { codexHome, conversationRow, FLOATING_BAND, FOOTER, pet, SESSION } from './harness'

describe("the pet's menu, fetch and tricks", () => {
  test('the menu pats, feeds, closes when left, and opens above the prompt when docked', async ($, on) => {
    const { clock } = codexHome(on)
    on('ui.toast', () => ({ value: undefined }))
    await $.session.start(SESSION)
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const openMenu = async () => host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    const pick = async (row: number) => host.pointer({ type: 'down', x: 2, y: row, button: 'left', in: 'menu' })

    await openMenu()
    await pick(1)
    await clock.advance(1000)
    await openMenu()
    await pick(2)
    await clock.advance(1000)
    const stats = (await $.command.run(pet('stats'))).text
    expect(stats).toContain('petted 1×')
    expect(stats).toContain('1 treats')

    // Fed just now: the row says so and can't be picked.
    await openMenu()
    expect(await host.find({ type: 'Text', text: /Feed \(full for 30 min\)/, in: 'menu' })).toBeDefined()

    // The pointer leaves: the menu goes soon after.
    await host.pointer({ type: 'enter', x: 2, y: 1, in: 'menu' })
    await host.pointer({ type: 'leave', x: 2, y: 1, in: 'menu' })
    await clock.advance(2000)
    expect(await host.find({ key: 'menu' })).toBeUndefined()

    // Docked, a right click on the name tag opens it from the bottom row.
    await $.command.run(pet('dock'))
    await footer.pointer({ type: 'down', x: 0, y: 0, button: 'right', in: 'grip' })
    expect(await host.find({ type: 'Text', text: /Fetch/, in: 'menu' })).toBeDefined()
    await clock.advance(20000)
  })

  test('the menu opens on actions, with pages for stats, achievements and config', async ($, on) => {
    codexHome(on)
    await $.session.start(SESSION)
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const shows = async (text: RegExp) => (await host.find({ type: 'Text', text, in: 'menu' })) !== undefined

    await host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    expect(await shows(/Achievements 0\/13 ›/)).toBe(true)

    await host.pointer({ type: 'down', x: 2, y: 5, button: 'left', in: 'menu' })
    expect(await shows(/energy/)).toBe(true)
    expect(await shows(/♥ Pat/)).toBe(false)

    // Back, then the achievements.
    await host.pointer({ type: 'down', x: 2, y: 10, button: 'left', in: 'menu' })
    await host.pointer({ type: 'down', x: 2, y: 6, button: 'left', in: 'menu' })
    expect(await shows(/· Regular: visit 7 days in a row/)).toBe(true)
  })

  test('fetch: the pet runs to the far side and back, and is a little tired after', async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start(SESSION)
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const right = async () => (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')?.props.right

    await host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    await host.pointer({ type: 'down', x: 3, y: 3, button: 'left', in: 'menu' })
    await clock.advance(500)
    expect(await right()).toBeGreaterThan(0)

    await clock.advance(10000)
    expect(await right()).toBe(0)
    expect((await $.command.run(pet('stats'))).text).toContain('1 games of fetch')
  })

  test('tricks wait for their level', async ($, on) => {
    codexHome(on)
    await $.session.start(SESSION)
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))

    await host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    expect(await host.find({ type: 'Text', text: 'wave·Lv2 ', in: 'menu' })).toBeDefined()
    // A locked trick can't be picked: the press does nothing.
    await host.pointer({ type: 'down', x: 10, y: 4, button: 'left', in: 'menu' })
    expect((await $.command.run(pet('stats'))).text).toContain('0 tricks')
  })

  test('docking the pet mid-fetch ends the game; docked, it fetches on the spot', async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start(SESSION)
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    // The name tag opens the menu wherever the pet is.
    const fetchFromMenu = async () => {
      await footer.pointer({ type: 'down', x: 0, y: 0, button: 'right', in: 'grip' })
      await host.pointer({ type: 'down', x: 3, y: 3, button: 'left', in: 'menu' })
    }

    await fetchFromMenu()
    await clock.advance(300)
    await $.command.run(pet('dock prompt'))
    await clock.advance(10000)
    expect((await $.command.run(pet('stats'))).text).toContain('0 games of fetch')

    // Docked, the menu opens from the bottom row; a minute on, it plays again,
    // on the spot.
    await clock.advance(60000)
    await fetchFromMenu()
    await clock.advance(5000)
    expect((await $.command.run(pet('stats'))).text).toContain('1 games of fetch')
  })
})
