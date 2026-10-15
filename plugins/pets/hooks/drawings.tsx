import type { Elements, RenderElement } from 'claude-code'

import type { Bubble, BubbleKind } from '../types'
import { wrapBubble } from './chatter'

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

// A frame one cell outside the pet while the pointer is over it, drawn
// before the picture: the pointer can't change shape to show what it can grab.
const frame = ({ Box }: Terminal, petSize: Size, top: number, right: number) => (
  <Box
    position="absolute"
    top={top - 1}
    right={right - 1}
    width={petSize.columns + 2}
    height={petSize.rows + 2}
    borderStyle="round"
    borderColor="claude"
  />
)

// The frame's cells drawn blank, so none of it is left behind once it goes.
const blankFrame = ({ Box, Text }: Terminal, petSize: Size, top: number, right: number) => (
  <Box position="absolute" top={top - 1} right={right - 1} flexDirection="column">
    {Array.from({ length: petSize.rows + 2 }, (_, row) =>
      row === 0 || row === petSize.rows + 1 ? (
        <Text key={`edge-${row}`}>{' '.repeat(petSize.columns + 2)}</Text>
      ) : (
        <Box key={`side-${row}`} width={petSize.columns + 2} justifyContent="space-between">
          <Text> </Text>
          <Text> </Text>
        </Box>
      ),
    )}
  </Box>
)

// Invisible, over the pet; it goes last so the pointer finds it.
const catcherOver = ({ Client }: Terminal, columns: number, rows: number, isOutlined: boolean) => (
  <Client
    key="handle"
    module="./handle.tsx"
    props={{ columns, rows, isOutlined } satisfies HandleProps}
    width={columns}
    height={rows}
  />
)

// A tail on the bubble's side toward the pet: a pointer for speech, rising
// little circles for a thought.
const TAIL: Record<BubbleKind, { toRight: string; toLeft: string }> = {
  say: { toRight: '▸', toLeft: '◂' },
  think: { toRight: '∘°', toLeft: '°∘' },
}

export type BubbleShape = { lines: readonly string[]; columns: number; rows: number; tail: number }

// The bubble's size on screen: its wrapped text in a rounded border with a
// column of padding each side, and its tail.
export function shapeOf(bubble: Bubble): BubbleShape {
  const lines = wrapBubble(bubble.text)
  const widest = Math.max(0, ...lines.map(line => line.length))
  const tail = TAIL[bubble.kind].toRight.length
  return { lines, columns: widest + 4 + tail, rows: lines.length + 2, tail }
}

// Spaces, not padding: padding leaves its cells unpainted, so whatever is
// under the bubble shows through.
const padLine = (line: string, shape: BubbleShape) => ` ${line.padEnd(shape.columns - shape.tail - 4)} `

// `isPetRight` puts the tail on the right, toward a pet on that side.
const bubbleBox = ({ Box, Text }: Terminal, bubble: Bubble, isPetRight: boolean) => {
  const shape = shapeOf(bubble)
  if (bubble.isFading) {
    return (
      <Box flexDirection="column" width={shape.columns} height={shape.rows}>
        {Array.from({ length: shape.rows }, (_, row) => (
          <Text key={`blank-${row}`}>{' '.repeat(shape.columns)}</Text>
        ))}
      </Box>
    )
  }

  const tail = (
    <Box marginTop={1}>
      <Text color="claude">{isPetRight ? TAIL[bubble.kind].toRight : TAIL[bubble.kind].toLeft}</Text>
    </Box>
  )
  const isThought = bubble.kind === 'think'

  return (
    <Box flexDirection="row">
      {isPetRight ? null : tail}
      <Box flexDirection="column" borderStyle="round" borderColor="claude" borderDimColor={isThought}>
        {shape.lines.map((line, row) => (
          <Text key={`line-${row}`} italic={isThought} dimColor={isThought}>
            {padLine(line, shape)}
          </Text>
        ))}
      </Box>
      {isPetRight ? tail : null}
    </Box>
  )
}

export type Caption = { badge: string; status: string; said: Bubble | null }

// Right-aligned in the band, the caption on the pet's left facing the screen.
export const bandFigure = (elements: Terminal, look: Look, caption: Caption, petSize: Size, width: number) => {
  const { Box, Text } = elements

  return (
    <Box width={width} flexDirection="row" justifyContent="flex-end" gap={1}>
      <Box flexDirection="column" justifyContent="flex-end" alignItems="flex-end">
        {caption.said === null ? null : bubbleBox(elements, caption.said, true)}
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
          {catcherOver(elements, petSize.columns, petSize.rows, false)}
        </Box>
      </Box>
    </Box>
  )
}

export type RowShare = {
  plan: Plan
  isHost: boolean
  isLit: boolean
  isFading: boolean
  isDebug: boolean
  look: Look
  petSize: Size
  said: Bubble | null
  catcher: Catcher | undefined
  screenColumns: number
}

// A conversation row with its share of the floating pet: the host row hangs
// the picture and the speech bubble; any row the pet overlaps lays a catcher.
export function rowWithPet(elements: Terminal, row: RenderElement, share: RowShare) {
  const { Box } = elements
  const { plan, petSize, catcher } = share
  const { said } = share

  // The bubble goes left of the pet, or right where the screen runs out.
  const bubbleColumns = said === null ? 0 : shapeOf(said).columns
  const isLeftOfPet = share.screenColumns - plan.at.right - petSize.columns >= bubbleColumns
  const bubbleRight = isLeftOfPet ? plan.at.right + petSize.columns : Math.max(0, plan.at.right - bubbleColumns)

  return (
    <Box flexDirection="column">
      {row}
      {share.isLit ? frame(elements, petSize, plan.top, plan.at.right) : null}
      {share.isFading ? blankFrame(elements, petSize, plan.top, plan.at.right) : null}
      {share.isHost ? (
        <Box position="absolute" top={plan.top} right={plan.at.right}>
          {picture(elements, share.look, petSize)}
        </Box>
      ) : null}
      {share.isHost && said !== null ? (
        <Box position="absolute" top={plan.top} right={bubbleRight}>
          {bubbleBox(elements, said, isLeftOfPet)}
        </Box>
      ) : null}
      {catcher === undefined ? null : (
        <Box position="absolute" top={catcher.top} right={catcher.right}>
          {catcherOver(elements, petSize.columns, catcher.height, share.isDebug)}
        </Box>
      )}
    </Box>
  )
}

export type Docked = { top: number; look: Look; petSize: Size; isLit: boolean }

// The footer: the engine's modes and any other mod's keep their place left of
// the caption; docked on the prompt, the picture hangs from here over the
// right end of the prompt box.
export function footerWithPet(elements: Terminal, below: RenderElement, grip: GripProps, docked: Docked | undefined) {
  const { Box, Client } = elements

  return (
    <Box flexDirection="row" gap={1}>
      {below}
      <Client key="grip" module="./grip.tsx" props={grip} />
      {docked?.isLit === true ? frame(elements, docked.petSize, docked.top, 1) : null}
      {docked === undefined ? null : (
        <Box position="absolute" top={docked.top} right={1}>
          {picture(elements, docked.look, docked.petSize)}
        </Box>
      )}
    </Box>
  )
}
