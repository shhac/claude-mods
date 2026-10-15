import type { Elements, RenderElement } from 'claude-code'

import type { Catcher } from './controls'
import type { GripProps } from './grip'
import type { HandleProps } from './handle'
import { IMAGE_KEY, currentFrame } from './player'
import type { Plan, Size } from './stage'

// The trees the pet draws, from plain data: the hooks gather it, these lay it out.

type Terminal = Elements['terminal']

export type Look = { displayName: string; framesDir: string }

// The picture sits in a Box of its own, before any catcher: an unchanged
// sibling over a bare blitted element copies the last frame back over it.
const picture = ({ Box, Image }: Terminal, look: Look, petSize: Size) => (
  <Box>
    <Image
      key={IMAGE_KEY}
      source={{ file: currentFrame(look.framesDir), format: 'png' }}
      columns={petSize.columns}
      rows={petSize.rows}
      alt={`(${look.displayName})`}
    />
  </Box>
)

// Invisible, over the pet; it goes last so the pointer finds it.
const catcherOver = ({ Client }: Terminal, columns: number, rows: number) => (
  <Client
    key="handle"
    module="./handle.tsx"
    props={{ columns, rows } satisfies HandleProps}
    width={columns}
    height={rows}
  />
)

const speech = ({ Text }: Terminal, said: string) =>
  said.trim() === '' ? (
    <Text>{said}</Text>
  ) : (
    <Text color="inverseText" backgroundColor="claude">
      {said}
    </Text>
  )

export type Caption = { badge: string; status: string; said: string | null }

// Right-aligned in the band, the caption on the pet's left facing the screen.
export const bandFigure = (elements: Terminal, look: Look, caption: Caption, petSize: Size, width: number) => {
  const { Box, Text } = elements

  return (
    <Box width={width} flexDirection="row" justifyContent="flex-end" gap={1}>
      <Box flexDirection="column" justifyContent="flex-end" alignItems="flex-end">
        {caption.said === null || caption.said.trim() === '' ? null : speech(elements, ` ${caption.said} `)}
        <Box flexDirection="row" gap={1}>
          <Text color="claude" weight="bold">
            {look.displayName}
          </Text>
          <Text dimColor>{caption.badge}</Text>
        </Box>
        <Text dimColor>{caption.status}</Text>
      </Box>
      <Box>
        {picture(elements, look, petSize)}
        <Box position="absolute" top={0} left={0}>
          {catcherOver(elements, petSize.columns, petSize.rows)}
        </Box>
      </Box>
    </Box>
  )
}

export type RowShare = {
  plan: Plan
  isHost: boolean
  look: Look
  petSize: Size
  said: string | null
  catcher: Catcher | undefined
  screenColumns: number
}

// A conversation row with its share of the floating pet: the host row hangs
// the picture and the speech bubble; any row the pet overlaps lays a catcher.
export function rowWithPet(elements: Terminal, row: RenderElement, share: RowShare) {
  const { Box } = elements
  const { plan, petSize, catcher } = share
  const said = share.said === null ? '' : ` ${share.said} `

  // The bubble goes left of the pet, or right where the screen runs out.
  const roomLeft = share.screenColumns - plan.at.right - petSize.columns - 1
  const bubbleRight =
    roomLeft >= said.length ? plan.at.right + petSize.columns + 1 : Math.max(0, plan.at.right - said.length - 1)

  return (
    <Box flexDirection="column">
      {row}
      {share.isHost ? (
        <Box position="absolute" top={plan.top} right={plan.at.right}>
          {picture(elements, share.look, petSize)}
        </Box>
      ) : null}
      {share.isHost && said !== '' ? (
        <Box position="absolute" top={plan.top} right={bubbleRight}>
          {speech(elements, said)}
        </Box>
      ) : null}
      {catcher === undefined ? null : (
        <Box position="absolute" top={catcher.top} right={catcher.right}>
          {catcherOver(elements, petSize.columns, catcher.height)}
        </Box>
      )}
    </Box>
  )
}

export type Docked = { top: number; look: Look; petSize: Size }

// The footer: the engine's modes and any other mod's keep their place left of
// the caption; docked on the prompt, the picture hangs from here over the
// right end of the prompt box.
export function footerWithPet(elements: Terminal, below: RenderElement, grip: GripProps, docked: Docked | undefined) {
  const { Box, Client } = elements

  return (
    <Box flexDirection="row" gap={1}>
      {below}
      <Client key="grip" module="./grip.tsx" props={grip} />
      {docked === undefined ? null : (
        <Box position="absolute" top={docked.top} right={1}>
          {picture(elements, docked.look, docked.petSize)}
        </Box>
      )}
    </Box>
  )
}
