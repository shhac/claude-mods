import type { ClientModule, ClientPointerEvent } from 'claude-code'

import type { Offset } from '../types'

export type GripProps = {
  offset: Offset
  modes: string
  name: string
  status: string
}

type Grab = { x: number; y: number; from: Offset }

// Mutable per instance: the module function runs again on every redraw, while
// the pointer listener set on the first run must read the latest values.
type Live = { offset: Offset; columns: number; grab: Grab | undefined; sent: Offset | undefined }

// The footer site is right-aligned and the caption is padded to sit under the
// pet, so the region grows leftwards as the pet moves: count from its right
// edge to get a column that stays put on screen.
const fromRight = (event: ClientPointerEvent, live: Live) => ({ x: event.x - live.columns, y: event.y })

const isSame = (a: Offset | undefined, b: Offset) => a !== undefined && a.right === b.right && a.lift === b.lift

// The pet's caption, drawn in the footer's flow right under the pet. A floating
// box never receives the pointer (it lands on the box's parent), so the caption
// is the handle: press it and drag, and the drag keeps the pointer until released.
const Grip: ClientModule<GripProps, { live: Live }> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const live: Live = { offset: props.offset, columns: surface.columns, grab: undefined, sent: undefined }

    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'left') {
        live.grab = { ...fromRight(event, live), from: live.offset }
        return
      }

      const { grab } = live
      if (grab === undefined || (event.type !== 'move' && event.type !== 'up')) return

      const now = fromRight(event, live)
      const to: Offset = { right: grab.from.right - (now.x - grab.x), lift: grab.from.lift - (now.y - grab.y) }
      const isDrop = event.type === 'up'
      if (isDrop) live.grab = undefined

      // Pointers report moves within a cell; only a new cell is worth a redraw.
      if (!isDrop && isSame(live.sent, to)) return
      live.sent = to
      surface.post({ kind: isDrop ? 'drop' : 'drag', ...to })
    })

    surface.setState({ live })
  } else {
    surface.state.live.offset = props.offset
    surface.state.live.columns = surface.columns
  }

  return (
    <Box paddingRight={props.offset.right}>
      <Text dimColor>
        {props.modes === '' ? '' : `${props.modes} · `}
        <Text color="claude" weight="bold">
          {props.name}
        </Text>{' '}
        {props.status}
      </Text>
    </Box>
  )
}

export default Grip
