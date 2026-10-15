import type { ClientModule } from 'claude-code'

import { choiceSpans } from './menu-rows'
import type { MenuRow } from './menu-rows'

export type MenuProps = { rows: readonly MenuRow[]; columns: number }

// What sits under the pointer: an action's id, or a choice's.
function idAt(rows: readonly MenuRow[], x: number, y: number): string | undefined {
  // The border takes the first row and column.
  const row = rows[y - 1]
  if (row === undefined || x < 1) return undefined
  if (row.kind === 'action') return row.isDisabled ? undefined : row.id
  return choiceSpans(row).find(span => x - 1 >= span.from && x - 1 < span.to)?.id
}

// Mutable per instance: the pointer listener set on the first run reads the
// latest rows.
type Live = { hovered: string | undefined; rows: readonly MenuRow[] }

// The pet's right-click menu. A press on a row picks it straight away; the
// pointer coming and going lets the hooks close the menu once it's left.
const Menu: ClientModule<MenuProps, { live: Live }> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const live: Live = { hovered: undefined, rows: props.rows }

    surface.onPointer(event => {
      if (event.type === 'enter' || event.type === 'leave') {
        surface.post({ kind: 'hover', isOver: event.type === 'enter' })
        return
      }

      const id = idAt(live.rows, event.x, event.y)
      if (event.type === 'down' && id !== undefined) {
        surface.post({ kind: 'pick', id })
        return
      }

      if (event.type !== 'move' || id === live.hovered) return
      live.hovered = id
      surface.setState({ live })
    })

    surface.setState({ live })
  } else {
    surface.state.live.rows = props.rows
  }

  const hovered = surface.state?.live.hovered
  // Inside the border.
  const inner = props.columns - 2

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="claude">
      {props.rows.map(row =>
        row.kind === 'action' ? (
          <Text key={row.id} inverse={row.id === hovered} dimColor={row.isDisabled}>
            {` ${row.label.padEnd(inner - 2)} `}
          </Text>
        ) : (
          <Text key={row.label}>
            {` ${row.label} `}
            {row.choices.map(choice => (
              <Text key={choice.id} inverse={choice.id === hovered} bold={choice.isCurrent} dimColor={!choice.isCurrent}>
                {`${choice.label} `}
              </Text>
            ))}
            {' '.repeat(Math.max(0, inner - (choiceSpans(row).at(-1)?.to ?? 0)))}
          </Text>
        ),
      )}
    </Box>
  )
}

export default Menu
