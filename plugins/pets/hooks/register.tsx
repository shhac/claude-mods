import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { Activity, Offset } from '../types'
import { ACTIVITY_LABEL, REACTION_LABEL, columnsForRows } from './atlas'
import { IMAGE_KEY, animate, currentFrame, playback, react, setActivity, steer } from './player'
import { clampOffset, hostRow, noteBottomSlot, noteRow, topInHost } from './stage'
import type { GripProps } from './grip'
import { codexSelection, findPets, homesFor, prepareFrames } from './pets'
import type { PetHomes, PetPackage } from './pets'

const HOME_OFFSET: Offset = { right: 0, lift: 0 }

// The validator reads state refs per file, so each file declares the atoms it uses.
const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const activity = atom({ plugin: 'pets', key: 'activity' } as const, 'ready')
const reaction = atom({ plugin: 'pets', key: 'reaction' } as const, null)
const detail = atom({ plugin: 'pets', key: 'detail' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)
const offset = atom({ plugin: 'pets', key: 'offset' } as const, HOME_OFFSET)

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch'])
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const ASKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

const activityForTool = (tool: string): Activity => (READ_ONLY_TOOLS.has(tool) ? 'reviewing' : 'running')

const isOffset = (value: unknown): value is Offset =>
  typeof value === 'object' &&
  value !== null &&
  'right' in value &&
  typeof value.right === 'number' &&
  'lift' in value &&
  typeof value.lift === 'number'

const isDrop = (value: unknown) => typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'drop'

type PetView = { displayName: string; framesDir: string; label: string; tool: string | null }
type Size = { rows: number; columns: number }

async function petView($: EngineInterface): Promise<PetView | undefined> {
  if (await read($, isHidden)) return undefined

  const current = await read($, pet)
  if (current === null) return undefined

  const shownReaction = await read($, reaction)
  const label = shownReaction === null ? ACTIVITY_LABEL[await read($, activity)] : REACTION_LABEL[shownReaction]
  const tool = shownReaction === null ? await read($, detail) : null

  return { displayName: current.displayName, framesDir: current.framesDir, label, tool }
}

// Right-aligned in the band, the caption on the pet's left facing the screen.
const figure = ({ Box, Image, Text }: Elements['terminal'], view: PetView, size: Size, width: number) => (
  <Box width={width} flexDirection="row" justifyContent="flex-end" gap={1}>
    <Box flexDirection="column" justifyContent="flex-end" alignItems="flex-end">
      <Text color="claude" weight="bold">
        {view.displayName}
      </Text>
      <Text dimColor>
        {view.label}
        {view.tool === null ? '' : ` · ${view.tool}`}
      </Text>
    </Box>
    <Image
      key={IMAGE_KEY}
      source={{ file: currentFrame(view.framesDir), format: 'png' }}
      columns={size.columns}
      rows={size.rows}
      alt={`(${view.displayName})`}
    />
  </Box>
)

// Resolves why the pet could not be loaded, or undefined once it is shown.
async function adopt($: EngineInterface, homes: PetHomes, chosen: PetPackage) {
  try {
    const ready = await prepareFrames($, homes, chosen)
    playback.framesDir = ready.framesDir
    await update($, pet, () => ready)
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

  return ['Pets:', ...lines, '', 'Switch with /pet <id>; hide with /pet off.'].join('\n')
}

export const register: Register = (on, options) => {
  const rows = Math.min(16, Math.max(2, Number(options.size ?? 4)))
  const size: Size = { rows, columns: columnsForRows(rows) }
  const isFloating = options.placement !== 'band'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Codex-compatible pet: list, switch, show or hide it',
      argumentHint: '[list | <id> | on | off | home]',
    })

    const wasHidden = (await $.store.get('isHidden')) === true
    await update($, isHidden, () => wasHidden)

    const savedOffset = await $.store.get('offset')
    if (isOffset(savedOffset)) await update($, offset, () => savedOffset)

    const homes = await homesFor($)
    const chosen = await choosePet($, homes, await findPets($, homes))
    if (chosen === undefined) {
      await update($, problem, () => `no pets found in ${homes.claude} or ${homes.codex}`)
      return next(e)
    }

    const failure = await adopt($, homes, chosen)
    await update($, problem, () => failure ?? null)
    if (failure === undefined) await react($, 'greeting')
    animate($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setActivity($, 'running')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isAsking = ASKING_TOOLS.has(e.tool)
    await setActivity($, isAsking ? 'waiting' : activityForTool(e.tool), e.tool)

    const ran = await next(e)

    await setActivity($, 'running')
    if (ran.isError === true && !isAsking) await react($, 'failed')

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (ASKING_NOTIFICATIONS.has(e.notification_type)) await setActivity($, 'waiting')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await setActivity($, 'ready')
    if (e.reason === 'answer') await react($, 'celebrating')
    if (e.reason === 'error' || e.reason === 'refusal') await react($, 'failed')

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const arg = e.args.trim()
    const homes = await homesFor($)

    if (arg === '' || arg === 'list') return { text: await describe($, homes) }

    if (arg === 'home') {
      await update($, offset, () => HOME_OFFSET)
      await $.store.set('offset', HOME_OFFSET)
      return { text: 'Pet is back in its corner.' }
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
    if (e.viewport !== undefined) noteBottomSlot(e.viewport.rows, e.viewport.columns, e.props.maxRows)
    if (e.props.hasSurvey) return next(e)

    const { Text } = $.ui.resolve(e)
    const failure = await read($, problem)
    if (failure !== null) return <Text dimColor>pets: {failure}</Text>

    if (isFloating) return next(e)

    const view = await petView($)
    if (view === undefined) return next(e)

    playback.siteRequestId = e.requestId
    playback.framesDir = view.framesDir

    return figure($.ui.resolve(e), view, size, e.props.bodyColumns)
  })

  // Floating, the pet rides whichever conversation row starts the viewport: a
  // floating box is cut off at its site's region, and a row's region is the
  // whole conversation, so from there it can go anywhere over it.
  on(
    'ui.render',
    { component: ['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult'] },
    async ($, e, next) => {
      if (!isFloating || e.surface !== 'terminal') return next(e)

      noteRow(e.requestId, e.props.onScreen)
      const host = hostRow()
      if (host?.requestId !== e.requestId) return next(e)

      const view = await petView($)
      if (view === undefined) return next(e)

      playback.siteRequestId = e.requestId
      playback.framesDir = view.framesDir

      const at = clampOffset(await read($, offset), size)
      const { Box, Image } = $.ui.resolve(e)
      const row = await next(e)

      return (
        <Box flexDirection="column">
          {row}
          <Box position="absolute" top={topInHost(host, at, size)} right={at.right}>
            <Image
              key={IMAGE_KEY}
              source={{ file: currentFrame(view.framesDir), format: 'png' }}
              columns={size.columns}
              rows={size.rows}
              alt={`(${view.displayName})`}
            />
          </Box>
        </Box>
      )
    },
  )

  // The caption, in the footer's flow: a floating box never receives the
  // pointer, so this is the pet's drag handle. It also keeps the footer site
  // laid out, which it is not while it draws nothing in the flow.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isFloating || e.surface !== 'terminal') return next(e)

    const view = await petView($)
    if (view === undefined) return next(e)

    const { Client } = $.ui.resolve(e)
    const grip: GripProps = {
      offset: clampOffset(await read($, offset), size),
      modes: e.props.modes.join(' & '),
      name: view.displayName,
      status: view.tool === null ? view.label : `${view.label} · ${view.tool}`,
    }

    return <Client key="grip" module="./grip.tsx" props={grip} />
  })

  // The caption posts where the pet should be while it is dragged, then on drop.
  on('ui.message', { element: 'grip' }, async ($, e) => {
    const data: unknown = e.data
    if (!isOffset(data)) return {}

    const at = clampOffset(data, size)
    const was = await read($, offset)
    if (was.right !== at.right || was.lift !== at.lift) await update($, offset, () => at)

    if (isDrop(data)) {
      await $.store.set('offset', at)
      steer($, undefined)
      return {}
    }

    // Pet coordinates count from the right, so a falling `right` runs right.
    if (at.right !== was.right) steer($, at.right < was.right ? 'right' : 'left')
    return {}
  })
}
