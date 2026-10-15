import type { ClientModule, ClientPointerEvent } from 'claude-code'

export type GripProps = {
  // Columns of padding after the caption, so it sits under the pet.
  pad: number
  name: string
  // The pet's level and mood, drawn after its name.
  badge: string
  status: string
}

type Press = { x: number; y: number; button: 'left' | 'middle' | 'right'; hasMoved: boolean }

// Mutable per instance: the module function runs again on every redraw, while
// the pointer listener set on the first run must read the latest values.
type Live = { columns: number; press: Press | undefined; sent: string }

// The footer is right-aligned and the caption padded to sit under the pet, so
// the region grows leftwards as the pet moves: count from its right edge for
// a column that stays put on screen. Rows count up from the footer, 0 on it.
const aimOf = (event: ClientPointerEvent, live: Live) => ({ fromRight: live.columns - 1 - event.x, up: -event.y })

// The pet's caption in the footer, and a handle for the pet from there: press
// it and drag, and the pet follows the pointer anywhere over the conversation,
// down as well as up. A press with no drag is a click.
const Grip: ClientModule<GripProps, { live: Live }> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const live: Live = { columns: surface.columns, press: undefined, sent: '' }

    surface.onPointer(event => {
      if (event.type === 'down' && event.button !== undefined) {
        live.press = { x: event.x, y: event.y, button: event.button, hasMoved: false }
        return
      }

      const { press } = live
      if (press === undefined || (event.type !== 'move' && event.type !== 'up')) return

      if (event.type === 'up') {
        live.press = undefined
        surface.post(press.hasMoved ? { kind: 'drop', ...aimOf(event, live) } : { kind: 'click', button: press.button })
        return
      }

      // Only a drag moves the pet: a click on the caption leaves it be.
      const isAway = event.x !== press.x || event.y !== press.y
      press.hasMoved = press.hasMoved || (press.button === 'left' && isAway)
      const aim = aimOf(event, live)
      const sent = `${aim.fromRight}:${aim.up}`
      if (!press.hasMoved || sent === live.sent) return
      live.sent = sent
      surface.post({ kind: 'aim', ...aim })
    })

    surface.setState({ live })
  } else {
    surface.state.live.columns = surface.columns
  }

  return (
    <Box paddingRight={props.pad}>
      <Text dimColor>
        <Text color="claude" weight="bold">
          {props.name}
        </Text>
        {props.badge === '' ? '' : ` ${props.badge}`} {props.status}
      </Text>
    </Box>
  )
}

export default Grip
