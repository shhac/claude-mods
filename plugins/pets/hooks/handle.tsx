import type { ClientModule } from 'claude-code'

export type HandleProps = { columns: number; rows: number }

type Press = { x: number; y: number; button: 'left' | 'middle' | 'right'; hasMoved: boolean }

// Mutable per instance: the module function runs again on every redraw, while
// the pointer listener set on the first run must read the latest values.
type Live = { press: Press | undefined; gesture: number; sent: string }

// Lies over the pet and draws nothing. The row holding it keeps it where it
// was pressed until the drag ends, so a pointer's place in the region is its
// place on screen, and each post carries the whole way from the press: a
// later post in the same frame replaces an undelivered one.
const Handle: ClientModule<HandleProps, { live: Live }> = (props, surface) => {
  const { Box } = surface.elements

  if (surface.state === undefined) {
    const live: Live = { press: undefined, gesture: 0, sent: '' }

    surface.onPointer(event => {
      if (event.type === 'down' && event.button !== undefined) {
        live.press = { x: event.x, y: event.y, button: event.button, hasMoved: false }
        live.gesture += 1
        return
      }

      const { press } = live
      if (press === undefined || (event.type !== 'move' && event.type !== 'up')) return

      const dx = event.x - press.x
      const dy = event.y - press.y
      if (dx !== 0 || dy !== 0) press.hasMoved = press.hasMoved || press.button === 'left'

      if (event.type === 'up') {
        live.press = undefined
        surface.post(
          press.hasMoved
            ? { kind: 'drop', gesture: live.gesture, dx, dy }
            : { kind: 'click', button: press.button },
        )
        return
      }

      // Pointers report moves within a cell; only a new cell is worth a redraw.
      const sent = `${live.gesture}:${dx}:${dy}`
      if (!press.hasMoved || sent === live.sent) return
      live.sent = sent
      surface.post({ kind: 'drag', gesture: live.gesture, dx, dy })
    })

    surface.setState({ live })
  }

  return <Box width={props.columns} height={props.rows} />
}

export default Handle
