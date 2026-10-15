import type { Elements, RenderElement } from 'claude-code'

import type { Bubble, BubbleKind } from '../types'
import { wrapBubble } from './chatter'
import type { MenuProps } from './menu'
import { menuSize } from './menu-rows'
import type { MenuRow } from './menu-rows'

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
export const picture = ({ Box, Image }: Terminal, look: Look, petSize: Size) => (
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

// The bubble with its tail toward the pet: on its right or left, or, with
// the pet below it, none at its side (the sidebar draws one under it).
export type TailSide = 'right' | 'left' | 'below'

export function bubbleBox({ Box, Text }: Terminal, bubble: Bubble, side: TailSide) {
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
      <Text color="claude">{side === 'right' ? TAIL[bubble.kind].toRight : TAIL[bubble.kind].toLeft}</Text>
    </Box>
  )
  const isThought = bubble.kind === 'think'

  return (
    <Box flexDirection="row">
      {side === 'left' ? tail : null}
      <Box flexDirection="column" borderStyle="round" borderColor="claude" borderDimColor={isThought}>
        {shape.lines.map((line, row) => (
          <Text key={`line-${row}`} italic={isThought} dimColor={isThought}>
            {padLine(line, shape)}
          </Text>
        ))}
      </Box>
      {side === 'right' ? tail : null}
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
        {caption.said === null ? null : bubbleBox(elements, caption.said, 'right')}
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

export type ShownMenu = { rows: readonly MenuRow[]; isFading: boolean }

// The menu itself, or blank cells in its shape while it goes.
function menuBox({ Box, Client, Text }: Terminal, menu: ShownMenu) {
  const size = menuSize(menu.rows)
  if (menu.isFading) {
    return (
      <Box flexDirection="column">
        {Array.from({ length: size.rows }, (_, row) => (
          <Text key={`blank-${row}`}>{' '.repeat(size.columns)}</Text>
        ))}
      </Box>
    )
  }

  return (
    <Client
      key="menu"
      module="./menu.tsx"
      props={{ rows: menu.rows, columns: size.columns } satisfies MenuProps}
      width={size.columns}
      height={size.rows}
    />
  )
}

// Beside the pet, on the side with room, opening upward from the pet's
// bottom when the conversation has room above, else downward from its top.
function menuPlace(plan: Plan, petSize: Size, menu: ShownMenu, screenColumns: number) {
  const size = menuSize(menu.rows)
  const isLeft = screenColumns - plan.at.right - petSize.columns >= size.columns
  const grows = Math.max(0, size.rows - petSize.rows)
  return {
    top: grows <= plan.above ? plan.top - grows : plan.top,
    right: isLeft ? plan.at.right + petSize.columns : Math.max(0, plan.at.right - size.columns),
    rows: size.rows,
  }
}

// A row's box stretched up and down over `spans` (in the row's own lines),
// by empty spacers with negative margins of the same size, so the pointer
// reaches floating boxes there and every row stays in its place. The
// children are placed with `top` counted from the row's first line. (A Box
// holding the engine's row can't take a `width` or `alignSelf: stretch`: the
// engine refuses the tree and draws its own row.)
function stretched(
  { Box }: Terminal,
  row: RenderElement,
  hostLines: number,
  spans: readonly { top: number; rows: number }[],
  children: (shift: number) => (RenderElement | null)[],
) {
  const reach = Math.max(0, ...spans.map(span => -span.top))
  const drop = Math.max(0, ...spans.map(span => span.top + span.rows - hostLines))

  return (
    <Box flexDirection="column" marginTop={-reach} marginBottom={-drop}>
      <Box height={reach} />
      {row}
      <Box height={drop} />
      {children(reach)}
    </Box>
  )
}

export type RowShare = {
  plan: Plan
  isLit: boolean
  isFading: boolean
  isDebug: boolean
  look: Look
  petSize: Size
  said: Bubble | null
  menu: ShownMenu | undefined
  catcher: Catcher
  screenColumns: number
}

// The host row with the floating pet: the picture, the bubble or the menu,
// and over the picture the catcher, all where the pointer can reach them.
export function rowWithPet(elements: Terminal, row: RenderElement, share: RowShare) {
  const { Box } = elements
  const { plan, petSize, catcher, menu } = share
  // The menu stands in for the bubble while it's up.
  const said = menu === undefined ? share.said : null

  // The bubble goes left of the pet, or right where the screen runs out.
  const bubbleColumns = said === null ? 0 : shapeOf(said).columns
  const isLeftOfPet = share.screenColumns - plan.at.right - petSize.columns >= bubbleColumns
  const bubbleRight = isLeftOfPet ? plan.at.right + petSize.columns : Math.max(0, plan.at.right - bubbleColumns)
  const placed = menu === undefined ? undefined : menuPlace(plan, petSize, menu, share.screenColumns)

  const spans = [{ top: catcher.top, rows: catcher.height }, ...(placed === undefined ? [] : [placed])]
  return stretched(elements, row, plan.hostLines, spans, shift => [
    share.isLit ? frame(elements, petSize, plan.top + shift, plan.at.right) : null,
    share.isFading ? blankFrame(elements, petSize, plan.top + shift, plan.at.right) : null,
    <Box key="picture" position="absolute" top={plan.top + shift} right={plan.at.right}>
      {picture(elements, share.look, petSize)}
    </Box>,
    said === null ? null : (
      <Box key="bubble" position="absolute" top={plan.top + shift} right={bubbleRight}>
        {bubbleBox(elements, said, isLeftOfPet ? 'right' : 'left')}
      </Box>
    ),
    <Box key="catcher" position="absolute" top={catcher.top + shift} right={catcher.right}>
      {catcherOver(elements, petSize.columns, catcher.height, share.isDebug)}
    </Box>,
    placed === undefined || menu === undefined ? null : (
      <Box key="menu-place" position="absolute" top={placed.top + shift} right={placed.right}>
        {menuBox(elements, menu)}
      </Box>
    ),
  ])
}

// Docked on the prompt, the pet's menu opens from the conversation's bottom
// row, at its right end, just above the pet: the footer can't reach that far.
export function rowWithMenu(elements: Terminal, row: RenderElement, plan: Plan, menu: ShownMenu) {
  const { Box } = elements
  const place = { top: plan.top, rows: menuSize(menu.rows).rows }

  return stretched(elements, row, plan.hostLines, [place], shift => [
    <Box key="menu-place" position="absolute" top={plan.top + shift} right={plan.at.right}>
      {menuBox(elements, menu)}
    </Box>,
  ])
}

export type Docked = { top: number; look: Look; petSize: Size; isLit: boolean }

// Docked or not, while a drag that began on the docked pet runs.
export type DockCatcher = { top: number; petSize: Size; isOutlined: boolean }

// The footer: the engine's modes and any other mod's keep their place left of
// the caption; docked on the prompt, the picture hangs from here over the
// right end of the prompt box. As on a host row, the footer's box is
// stretched up over the docked pet so the pointer reaches its catcher.
export function footerWithPet(
  elements: Terminal,
  below: RenderElement,
  grip: GripProps,
  docked: Docked | undefined,
  catcher: DockCatcher | undefined,
) {
  const { Box, Client } = elements
  const reach = catcher === undefined ? 0 : Math.max(0, -catcher.top)

  return (
    <Box flexDirection="column" marginTop={-reach}>
      <Box height={reach} />
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
      {catcher === undefined ? null : (
        <Box key="catcher" position="absolute" top={catcher.top + reach} right={1}>
          {catcherOver(elements, catcher.petSize.columns, catcher.petSize.rows, catcher.isOutlined)}
        </Box>
      )}
    </Box>
  )
}
