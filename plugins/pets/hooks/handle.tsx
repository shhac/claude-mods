import type { ClientModule } from 'claude-code'

export type HandleProps = { columns: number; rows: number }

type Press = { x: number; y: number; hasMoved: boolean }

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
      // The pointer can't change shape, so the pet lights up instead. A drag
      // holds the pointer and may leave the region; the drop puts it out.
      if ((event.type === 'enter' || event.type === 'leave') && live.press === undefined) {
        surface.post({ kind: 'hover', isOver: event.type === 'enter' })
        return
      }

      // Only a left press drags, so any other button is a click straight
      // away: over the conversation, a right button's release can go astray.
      if (event.type === 'down' && event.button !== undefined && event.button !== 'left') {
        live.press = undefined
        surface.post({ kind: 'click', button: event.button })
        return
      }

      if (event.type === 'down' && event.button === 'left') {
        live.press = { x: event.x, y: event.y, hasMoved: false }
        live.gesture += 1
        return
      }

      const { press } = live
      if (press === undefined || (event.type !== 'move' && event.type !== 'up')) return

      const dx = event.x - press.x
      const dy = event.y - press.y
      if (dx !== 0 || dy !== 0) press.hasMoved = true

      if (event.type === 'up') {
        live.press = undefined
        surface.post(
          press.hasMoved
            ? { kind: 'drop', gesture: live.gesture, dx, dy }
            : { kind: 'click', button: 'left' },
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
