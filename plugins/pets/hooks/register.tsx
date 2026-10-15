import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, Dock, Offset, SizeName } from '../types'
import { ACTIVITY_LABEL, REACTION_LABEL, columnsForRows } from './atlas'
import { afterTool, afterTurn, describeCare, fed, petted } from './care'
import type { GripProps } from './grip'
import type { HandleProps } from './handle'
import { keeper, loadCare, tend } from './keeper'
import { codexSelection, findPets, homesFor, prepareFrames } from './pets'
import type { PetHomes, PetPackage } from './pets'
import { IMAGE_KEY, animate, currentFrame, playback, react, setActivity, steer } from './player'
import { forgetRows, noteBottomSlot, noteRow, planFor, screen } from './stage'
import type { Size, Strip } from './stage'
import { narrateTool, remark, say, voice } from './voice'
import type { Chatter } from './voice'

const HOME_OFFSET: Offset = { right: 0, lift: 0 }
const SIZE_ROWS: Record<SizeName, number> = { small: 3, medium: 4, large: 6 }
const NEXT_SIZE: Record<SizeName, SizeName> = { small: 'medium', medium: 'large', large: 'small' }
const DOUBLE_CLICK_MS = 450
// A drag whose release never arrives (its row went away) ends on its own.
const DRAG_TIMEOUT_MS = 1500
// The prompt dock can reach this far up the bottom area before it's cut off.
const PROMPT_DOCK_REACH = 10

// The validator reads state refs per file, so each file declares the atoms it uses.
const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const activity = atom({ plugin: 'pets', key: 'activity' } as const, 'ready')
const reaction = atom({ plugin: 'pets', key: 'reaction' } as const, null)
const detail = atom({ plugin: 'pets', key: 'detail' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)
const offset = atom({ plugin: 'pets', key: 'offset' } as const, HOME_OFFSET)
const size = atom({ plugin: 'pets', key: 'size' } as const, 'medium')
const dock = atom({ plugin: 'pets', key: 'dock' } as const, 'conversation')
const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)
const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch'])
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const ASKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])
const SIZE_NAMES = new Set<string>(['small', 'medium', 'large'])

const activityForTool = (tool: string): Activity => (READ_ONLY_TOOLS.has(tool) ? 'reviewing' : 'running')

const isOffset = (value: unknown): value is Offset =>
  typeof value === 'object' &&
  value !== null &&
  'right' in value &&
  typeof value.right === 'number' &&
  'lift' in value &&
  typeof value.lift === 'number'

const isSizeName = (value: unknown): value is SizeName => typeof value === 'string' && SIZE_NAMES.has(value)
const isDock = (value: unknown): value is Dock => value === 'conversation' || value === 'prompt'
const asChatter = (value: unknown): Chatter => (value === 'quiet' || value === 'off' ? value : 'on')

const sizeOf = (name: SizeName): Size => ({ rows: SIZE_ROWS[name], columns: columnsForRows(SIZE_ROWS[name]) })

// Where a row last drew its catcher, so a drag can hold it there.
type Catcher = { top: number; right: number; height: number }

type Drag = {
  // Which press: the posting row, its catcher and its press count.
  gesture: string
  requestId: string
  from: Offset
  catcher: Catcher | undefined
  watchdog: Timer | undefined
}

// What the drawing hooks need without subscribing to it: a row that reads an
// atom redraws whenever it changes, and most rows draw nothing of the pet.
const mirror: {
  offset: Offset
  size: SizeName
  dock: Dock
  planKey: string
  catchers: Map<string, Catcher>
  drag: Drag | undefined
  lastClickAt: number
} = {
  offset: HOME_OFFSET,
  size: 'medium',
  dock: 'conversation',
  planKey: '',
  catchers: new Map(),
  drag: undefined,
  lastClickAt: Number.NEGATIVE_INFINITY,
}

type Look = { displayName: string; framesDir: string }

// What the rows need to draw the pet: whether there is one, and its frames.
async function petLook($: EngineInterface): Promise<Look | undefined> {
  if (await read($, isHidden)) return undefined

  const current = await read($, pet)
  return current === null ? undefined : { displayName: current.displayName, framesDir: current.framesDir }
}

async function statusLine($: EngineInterface) {
  const shownReaction = await read($, reaction)
  if (shownReaction !== null) return REACTION_LABEL[shownReaction]

  const tool = await read($, detail)
  const label = ACTIVITY_LABEL[await read($, activity)]
  return tool === null ? label : `${label} · ${tool}`
}

async function setOffset($: EngineInterface, next: Offset) {
  mirror.offset = next
  const was = await read($, offset)
  if (was.right !== next.right || was.lift !== next.lift) await update($, offset, () => next)
}

async function setSize($: EngineInterface, next: SizeName) {
  mirror.size = next
  await update($, size, () => next)
  await $.store.set('size', next)
}

async function setDock($: EngineInterface, next: Dock) {
  mirror.dock = next
  await update($, dock, () => next)
  await $.store.set('dock', next)
  $.ui.invalidate('ui.render')
}

// Right-aligned in the band, the caption on the pet's left facing the screen.
const figure = (
  { Box, Client, Image, Text }: Elements['terminal'],
  look: Look,
  caption: { badge: string; status: string; said: string | null },
  petSize: Size,
  width: number,
) => (
  <Box width={width} flexDirection="row" justifyContent="flex-end" gap={1}>
    <Box flexDirection="column" justifyContent="flex-end" alignItems="flex-end">
      {caption.said === null || caption.said.trim() === '' ? null : (
        <Text color="inverseText" backgroundColor="claude">
          {` ${caption.said} `}
        </Text>
      )}
      <Box flexDirection="row" gap={1}>
        <Text color="claude" weight="bold">
          {look.displayName}
        </Text>
        <Text dimColor>{caption.badge}</Text>
      </Box>
      <Text dimColor>{caption.status}</Text>
    </Box>
    <Box>
      <Box>
        <Image
          key={IMAGE_KEY}
          source={{ file: currentFrame(look.framesDir), format: 'png' }}
          columns={petSize.columns}
          rows={petSize.rows}
          alt={`(${look.displayName})`}
        />
      </Box>
      <Box position="absolute" top={0} left={0}>
        <Client
          key="handle"
          module="./handle.tsx"
          props={{ columns: petSize.columns, rows: petSize.rows } satisfies HandleProps}
          width={petSize.columns}
          height={petSize.rows}
        />
      </Box>
    </Box>
  </Box>
)

// Resolves why the pet could not be loaded, or undefined once it is shown.
async function adopt($: EngineInterface, homes: PetHomes, chosen: PetPackage) {
  try {
    const ready = await prepareFrames($, homes, chosen)
    playback.framesDir = ready.framesDir
    await update($, pet, () => ready)
    await loadCare($, ready.id)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function choosePet($: EngineInterface, homes: PetHomes, available: readonly PetPackage[]) {
  const stored = await $.store.get('selected')
  const wanted = typeof stored === 'string' ? stored : await codexSelection($, homes)

  return available.find(one => one.id === wanted) ?? available[0]
}

async function describe($: EngineInterface, homes: PetHomes) {
  const available = await findPets($, homes)
  if (available.length === 0) {
    return `No pets found. Put a Codex pet folder (pet.json + spritesheet) in ${homes.claude} or ${homes.codex}.`
  }

  const current = await read($, pet)
  const lines = available.map(one => `${one.id === current?.id ? '●' : '○'} ${one.id} — ${one.displayName}`)

  return [
    'Pets:',
    ...lines,
    '',
    'Switch with /pet <id>; hide with /pet off.',
    'Also: /pet size, /pet dock, /pet stats, /pet feed, /pet pat, /pet home.',
  ].join('\n')
}

// Brings back what the person chose and shows their pet.
async function settleIn($: EngineInterface, defaultSize: SizeName) {
  const wasHidden = (await $.store.get('isHidden')) === true
  await update($, isHidden, () => wasHidden)

  const savedOffset = await $.store.get('offset')
  if (isOffset(savedOffset)) await setOffset($, savedOffset)

  const savedSize = await $.store.get('size')
  mirror.size = isSizeName(savedSize) ? savedSize : defaultSize
  await update($, size, () => mirror.size)

  const savedDock = await $.store.get('dock')
  mirror.dock = isDock(savedDock) ? savedDock : 'conversation'
  await update($, dock, () => mirror.dock)

  const homes = await homesFor($)
  const chosen = await choosePet($, homes, await findPets($, homes))
  if (chosen === undefined) {
    await update($, problem, () => `no pets found in ${homes.claude} or ${homes.codex}`)
    return
  }

  const failure = await adopt($, homes, chosen)
  await update($, problem, () => failure ?? null)
  if (failure !== undefined) return

  await react($, 'greeting')
  const streak = keeper.care?.streak ?? 1
  if (streak > 1) await say($, `Day ${streak} in a row! 🎉`)
}

function endDrag($: EngineInterface) {
  mirror.drag?.watchdog?.cancel()
  mirror.drag = undefined
  steer($, undefined)
  $.ui.invalidate('ui.render')
}

// Keeps a drag alive while messages come; one that stops hearing ends itself.
function guardDrag($: EngineInterface, drag: Drag) {
  drag.watchdog?.cancel()
  drag.watchdog = $.clock.after(DRAG_TIMEOUT_MS, () => {
    if (mirror.drag === drag) endDrag($)
  })
}

// Moves the pet to where a drag says, held inside the conversation.
async function moveTo($: EngineInterface, wanted: Offset, isDrop: boolean) {
  const was = mirror.offset
  const at = planFor(wanted, sizeOf(mirror.size))?.at ?? wanted
  await setOffset($, at)

  if (isDrop) {
    await $.store.set('offset', at)
    return
  }

  // Pet coordinates count from the right, so a falling `right` runs right.
  if (at.right !== was.right) steer($, at.right < was.right ? 'right' : 'left')
}

// A click on the pet pets it, one on the caption doesn't; on either, a double
// click docks the pet on the prompt or back, and a right click resizes it.
async function click($: EngineInterface, button: unknown, isOnPet: boolean) {
  if (button === 'right') return setSize($, NEXT_SIZE[mirror.size])
  if (button !== 'left') return

  const now = await $.clock.now()
  const isDouble = now - mirror.lastClickAt < DOUBLE_CLICK_MS
  mirror.lastClickAt = isDouble ? Number.NEGATIVE_INFINITY : now
  if (isDouble) return setDock($, mirror.dock === 'conversation' ? 'prompt' : 'conversation')
  if (!isOnPet) return

  await tend($, petted)
  await react($, 'happy')
}

const fieldOf = (data: unknown, key: string) => {
  if (typeof data !== 'object' || data === null || !(key in data)) return undefined
  const record: Record<string, unknown> = { ...data }
  return record[key]
}

const numberField = (data: unknown, key: string) => {
  const value = fieldOf(data, key)
  return typeof value === 'number' ? value : 0
}

export const register: Register = (on, options) => {
  const defaultSize: SizeName = isSizeName(options.size) ? options.size : 'medium'
  const isFloating = options.placement !== 'band'
  voice.chatter = asChatter(options.chatter)

  // A load starts the module's own state over; the session's state and the
  // store keep what the person chose.
  forgetRows()
  mirror.offset = HOME_OFFSET
  mirror.size = defaultSize
  mirror.dock = 'conversation'
  mirror.planKey = ''
  mirror.catchers.clear()
  mirror.drag = undefined
  mirror.lastClickAt = Number.NEGATIVE_INFINITY

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Codex-compatible pet: list, switch, show, hide, size, dock, stats, feed',
      argumentHint: '[list | <id> | on | off | home | size | dock | stats | feed | pat]',
    })

    await settleIn($, defaultSize)
    animate($)

    // A reload brings new drawing code; the rows already on screen keep the old
    // drawing until something redraws them.
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // A /clear or a resume drops the old conversation's rows unreported; left
  // noted, one of them would keep the pet.
  on('session.end', async ($, e, next) => {
    forgetRows()
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setActivity($, 'running')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isAsking = ASKING_TOOLS.has(e.tool)
    await setActivity($, isAsking ? 'waiting' : activityForTool(e.tool), e.tool)
    void narrateTool($, e.tool, e)

    const ran = await next(e)
    const isError = ran.isError === true

    await setActivity($, 'running')
    await tend($, care => afterTool(care, isError))
    if (isError && !isAsking) await react($, 'failed')

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (ASKING_NOTIFICATIONS.has(e.notification_type)) await setActivity($, 'waiting')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await setActivity($, 'ready')
    if (e.reason === 'error' || e.reason === 'refusal') await react($, 'failed')
    if (e.reason !== 'answer') return next(e)

    await react($, 'celebrating')
    await tend($, afterTurn)

    const current = await read($, pet)
    if (current !== null) void remark($, current.displayName, e.answer)

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [arg = '', value = ''] = e.args.trim().split(/\s+/)
    const homes = await homesFor($)

    if (arg === '' || arg === 'list') return { text: await describe($, homes) }

    if (arg === 'home') {
      await setOffset($, HOME_OFFSET)
      await $.store.set('offset', HOME_OFFSET)
      if (mirror.dock !== 'conversation') await setDock($, 'conversation')
      return { text: 'Pet is back in its corner.' }
    }

    if (arg === 'size') {
      const next = isSizeName(value) ? value : NEXT_SIZE[mirror.size]
      await setSize($, next)
      return { text: `Pet is ${next} now (${SIZE_ROWS[next]} rows).` }
    }

    if (arg === 'dock') {
      const next = mirror.dock === 'conversation' ? 'prompt' : 'conversation'
      await setDock($, next)
      return { text: next === 'prompt' ? 'Pet is sitting on the prompt box.' : 'Pet is back over the conversation.' }
    }

    const current = await read($, pet)
    if (arg === 'stats') {
      const care = keeper.care
      if (current === null || care === undefined) return { text: 'No pet to show.' }
      return { text: describeCare(current.displayName, care, await $.clock.now()) }
    }

    if (arg === 'feed') {
      const care = keeper.care
      if (current === null || care === undefined) return { text: 'No pet to feed.' }

      const meal = fed(care, await $.clock.now())
      if ('waitMinutes' in meal) return { text: `${current.displayName} is still full. Try again in ${meal.waitMinutes} min.` }

      await tend($, () => meal.care)
      await react($, 'happy')
      await say($, 'nom nom nom 🍪')
      return { text: `${current.displayName} loved that.` }
    }

    if (arg === 'pat') {
      if (current === null) return { text: 'No pet to pat.' }
      await tend($, petted)
      await react($, 'happy')
      return { text: `${current.displayName} wiggles happily.` }
    }

    if (['off', 'hide', 'on', 'show'].includes(arg)) {
      const isOff = arg === 'off' || arg === 'hide'
      await update($, isHidden, () => isOff)
      await $.store.set('isHidden', isOff)
      return { text: isOff ? 'Pet hidden. /pet on brings it back.' : 'Pet is back.' }
    }

    const chosen = (await findPets($, homes)).find(one => one.id === arg)
    if (chosen === undefined) return { text: `No pet "${arg}".\n\n${await describe($, homes)}` }

    const failure = await adopt($, homes, chosen)
    if (failure !== undefined) return { text: `Could not load ${chosen.displayName}: ${failure}` }
    await update($, problem, () => null)

    await $.store.set('selected', chosen.id)
    await react($, 'greeting')

    return { text: `${chosen.displayName} is now your pet.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    // A longer prompt shrinks the conversation, and the row carrying the pet
    // won't redraw for that by itself: left as it was, the pet can end up above
    // the top of the conversation, out of sight.
    const hasResized = e.viewport !== undefined && noteBottomSlot(e.viewport.rows, e.viewport.columns, e.props.maxRows)
    if (hasResized && isFloating) $.ui.invalidate('ui.render')
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const failure = await read($, problem)

    // The band is shared with the host and other mods, so ours goes below theirs.
    if (failure !== null) {
      return (
        <Box flexDirection="column">
          {await next(e)}
          <Text dimColor>pets: {failure}</Text>
        </Box>
      )
    }

    if (isFloating) return next(e)

    const look = await petLook($)
    if (look === undefined) return next(e)

    playback.siteRequestId = e.requestId
    playback.framesDir = look.framesDir

    const caption = { badge: await read($, badge), status: await statusLine($), said: await read($, bubble) }
    const petSize = sizeOf(await read($, size))

    return (
      <Box flexDirection="column">
        {await next(e)}
        {figure($.ui.resolve(e), look, caption, petSize, e.props.bodyColumns)}
      </Box>
    )
  })

  // Floating over the conversation, the pet is drawn by the rows: the picture
  // whole from the bottom-most row, and over it, in each row it overlaps, an
  // invisible catcher the pointer can reach (stage.ts says why).
  on(
    'ui.render',
    {
      component: [
        'UserMessage',
        'AssistantMessage',
        'ToolUse',
        'ToolResult',
        'ToolGroup',
        'CommandOutput',
        'TurnDuration',
        'InfoNotice',
      ],
    },
    async ($, e, next) => {
      if (!isFloating || e.surface !== 'terminal') return next(e)

      noteRow(e.requestId, e.props.onScreen)
      if (mirror.dock !== 'conversation') return next(e)

      const look = await petLook($)
      if (look === undefined) return next(e)

      const petSize = sizeOf(mirror.size)
      const plan = planFor(mirror.offset, petSize)
      if (plan === undefined) return next(e)

      // Another row's share may have changed with this one's report.
      if (plan.key !== mirror.planKey) {
        mirror.planKey = plan.key
        $.ui.invalidate('ui.render')
      }

      const isHost = plan.host === e.requestId
      const held = mirror.drag?.requestId === e.requestId ? mirror.drag.catcher : undefined
      const share: Strip | undefined = plan.catchers.get(e.requestId)
      const catcher: Catcher | undefined =
        held ?? (share === undefined ? undefined : { top: share.top, right: plan.at.right, height: share.height })
      if (catcher === undefined) mirror.catchers.delete(e.requestId)
      else mirror.catchers.set(e.requestId, catcher)
      if (!isHost && catcher === undefined) return next(e)

      const { Box, Client, Image, Text } = $.ui.resolve(e)
      const row = await next(e)

      // Only the row holding the picture follows the pet's every change.
      const said = isHost ? await read($, bubble) : null
      if (isHost) {
        await read($, offset)
        await read($, size)
        playback.siteRequestId = e.requestId
        playback.framesDir = look.framesDir
      }

      const bubbleText = said === null ? '' : ` ${said} `
      const roomLeft = screen.columns - plan.at.right - petSize.columns - 1
      const bubbleRight =
        roomLeft >= bubbleText.length ? plan.at.right + petSize.columns + 1 : Math.max(0, plan.at.right - bubbleText.length - 1)

      // The picture sits in a Box of its own, before the catcher: an unchanged
      // sibling over a bare blitted element copies the last frame back over it.
      // The catcher goes last so the pointer finds it.
      return (
        <Box flexDirection="column">
          {row}
          {isHost ? (
            <Box position="absolute" top={plan.top} right={plan.at.right}>
              <Box>
                <Image
                  key={IMAGE_KEY}
                  source={{ file: currentFrame(look.framesDir), format: 'png' }}
                  columns={petSize.columns}
                  rows={petSize.rows}
                  alt={`(${look.displayName})`}
                />
              </Box>
            </Box>
          ) : null}
          {bubbleText === '' ? null : (
            <Box position="absolute" top={plan.top} right={bubbleRight}>
              {bubbleText.trim() === '' ? (
                <Text>{bubbleText}</Text>
              ) : (
                <Text color="inverseText" backgroundColor="claude">
                  {bubbleText}
                </Text>
              )}
            </Box>
          )}
          {catcher === undefined ? null : (
            <Box position="absolute" top={catcher.top} right={catcher.right}>
              <Client
                key="handle"
                module="./handle.tsx"
                props={{ columns: petSize.columns, rows: catcher.height } satisfies HandleProps}
                width={petSize.columns}
                height={catcher.height}
              />
            </Box>
          )}
        </Box>
      )
    },
  )

  // The caption in the footer: the pet's name, level, mood and what it's up to,
  // and a handle for the pet. Docked on the prompt, the picture hangs from here
  // over the right end of the prompt box.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isFloating || e.surface !== 'terminal') return next(e)

    const look = await petLook($)
    if (look === undefined) return next(e)

    const { Box, Client, Image } = $.ui.resolve(e)
    const where = await read($, dock)
    const petSize = sizeOf(await read($, size))
    const at = await read($, offset)
    const said = await read($, bubble)
    const isDocked = where === 'prompt'
    const grip: GripProps = {
      pad: isDocked ? 0 : Math.min(at.right, Math.max(0, screen.columns - petSize.columns)),
      name: look.displayName,
      badge: await read($, badge),
      status: isDocked && said !== null && said.trim() !== '' ? `“${said}”` : await statusLine($),
    }

    if (isDocked) {
      playback.siteRequestId = e.requestId
      playback.framesDir = look.framesDir
    }

    // The engine's modes, and any other mod's, keep their place left of the caption.
    return (
      <Box flexDirection="row" gap={1}>
        {await next(e)}
        <Client key="grip" module="./grip.tsx" props={grip} />
        {isDocked ? (
          <Box position="absolute" top={-Math.min(PROMPT_DOCK_REACH, Math.max(1, screen.promptRows - 1))} right={1}>
            <Box>
              <Image
                key={IMAGE_KEY}
                source={{ file: currentFrame(look.framesDir), format: 'png' }}
                columns={petSize.columns}
                rows={petSize.rows}
                alt={`(${look.displayName})`}
              />
            </Box>
          </Box>
        ) : null}
      </Box>
    )
  })

  // The pet's catcher: a drag moves it, a click pets it, a double click docks
  // it on the prompt or back, a right click changes its size.
  on('ui.message', { element: 'handle' }, async ($, e) => {
    const kind = fieldOf(e.data, 'kind')
    if (kind === 'click') {
      await click($, fieldOf(e.data, 'button'), true)
      return {}
    }
    if (kind !== 'drag' && kind !== 'drop') return {}

    const gesture = `${e.requestId}:${e.element}:${numberField(e.data, 'gesture')}`
    const current = mirror.drag
    const drag: Drag =
      current !== undefined && current.gesture === gesture
        ? current
        : {
            gesture,
            requestId: e.requestId,
            from: mirror.offset,
            catcher: mirror.catchers.get(e.requestId),
            watchdog: undefined,
          }
    mirror.drag = drag

    const wanted = { right: drag.from.right - numberField(e.data, 'dx'), lift: drag.from.lift - numberField(e.data, 'dy') }
    await moveTo($, wanted, kind === 'drop')

    if (kind === 'drop') endDrag($)
    else guardDrag($, drag)
    return {}
  })

  // The footer caption: dragged, the pet's middle follows the pointer, which
  // counts up from the footer; the conversation's bottom row sits the prompt
  // area's height above it.
  on('ui.message', { element: 'grip' }, async ($, e) => {
    const kind = fieldOf(e.data, 'kind')
    if (kind === 'click') {
      await click($, fieldOf(e.data, 'button'), false)
      return {}
    }
    if (kind !== 'aim' && kind !== 'drop') return {}

    if (mirror.dock !== 'conversation') await setDock($, 'conversation')

    const petSize = sizeOf(mirror.size)
    const wanted = {
      right: numberField(e.data, 'fromRight') - Math.floor(petSize.columns / 2),
      lift: numberField(e.data, 'up') - (screen.promptRows - 1) - Math.floor(petSize.rows / 2),
    }
    const drag: Drag = mirror.drag ?? { gesture: 'grip', requestId: e.requestId, from: mirror.offset, catcher: undefined, watchdog: undefined }
    mirror.drag = drag
    await moveTo($, wanted, kind === 'drop')

    if (kind === 'drop') endDrag($)
    else guardDrag($, drag)
    return {}
  })
}
