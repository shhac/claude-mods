import type { Elements, RenderElement } from 'claude-code'

import type { Bubble, Dock, Sections, SizeName } from '../types'
import { PLACES, SIZE_NAMES } from './controls'
import { bubbleBox, picture } from './drawings'
import type { Look } from './drawings'
import type { AchievementLine } from './pages'
import type { Size } from './stage'

// The pet's sidebar, from plain data: what it knows about itself up top, the
// folding sections, then at the bottom, level with the prompt, its bubble,
// the pet and its name.

type Terminal = Elements['terminal']

export type SideButton = { id: string; label: string; isDisabled: boolean }

export type SidebarView = {
  look: Look
  petSize: Size
  header: string
  status: string
  stats: readonly string[]
  achievements: readonly AchievementLine[]
  achievementCount: string
  sections: Sections
  actions: readonly SideButton[]
  tricks: readonly SideButton[]
  place: Dock
  size: SizeName
  said: Bubble | null
  bodyRows: number
  // Seated above the prompt (no room beside it): a short strip instead.
  isInline: boolean
}

// What a press does, by the id of the button pressed.
export type Press = (id: string) => void

const TAIL_BELOW = { say: '▼', think: '°' } as const


// A button, or its label dim where it can't be pressed yet.
function button({ Button, Text }: Terminal, item: SideButton, press: Press, isCurrent = false) {
  if (item.isDisabled) {
    return (
      <Text key={item.id} dimColor>
        {item.label}
      </Text>
    )
  }

  return (
    <Button key={item.id} label={isCurrent ? `● ${item.label}` : item.label} dimColor={isCurrent} onPress={() => press(item.id)} />
  )
}

const buttonRow = (elements: Terminal, items: readonly RenderElement[]) => (
  <elements.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
    {items}
  </elements.Box>
)

// A section that folds: its title is the button that opens and closes it.
function section(elements: Terminal, id: keyof Sections, title: string, view: SidebarView, press: Press, body: () => RenderElement) {
  const { Box, Button } = elements
  const isOpen = view.sections[id]

  return (
    <Box key={`section-${id}`} flexDirection="column" marginTop={1}>
      <Button key={`section:${id}`} plain label={`${isOpen ? '▾' : '▸'} ${title}`} onPress={() => press(`section:${id}`)} />
      {isOpen ? body() : null}
    </Box>
  )
}

function achievementsBody({ Box, Text }: Terminal, view: SidebarView) {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {view.achievements.map(line => (
        <Text key={line.label} dimColor={!line.isEarned}>
          {line.label}
        </Text>
      ))}
    </Box>
  )
}

function configBody(elements: Terminal, view: SidebarView, press: Press) {
  const { Box, Text } = elements
  const placeButtons = PLACES.map(place =>
    button(elements, { id: `place:${place.id}`, label: place.label, isDisabled: false }, press, place.id === view.place),
  )
  const sizeButtons = SIZE_NAMES.map(name => button(elements, { id: `size:${name}`, label: name, isDisabled: false }, press, name === view.size))

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text dimColor>place</Text>
      {buttonRow(elements, placeButtons)}
      <Text dimColor>size over the chat</Text>
      {buttonRow(elements, sizeButtons)}
      {buttonRow(elements, [button(elements, { id: 'hide', label: 'hide', isDisabled: false }, press)])}
    </Box>
  )
}

function actionsBody(elements: Terminal, view: SidebarView, press: Press) {
  const { Box, Text } = elements

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {buttonRow(elements, view.actions.map(item => button(elements, item, press)))}
      <Text dimColor>tricks</Text>
      {buttonRow(elements, view.tricks.map(item => button(elements, item, press)))}
    </Box>
  )
}

// The bubble over the pet, its tail pointing down at it.
function bubbleOver(elements: Terminal, said: Bubble) {
  const { Box, Text } = elements

  return (
    <Box flexDirection="column" alignItems="center">
      {bubbleBox(elements, said, 'below')}
      <Text color="claude" dimColor={said.kind === 'think'}>
        {said.isFading ? ' ' : TAIL_BELOW[said.kind]}
      </Text>
    </Box>
  )
}

function petAtBottom(elements: Terminal, view: SidebarView) {
  const { Box, Text } = elements

  return (
    <Box flexDirection="column" alignItems="center">
      {view.said === null ? null : bubbleOver(elements, view.said)}
      {picture(elements, view.look, view.petSize)}
      <Text color="claude" weight="bold">
        {view.look.displayName}
      </Text>
    </Box>
  )
}

export function sidebar(elements: Terminal, view: SidebarView, press: Press) {
  const { Box, Text } = elements
  if (view.isInline) return inlineStrip(elements, view, press)

  return (
    <Box flexDirection="column" minHeight={view.bodyRows}>
      <Text weight="bold">{view.header}</Text>
      <Text dimColor>{view.status}</Text>
      <Box flexDirection="column" marginTop={1}>
        {view.stats.map(line => (
          <Text key={line} dimColor>
            {line}
          </Text>
        ))}
      </Box>
      {section(elements, 'achievements', `Achievements ${view.achievementCount}`, view, press, () => achievementsBody(elements, view))}
      {section(elements, 'config', 'Config', view, press, () => configBody(elements, view, press))}
      {section(elements, 'actions', 'Actions', view, press, () => actionsBody(elements, view, press))}
      <Box flexGrow={1} />
      {petAtBottom(elements, view)}
    </Box>
  )
}

// Above the prompt there's room for a strip only: the pet, who it is and
// what it's doing, and the actions.
function inlineStrip(elements: Terminal, view: SidebarView, press: Press) {
  const { Box, Text } = elements

  return (
    <Box flexDirection="row" columnGap={2}>
      {picture(elements, view.look, view.petSize)}
      <Box flexDirection="column">
        <Text>
          <Text color="claude" weight="bold">
            {view.look.displayName}
          </Text>{' '}
          {view.header}
        </Text>
        <Text dimColor>{view.status}</Text>
        {buttonRow(elements, view.actions.map(item => button(elements, item, press)))}
        {buttonRow(elements, [button(elements, { id: 'place:conversation', label: 'back over the chat', isDisabled: false }, press)])}
      </Box>
    </Box>
  )
}
