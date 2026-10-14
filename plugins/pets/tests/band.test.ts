import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const HOME = '/Users/t'
const PETS = `${HOME}/.codex/pets`
const CACHE = `${HOME}/.claude/cache/pets`

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
  const clock = mock.clock(on)

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}))
  on('tool.call', () => ({ result: { type: 'text', file: { filePath: '/x', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))
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

    const row = (await ui.findAll({ type: 'Box' }))[0]
    expect(row?.props).toMatchObject({ width: 80, justifyContent: 'flex-end' })

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
    expect(await footer.find({ type: 'Image' })).toBeUndefined()

    const host = await $.ui.mount(conversationRow('row-1', 5))
    expect(await host.find({ type: 'Image', key: 'pet' })).toBeDefined()

    // Bottom of a 33-row conversation, scrolled 5 rows into the host: rows 34-37.
    const floating = (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')
    expect(floating?.props).toMatchObject({ right: 0, top: 34 })
  })

  test('drags anywhere over the conversation, held inside it', async ($, on) => {
    codexHome(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.ui.mount(FLOATING_BAND)
    const footer = await $.ui.mount(FOOTER)
    const host = await $.ui.mount(conversationRow('row-1', 5))
    const floating = async () => (await host.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')

    await footer.pointer({ type: 'down', x: 3, y: 0, button: 'left' })
    await footer.pointer({ type: 'move', x: -27, y: -10 })
    expect((await floating())?.props).toMatchObject({ right: 30, top: 24 })

    // Far up and far left: held to the conversation's top and the screen's width.
    await footer.pointer({ type: 'move', x: -500, y: -200 })
    await footer.pointer({ type: 'up', x: -500, y: -200, button: 'left' })
    expect((await floating())?.props).toMatchObject({ right: 113, top: 5 })

    const home = await $.command.run(pet('home'))
    expect(home.text).toBe('Pet is back in its corner.')
    expect((await floating())?.props).toMatchObject({ right: 0, top: 34 })
  })
})
