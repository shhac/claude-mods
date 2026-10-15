import { describe, expect, test } from 'claude-code/testing'

import { codexHome, conversationRow, FLOATING_BAND, FOOTER, pet, SIDEBAR_PANE } from './harness'

describe("the pet's sidebar", () => {
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
    expect(panes).toEqual(['open app-paulie-claude-mods-pets-sidebar'])
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
    expect(panes).toEqual(['open app-paulie-claude-mods-pets-sidebar', 'close app-paulie-claude-mods-pets-sidebar'])
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
    expect(panes).toEqual(['close app-paulie-claude-mods-pets-sidebar'])
  })
})
