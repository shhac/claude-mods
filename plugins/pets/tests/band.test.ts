import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const HOME = '/Users/t'
const PETS = `${HOME}/.codex/pets`
const CACHE = `${HOME}/.claude/cache/app.paulie.claude-mods.pets`

const manifest = (id: string, displayName: string) =>
  JSON.stringify({ id, displayName, description: '', spritesheetPath: 'spritesheet.webp' })

// A Codex home with two pets, Codex set to the second, and slicing that works.
function codexHome(on: On) {
  const files = new Map<string, string>([
    [`${HOME}/.codex/config.toml`, 'pet = "custom:nullbyte"\n'],
    [`${PETS}/dawnbyte/pet.json`, manifest('dawnbyte', 'Dawnbyte')],
    [`${PETS}/dawnbyte/spritesheet.webp`, ''],
    [`${PETS}/nullbyte/pet.json`, manifest('nullbyte', 'Nullbyte')],
    [`${PETS}/nullbyte/spritesheet.webp`, ''],
  ])
  const slicedWith: string[] = []

  mock.env(on, { HOME })
  mock.store(on)
  // A real-looking now: a fresh pet's first treat isn't half an hour after 1970.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 15, 12) })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}))
  // A command with "fail" in it fails.
  on('tool.call', ($, e) => ({
    result: { type: 'text', file: { filePath: '/x', content: '', numLines: 0, startLine: 1, totalLines: 0 } },
    ...('command' in e && String(e.command).includes('fail') ? { isError: true } : {}),
  }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'engine band' })
  })
  on('fs.exists', ($, e) => ({ value: files.has(e.path) || e.path === PETS }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1000, isLink: false } }))
  on('fs.list', () => ({
    value: [
      { name: 'dawnbyte', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'nullbyte', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))
  on('process.run', ($, e) => {
    const target = e.argv.at(-1) ?? ''
    if (e.argv[0] === 'magick') {
      slicedWith.push(e.argv[1] ?? '')
      files.set(target.replace('PNG32:', '').replace('%02d', '71'), '')
    }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return { slicedWith, clock }
}

const pet = (args: string) => ({
  command: 'pet',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 120 },
}) as const

const BAND_PLACEMENT = { options: { placement: 'band' } }

const FOOTER = {
  plugin: 'pets',
  surface: 'terminal',
  component: 'SessionMode',
  props: { modes: [] },
  viewport: { columns: 120, rows: 40, isFullscreen: true },
} as const

const SIDEBAR_PANE = {
  plugin: 'pets',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'pets-sidebar',
  props: { title: 'Pet', isFocused: false, bodyColumns: 34, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  viewport: { columns: 194, rows: 66, isFullscreen: true },
} as const

const BAND = {
  plugin: 'pets',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

describe('the pet band', () => {
  test("shows the pet Codex has chosen, sliced into frames", BAND_PLACEMENT, async ($, on) => {
    const { slicedWith } = codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount(BAND)

    expect(slicedWith).toEqual([`${PETS}/nullbyte/spritesheet.webp`])
    expect(await ui.find({ type: 'Text', text: 'Nullbyte' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Hello!' })).toBeDefined()

    const row = (await ui.findAll({ type: 'Box' })).find(box => box.props.justifyContent === 'flex-end')
    expect(row?.props).toMatchObject({ width: 80 })
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()

    const image = await ui.find({ type: 'Image', key: 'pet' })
    // Row 3 (waving) is cells 24-27.
    expect(image?.props.source).toEqual({
      file: expect.stringMatching(new RegExp(`^${CACHE}/nullbyte-1000/frame-2[4-7]\\.png$`)),
      format: 'png',
    })
  })

  test('follows the turn: running, then a tool, then done', BAND_PLACEMENT, async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(BAND)
    await clock.advance(5000)

    await $.turn.start({ text: 'hi', turnId: 't1' })
    expect(await ui.find({ type: 'Text', text: 'Running' })).toBeDefined()

    await $.classic.Notification({ message: 'needs permission', notification_type: 'permission_prompt' })
    expect(await ui.find({ type: 'Text', text: 'Needs input' })).toBeDefined()

    const reading = $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/x' })
    await clock.settle()
    await reading
    expect(await ui.find({ type: 'Text', text: 'Running' })).toBeDefined()

    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'hi', durationMs: 10, isAborted: false })
    expect(await ui.find({ type: 'Text', text: 'Done!' })).toBeDefined()
  })

  test('/pet switches pets and remembers the choice', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const listed = await $.command.run(pet(''))
    expect(listed.text).toContain('● nullbyte — Nullbyte')
    expect(listed.text).toContain('○ dawnbyte — Dawnbyte')

    const switched = await $.command.run(pet('dawnbyte'))
    expect(switched.text).toBe('Dawnbyte is now your pet.')

    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const relisted = await $.command.run(pet('list'))
    expect(relisted.text).toContain('● dawnbyte — Dawnbyte')

    const missing = await $.command.run(pet('nope'))
    expect(missing.text).toContain('No pet "nope"')
  })

  test('/pet help says how to get a new pet', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const help = (await $.command.run(pet('help'))).text
    expect(help).toContain('/pet dock')
    expect(help).toContain('hatch-pet')
    expect(help).toContain('1536×1872')
  })

  test('/pet off hides the band', BAND_PLACEMENT, async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.command.run(pet('off'))

    const ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  })

  // 40 rows, of which the prompt and footer take 7: a 33-row conversation.
  const FLOATING_BAND = { ...BAND, props: { ...BAND.props, maxRows: 13 }, viewport: { columns: 120, rows: 40, isFullscreen: true } }

  const conversationRow = (requestId: string, first: number) =>
    ({
      plugin: 'pets',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text: 'hello', isFirstOfReply: true, onScreen: { first, last: first + 32, of: first + 40 } },
    }) as const

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

  test('the menu pats, feeds, closes when left, and opens above the prompt when docked', async ($, on) => {
    const { clock } = codexHome(on)
    on('ui.toast', () => ({ value: undefined }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
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
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
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
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
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
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const host = await $.ui.mount(conversationRow('row-1', 5))

    await host.pointer({ type: 'down', x: 1, y: 1, button: 'right' })
    expect(await host.find({ type: 'Text', text: 'wave·Lv2 ', in: 'menu' })).toBeDefined()
    // A locked trick can't be picked: the press does nothing.
    await host.pointer({ type: 'down', x: 10, y: 4, button: 'left', in: 'menu' })
    expect((await $.command.run(pet('stats'))).text).toContain('0 tricks')
  })

  test('a green test run is cheered, a red one winced at', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'cd x && bun test' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'ls tests' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'npm test -- fail' })
    expect((await $.command.run(pet('stats'))).text).toContain('1 green test runs (best streak 1)')
  })

  test('in its sidebar the pet has it all to hand, and leaves the chat and footer', async ($, on) => {
    codexHome(on)
    const panes: string[] = []
    on('ui.open', ($, e) => {
      panes.push(`open ${e.id}`)
      return { value: { isPlaced: true } }
    })
    on('ui.close', ($, e) => {
      panes.push(`close ${e.id}`)
      return { value: undefined }
    })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))

    expect((await $.command.run(pet('dock sidebar'))).text).toBe('Pet is in its sidebar.')
    expect(panes).toEqual(['open pets-sidebar'])
    const side = await $.ui.mount(SIDEBAR_PANE)
    expect(await side.find({ type: 'Image', key: 'pet' })).toBeDefined()
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeUndefined()
    expect(await footer.find({ key: 'grip' })).toBeUndefined()

    // Achievements and config start folded, actions open.
    expect(await side.find({ type: 'Text', text: /Regular/ })).toBeUndefined()
    await side.press({ key: 'section:achievements' })
    expect(await side.find({ type: 'Text', text: /· Regular: visit 7 days in a row/ })).toBeDefined()
    await side.press({ key: 'pat' })
    expect((await $.command.run(pet('stats'))).text).toContain('petted 1×')

    await side.press({ key: 'section:config' })
    await side.press({ key: 'place:conversation' })
    expect(panes).toEqual(['open pets-sidebar', 'close pets-sidebar'])
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeDefined()
  })

  test('with no room for the sidebar the pet stays where it was', async ($, on) => {
    codexHome(on)
    const panes: string[] = []
    on('ui.open', () => ({ value: { isPlaced: false, reason: 'too narrow' } }))
    on('ui.close', ($, e) => {
      panes.push(`close ${e.id}`)
      return { value: undefined }
    })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    expect((await $.command.run(pet('dock sidebar'))).text).toBe('No room for the sidebar in this terminal.')
    // The unplaced pane would wait for room and turn up later; it's closed.
    expect(panes).toEqual(['close pets-sidebar'])
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

  test('the pet says how it feels about the work, not what the work is', BAND_PLACEMENT, async ($, on) => {
    const { clock } = codexHome(on)
    const asked: string[] = []
    const answers = ['Ooh, my favourite file 💜', 'Bold of you to rewrite it all 🙃']
    on('model.complete', ($, e) => {
      asked.push(`${e.system ?? ''}\n${e.prompt}`)
      const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      return { value: { isAnswered: true, text: answers[asked.length - 1] ?? 'hm', usage } }
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(BAND)
    const said = async (line: string) => ui.find({ type: 'Text', text: line })

    await $.prompt.submit({ text: 'tidy up the stage maths', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'tidy up the stage maths', turnId: 't1' })
    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/hooks/stage.ts' })
    expect(asked.at(-1)).toContain('Your human asked Claude: tidy up the stage maths')
    expect(asked.at(-1)).toContain('Right now Claude is reading stage.ts')
    expect(asked.at(-1)).toContain('Never just describe')
    expect(await said('Ooh, my favourite file 💜')).toBeDefined()

    // Too soon after the last feeling for another.
    await $.tool.call({ tool: 'Edit', tool_use_id: 'u2', file_path: '/work/hooks/stage.ts', old_string: 'a', new_string: 'b' })
    expect(asked).toHaveLength(1)

    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'I rewrote it all.', durationMs: 10, isAborted: false })
    expect(asked.at(-1)).toContain('I rewrote it all.')
    // Wrapped to the bubble's width.
    expect(await said('Bold of you to rewrite it')).toBeDefined()
    expect(await said('all 🙃')).toBeDefined()
    expect((await $.command.run(pet('stats'))).text).toContain('watched 1 replies and 2 tool calls')
    await clock.advance(30000)
  })

  test('while Claude thinks quietly, the pet muses', { options: { placement: 'band', chatter: 'quiet' } }, async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(BAND)

    await $.turn.start({ text: 'hi', turnId: 't1' })
    expect(await ui.find({ type: 'Text', text: '∘°' })).toBeUndefined()

    // A thought bubble: its tail rises toward the pet.
    await clock.advance(6000)
    expect(await ui.find({ type: 'Text', text: '∘°' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hmm… 🤔' })).toBeDefined()

    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'hi', durationMs: 10, isAborted: false })
    await clock.advance(30000)
  })

  test('quiet chatter never asks the model', { options: { placement: 'band', chatter: 'quiet' } }, async ($, on) => {
    codexHome(on)
    const asked: string[] = []
    on('model.complete', ($, e) => {
      asked.push(e.prompt)
      return { deny: 'not in this test' }
    })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(BAND)

    await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'git hunk list' })
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Done.', durationMs: 10, isAborted: false })
    expect(asked).toEqual([])
  })
})
