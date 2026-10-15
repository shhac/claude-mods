import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Sections } from '../types'
import { columnsForRows } from './atlas'
import { keeper } from './keeper'
import { act, feedButton, fetchButton, trickButtons } from './menu-actions'
import { achievementCount, achievementLines, headerLine, statsLines } from './pages'
import type { SidebarView } from './sidebar'
import { petLook, statusLine } from './status'

// What the sidebar shows and what its buttons do.

const sections = atom({ plugin: 'pets', key: 'sections' } as const, { achievements: false, config: false, actions: true })
const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)
const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')
const size = atom({ plugin: 'pets', key: 'size' } as const, 'medium')
const dock = atom({ plugin: 'pets', key: 'dock' } as const, 'conversation')

const SECTION_IDS = new Set<string>(['achievements', 'config', 'actions'])
const isSection = (value: string): value is keyof Sections => SECTION_IDS.has(value)

// As tall as fits the sidebar's width, within reason.
const MAX_ROWS = 10
const INLINE_ROWS = 4
function sidebarRows(columns: number) {
  const fitting = Array.from({ length: MAX_ROWS }, (_, index) => MAX_ROWS - index).find(rows => columnsForRows(rows) <= columns - 2)
  return fitting ?? 3
}

export async function sidebarView($: EngineInterface, bodyRows: number, bodyColumns: number, isInline: boolean) {
  const look = await petLook($)
  if (look === undefined) return undefined

  // The badge changes with the pet's care, so reading it redraws the sidebar.
  await read($, badge)
  const care = keeper.care
  const now = await $.clock.now()
  const rows = isInline ? INLINE_ROWS : sidebarRows(bodyColumns)

  const view: SidebarView = {
    look,
    petSize: { rows, columns: columnsForRows(rows) },
    header: care === undefined ? '' : headerLine(care),
    status: await statusLine($),
    stats: care === undefined ? [] : statsLines(care, now),
    achievements: care === undefined ? [] : achievementLines(care),
    achievementCount: care === undefined ? '' : achievementCount(care),
    sections: await read($, sections),
    actions: [{ id: 'pat', label: '♥ Pat', isDisabled: care === undefined }, feedButton(care, now), fetchButton(care)],
    tricks: trickButtons(),
    place: await read($, dock),
    size: await read($, size),
    said: await read($, bubble),
    bodyRows,
    isInline,
  }
  return view
}

// A press in the sidebar: a section title folds it; the rest act as the
// menu's picks do.
export async function pressSidebar($: EngineInterface, id: string) {
  const name = id.startsWith('section:') ? id.slice('section:'.length) : undefined
  if (name === undefined || !isSection(name)) return act($, id)

  await update($, sections, open => ({ ...open, [name]: !open[name] }))
}
