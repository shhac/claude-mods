import { describe, expect, test } from 'claude-code/testing'

import { codexHome, conversationRow, FLOATING_BAND, FOOTER, pet } from './harness'

describe('the pet floating over the conversation', () => {
  test('floats over the conversation, riding the row that starts the viewport', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)

    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ type: 'Text', text: /Nullbyte/, in: 'grip' })).toBeDefined()
    expect(await footer.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    expect(await footer.find({ type: 'Image' })).toBeUndefined()

    const host = await $.ui.mount(conversationRow('row-1', 5))
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeDefined()

    // Bottom of a 33-row conversation, scrolled 5 rows into the host: rows 34-37.
    const floating = (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')
    expect(floating?.props).toMatchObject({ right: 0, top: 34 })
  })

  test('the pet itself is the handle: drag it anywhere over the conversation', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const boxes = async () => (await host.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')

    // The picture, then the catcher over it.
    expect((await boxes()).map(box => box.props)).toMatchObject([
      { right: 0, top: 34 },
      { right: 0, top: 34 },
    ])

    await host.pointer({ type: 'down', x: 3, y: 1, button: 'left' })
    await host.pointer({ type: 'move', x: -27, y: -9, button: 'left' })
    // The picture follows; the catcher holds still under the pointer until the drop.
    expect((await boxes()).map(box => box.props)).toMatchObject([
      { right: 30, top: 24 },
      { right: 0, top: 34 },
    ])

    // Far up and far left: held to the conversation's top and the screen's width.
    await host.pointer({ type: 'move', x: -500, y: -200, button: 'left' })
    await host.pointer({ type: 'up', x: -500, y: -200, button: 'left' })
    expect((await boxes())[0]?.props).toMatchObject({ right: 113, top: 5 })

    const home = await $.command.run(pet('home'))
    expect(home.text).toBe('Pet is back in its corner.')
    expect((await boxes())[0]?.props).toMatchObject({ right: 0, top: 34 })
  })

  test("the host row's box stretches up over the pet, so its catcher can be reached", async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const reply = conversationRow('reply', 5)
    await $.ui.mount({ ...reply, props: { ...reply.props, onScreen: { first: 5, last: 44, of: 45 } } })
    const took = await $.ui.mount({
      plugin: 'pets',
      surface: 'terminal',
      component: 'TurnDuration',
      requestId: 'took',
      props: { word: 'Baked', durationMs: 3000, onScreen: { first: 0, last: 1, of: 2 } },
    })
    const boxes = async () => (await took.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')

    // At home the pet's 4 rows end on the 2-row line: 2 rows above its box.
    expect((await took.findAll({ type: 'Box' }))[0]?.props).toMatchObject({ marginTop: -2, marginBottom: -0 })
    expect((await boxes()).map(box => box.props)).toMatchObject([
      { right: 0, top: 0 },
      { right: 0, top: 0 },
    ])
  })

  test('the footer caption drags the pet down as well as up, and a click leaves it be', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const picture = async () => (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')

    await footer.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'grip' })
    await footer.pointer({ type: 'up', x: 0, y: 0, button: 'left', in: 'grip' })
    expect((await picture())?.props).toMatchObject({ top: 34 })

    // Up 26 rows from the footer is 20 above the conversation's bottom: the
    // pet's middle goes there.
    await footer.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'grip' })
    await footer.pointer({ type: 'move', x: 0, y: -26, button: 'left', in: 'grip' })
    expect((await picture())?.props).toMatchObject({ top: 37 - 18 - 3 })

    // And back down, below where the drag began.
    await footer.pointer({ type: 'move', x: 0, y: -10, button: 'left', in: 'grip' })
    await footer.pointer({ type: 'up', x: 0, y: -10, button: 'left', in: 'grip' })
    expect((await picture())?.props).toMatchObject({ top: 37 - 2 - 3 })
  })

  test('a click pets it, a right click opens its menu, a double click docks it on the prompt', async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const click = async (button: 'left' | 'right') => {
      await host.pointer({ type: 'down', x: 1, y: 1, button })
      await host.pointer({ type: 'up', x: 1, y: 1, button })
    }

    await click('left')
    expect((await $.command.run(pet('stats'))).text).toContain('petted 1×')

    // A right press opens the menu at once; its release may never come.
    await host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    expect(await host.find({ type: 'Text', text: /Config ›/, in: 'menu' })).toBeDefined()

    // Config is the seventh row; on its page the size row is second:
    // " Size  small medium large", inside the border.
    await host.pointer({ type: 'down', x: 2, y: 7, button: 'left', in: 'menu' })
    expect(await host.find({ type: 'Text', text: /‹ Back/, in: 'menu' })).toBeDefined()
    await host.pointer({ type: 'down', x: 22, y: 2, button: 'left', in: 'menu' })
    expect((await host.find({ type: 'Image', key: 'pet' }))?.props).toMatchObject({ rows: 6 })
    await clock.advance(1000)
    expect(await host.find({ key: 'menu' })).toBeUndefined()

    await clock.advance(2000)
    await click('left')
    await click('left')
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeUndefined()
    expect((await footer.find({ type: 'Image', key: 'pet' }))?.props).toMatchObject({ rows: 6 })
    // Its top on the prompt box's top edge, the caption moved left of it.
    const docked = (await footer.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')
    expect(docked?.props).toMatchObject({ top: -3, right: 1 })

    // The docked pet has its own catcher: the footer's box stretches up over
    // it, and a double click there puts the pet back.
    expect((await footer.findAll({ type: 'Box' }))[0]?.props).toMatchObject({ marginTop: -3 })
    const tap = async () => {
      await footer.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: 'handle' })
      await footer.pointer({ type: 'up', x: 1, y: 1, button: 'left', in: 'handle' })
    }
    await clock.advance(2000)
    await tap()
    await tap()
    expect(await footer.find({ type: 'Image', key: 'pet' })).toBeUndefined()
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeDefined()

    // Dragged from the dock, it comes off and follows the pointer.
    await clock.advance(2000)
    await click('left')
    await click('left')
    expect(await footer.find({ type: 'Image', key: 'pet' })).toBeDefined()
    await footer.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: 'handle' })
    await footer.pointer({ type: 'move', x: 1, y: -20, button: 'left', in: 'handle' })
    expect(await footer.find({ type: 'Image', key: 'pet' })).toBeUndefined()
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeDefined()
    await footer.pointer({ type: 'up', x: 1, y: -20, button: 'left', in: 'handle' })
  })

  test('the pointer over the pet lights it up and says what it can do', async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const frame = async () => (await host.findAll({ type: 'Box' })).find(box => box.props.borderStyle === 'round')

    expect(await frame()).toBeUndefined()

    await host.pointer({ type: 'enter', x: 1, y: 1 })
    expect((await frame())?.props).toMatchObject({ position: 'absolute', top: 34 - 1, right: -1 })
    expect(await footer.find({ type: 'Text', text: /2-click: dock/, in: 'grip' })).toBeDefined()

    await host.pointer({ type: 'leave', x: 1, y: 1 })
    expect(await frame()).toBeUndefined()

    // A new row moves the pet from under a resting pointer, so it goes out.
    await host.pointer({ type: 'enter', x: 1, y: 1 })
    expect(await frame()).toBeDefined()
    const newer = await $.ui.mount(conversationRow('row-2', 0))
    expect((await newer.findAll({ type: 'Box' })).find(box => box.props.borderStyle === 'round')).toBeUndefined()
    await clock.advance(1000)
  })

  test('hands the pet to the newest row, and the old host lets it go', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)

    const older = await $.ui.mount({ ...conversationRow('row-1', 0), props: { text: 'a', isFirstOfReply: true, onScreen: { first: 0, last: 9, of: 10 } } })
    expect(await older.find({ type: 'Image', key: 'pet' })).toBeDefined()

    const newer = await $.ui.mount({ ...conversationRow('row-2', 0), props: { text: 'b', isFirstOfReply: true, onScreen: { first: 0, last: 5, of: 6 } } })
    expect(await newer.find({ type: 'Image', key: 'pet' })).toBeDefined()
    expect(await older.find({ type: 'Image', key: 'pet' })).toBeUndefined()
  })

  test('a longer prompt pulls the pet back inside the shrunken conversation', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const floating = async () => (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')

    // As high as a 33-row conversation goes: its top row, 5 rows into the host.
    await host.pointer({ type: 'down', x: 1, y: 1, button: 'left' })
    await host.pointer({ type: 'up', x: 1, y: -200, button: 'left' })
    expect((await floating())?.props).toMatchObject({ top: 5 })

    // The prompt grows by five rows: the conversation's top is five rows lower.
    await $.ui.mount({ ...FLOATING_BAND, props: { ...FLOATING_BAND.props, maxRows: 8 } })
    expect((await floating())?.props).toMatchObject({ top: 10 })
  })
})
