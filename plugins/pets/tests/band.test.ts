import { describe, expect, test } from 'claude-code/testing'

import { BAND, BAND_PLACEMENT, CACHE, codexHome, pet, PETS, SESSION } from './harness'

describe('the pet band: placement, commands and chatter', () => {
  test("shows the pet Codex has chosen, sliced into frames", BAND_PLACEMENT, async ($, on) => {
    const { slicedWith } = codexHome(on)
    await $.session.start(SESSION)

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

  test('back the next day, the pet cheers the streak', BAND_PLACEMENT, async ($, on) => {
    const { clock, saved } = codexHome(on)
    const yesterday = clock.now() - 20 * 60 * 60 * 1000
    saved.set('care:nullbyte', { streak: 3, lastDay: '2026-10-14', lastSeenAt: yesterday, adoptedAt: yesterday })
    await $.session.start(SESSION)

    const ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Text', text: /Day 4 in a row/ })).toBeDefined()
  })

  test('follows the turn: running, then a tool, then done', BAND_PLACEMENT, async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start(SESSION)
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
    await $.session.start(SESSION)

    const listed = await $.command.run(pet(''))
    expect(listed.text).toContain('● nullbyte — Nullbyte')
    expect(listed.text).toContain('○ dawnbyte — Dawnbyte')

    const switched = await $.command.run(pet('dawnbyte'))
    expect(switched.text).toBe('Dawnbyte is now your pet.')

    await $.session.start(SESSION)
    const relisted = await $.command.run(pet('list'))
    expect(relisted.text).toContain('● dawnbyte — Dawnbyte')

    const missing = await $.command.run(pet('nope'))
    expect(missing.text).toContain('No pet "nope"')
  })

  test('/pet help says how to get a new pet', async ($, on) => {
    codexHome(on)
    await $.session.start(SESSION)

    const help = (await $.command.run(pet('help'))).text
    expect(help).toContain('/pet dock')
    expect(help).toContain('hatch-pet')
    expect(help).toContain('1536×1872')
  })

  test('/pet off hides the band', BAND_PLACEMENT, async ($, on) => {
    codexHome(on)
    await $.session.start(SESSION)
    await $.command.run(pet('off'))

    const ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  })

  // 40 rows, of which the prompt and footer take 7: a 33-row conversation.

  test('a green test run is cheered, a red one winced at', async ($, on) => {
    codexHome(on)
    await $.session.start(SESSION)

    await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'cd x && bun test' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'u2', command: 'ls tests' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', command: 'npm test -- fail' })
    expect((await $.command.run(pet('stats'))).text).toContain('1 green test runs (best streak 1)')
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
    await $.session.start(SESSION)
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
    await $.session.start(SESSION)
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
    await $.session.start(SESSION)
    await $.ui.mount(BAND)

    await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'git hunk list' })
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'Done.', durationMs: 10, isAborted: false })
    expect(asked).toEqual([])
  })

  test('with chatter on, a failed model call falls back to the pet’s own line', BAND_PLACEMENT, async ($, on) => {
    codexHome(on)
    on('model.complete', () => ({ deny: 'offline' }))
    await $.session.start(SESSION)
    const ui = await $.ui.mount(BAND)

    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/a.ts' })
    expect(await ui.find({ type: 'Text', text: /what’s in there|read that one|nosing around|so many files/ })).toBeDefined()
  })

  test('the model is asked at most every 20 s; in between the pet uses its own lines', BAND_PLACEMENT, async ($, on) => {
    const { clock } = codexHome(on)
    const asked: string[] = []
    on('model.complete', ($, e) => {
      asked.push(e.prompt)
      const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      return { value: { isAnswered: true, text: 'ooh, from the model', usage } }
    })
    await $.session.start(SESSION)
    const ui = await $.ui.mount(BAND)

    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/a.ts' })
    expect(asked).toHaveLength(1)

    // Past the 12 s between feelings, short of the 20 s between model calls.
    await clock.advance(13000)
    await $.tool.call({ tool: 'Edit', tool_use_id: 'u2', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' })
    expect(asked).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: /careful|liked it before|fresh code|tests/ })).toBeDefined()
  })

  test('a bubble goes after 8 s; a newer one keeps its own time', { options: { placement: 'band', chatter: 'quiet' } }, async ($, on) => {
    const { clock } = codexHome(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount(BAND)
    const shows = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined
    const feeling = /what’s in there|read that one|nosing around|so many files/

    await $.command.run(pet('feed'))
    expect(await shows(/nom nom nom/)).toBe(true)

    // A feeling 5 s in replaces it. The treat's timer, up at 8 s, leaves the
    // feeling be; the feeling goes when its own 8 s are up.
    await clock.advance(5000)
    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/work/a.ts' })
    expect(await shows(/nom nom nom/)).toBe(false)
    await clock.advance(3500)
    expect(await shows(feeling)).toBe(true)
    await clock.advance(5000)
    expect(await shows(feeling)).toBe(false)
  })
})
