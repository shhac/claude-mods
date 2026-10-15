import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

// What every pets test starts from: a Codex home with two pets, and the
// drawings the mod hooks, as the engine would mount them.

export const HOME = '/Users/t'
export const PETS = `${HOME}/.codex/pets`
export const CACHE = `${HOME}/.claude/cache/app.paulie.claude-mods.pets`

export const manifest = (id: string, displayName: string) =>
  JSON.stringify({ id, displayName, description: '', spritesheetPath: 'spritesheet.webp' })

// A store another session writes to as well, the test playing that session;
// what's read back is a copy, as from the engine's JSON file.
function sharedStore(on: On, saved: Map<string, unknown>) {
  on('store.get', ($, e) => ({ value: structuredClone(saved.get(e.key)) }))
  on('store.set', ($, e) => {
    saved.set(e.key, structuredClone(e.value))
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...saved.keys()] }))
}

// A Codex home with two pets, Codex set to the second, and slicing that works;
// its store is handed back, for a test to play another session with.
export function codexHome(on: On) {
  const files = new Map<string, string>([
    [`${HOME}/.codex/config.toml`, 'pet = "custom:nullbyte"\n'],
    [`${PETS}/dawnbyte/pet.json`, manifest('dawnbyte', 'Dawnbyte')],
    [`${PETS}/dawnbyte/spritesheet.webp`, ''],
    [`${PETS}/nullbyte/pet.json`, manifest('nullbyte', 'Nullbyte')],
    [`${PETS}/nullbyte/spritesheet.webp`, ''],
  ])
  const slicedWith: string[] = []

  mock.env(on, { HOME })
  const saved = new Map<string, unknown>()
  sharedStore(on, saved)
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

  return { slicedWith, clock, saved }
}

// A session as every test starts one: interactive, in a terminal.
export const SESSION = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

export const pet = (args: string) => ({
  command: 'pet',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 120 },
}) as const

export const BAND_PLACEMENT = { options: { placement: 'band' } }

export const FOOTER = {
  plugin: 'pets',
  surface: 'terminal',
  component: 'SessionMode',
  props: { modes: [] },
  viewport: { columns: 120, rows: 40, isFullscreen: true },
} as const

export const SIDEBAR_PANE = {
  plugin: 'pets',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'app-paulie-claude-mods-pets-sidebar',
  props: { title: 'Pet', isFocused: false, bodyColumns: 34, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  viewport: { columns: 194, rows: 66, isFullscreen: true },
} as const

export const BAND = {
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

export const FLOATING_BAND = { ...BAND, props: { ...BAND.props, maxRows: 13 }, viewport: { columns: 120, rows: 40, isFullscreen: true } }

export const conversationRow = (requestId: string, first: number) =>
  ({
    plugin: 'pets',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId,
    props: { text: 'hello', isFirstOfReply: true, onScreen: { first, last: first + 32, of: first + 40 } },
  }) as const
