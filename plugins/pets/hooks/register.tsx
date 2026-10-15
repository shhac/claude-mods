import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Dock, SizeName } from '../types'
import { settleIn } from './adoption'
import { ACTIVITY_LABEL, REACTION_LABEL } from './atlas'
import { afterTool, afterTurn } from './care'
import { petCommand } from './commands'
import { aimPet, click, dragPet, forgetHover, hover, isSizeName, mirror, resetControls, sizeOf } from './controls'
import type { Catcher } from './controls'
import { bandFigure, footerWithPet, rowWithPet } from './drawings'
import type { Look } from './drawings'
import type { GripProps } from './grip'
import { tend } from './keeper'
import { animate, playback, react, setActivity } from './player'
import { describeStage, forgetRows, noteBottomSlot, noteRow, planFor, screen } from './stage'
import { awaitThought, feelTool, hushStale, noteRequest, remark, stopMusing, voice } from './voice'
import type { Chatter } from './voice'

// Docked, the pet's top is on the prompt box's top edge, three rows above the
// footer caption: the footer's floating boxes reach only over the bottom area.
const PROMPT_DOCK_TOP = -3

// The validator reads state refs per file, so each file declares the atoms it uses.
const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const activity = atom({ plugin: 'pets', key: 'activity' } as const, 'ready')
const reaction = atom({ plugin: 'pets', key: 'reaction' } as const, null)
const detail = atom({ plugin: 'pets', key: 'detail' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)
const offset = atom({ plugin: 'pets', key: 'offset' } as const, { right: 0, lift: 0 })
const size = atom({ plugin: 'pets', key: 'size' } as const, 'medium')
const dock = atom({ plugin: 'pets', key: 'dock' } as const, 'conversation')
const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)
const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')
const isHovered = atom({ plugin: 'pets', key: 'isHovered' } as const, false)

// What the pet does, shown while the pointer is over it or its name tag.
const HINTS: Record<Dock, string> = {
  conversation: 'drag · 2-click: dock · right-click: size',
  prompt: 'drag, 2-click: undock · right-click: size',
}

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch'])
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const ASKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

const activityForTool = (tool: string): Activity => (READ_ONLY_TOOLS.has(tool) ? 'reviewing' : 'running')
const asChatter = (value: unknown): Chatter => (value === 'quiet' || value === 'off' ? value : 'on')

const fieldOf = (data: unknown, key: string) => {
  if (typeof data !== 'object' || data === null || !(key in data)) return undefined
  const record: Record<string, unknown> = { ...data }
  return record[key]
}

const numberField = (data: unknown, key: string) => {
  const value = fieldOf(data, key)
  return typeof value === 'number' ? value : 0
}

// What the rows need to draw the pet: whether there is one, and its frames.
async function petLook($: EngineInterface): Promise<Look | undefined> {
  if (await read($, isHidden)) return undefined

  const current = await read($, pet)
  return current === null ? undefined : { displayName: current.displayName, framesDir: current.framesDir }
}

async function statusLine($: EngineInterface) {
  if (mirror.isDebug) return describeStage()
  if ((await read($, isHovered)) && mirror.hoverKey === mirror.planKey) return HINTS[await read($, dock)]

  const shownReaction = await read($, reaction)
  if (shownReaction !== null) return REACTION_LABEL[shownReaction]

  const tool = await read($, detail)
  const label = ACTIVITY_LABEL[await read($, activity)]
  return tool === null ? label : `${label} · ${tool}`
}

export const register: Register = (on, options) => {
  const defaultSize: SizeName = isSizeName(options.size) ? options.size : 'medium'
  const isFloating = options.placement !== 'band'
  voice.chatter = asChatter(options.chatter)
  resetControls(defaultSize)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Codex-compatible pet: help, list, switch, show, hide, size, dock, stats, feed',
      argumentHint: '[help | list | <id> | on | off | home | size | dock | stats | feed | pat | debug]',
    })

    await hushStale($)
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
    stopMusing()
    return next(e)
  })

  // What the person asked is what the pet's feelings are about.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) noteRequest(e.text)
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    await forgetHover($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await setActivity($, 'running')
    awaitThought($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isAsking = ASKING_TOOLS.has(e.tool)
    await setActivity($, isAsking ? 'waiting' : activityForTool(e.tool), e.tool)
    void feelTool($, e.tool, e)

    const ran = await next(e)
    const isError = ran.isError === true
    awaitThought($)

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

    stopMusing()
    await setActivity($, 'ready')
    if (e.reason === 'error' || e.reason === 'refusal') await react($, 'failed')
    if (e.reason !== 'answer') return next(e)

    await react($, 'celebrating')
    await tend($, afterTurn)

    void remark($, e.answer)
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => ({ text: await petCommand($, e.args) }))

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
        {bandFigure($.ui.resolve(e), look, caption, petSize, e.props.bodyColumns)}
      </Box>
    )
  })

  // Floating over the conversation, the pet is drawn by the bottom-most row,
  // its box stretched over the pet so the pointer reaches the catcher on it
  // (stage.ts says why). Every row reports where it is.
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

      // The host may have changed with this row's report.
      if (plan.key !== mirror.planKey) {
        mirror.planKey = plan.key
        $.ui.invalidate('ui.render')
      }
      if (plan.host !== e.requestId) return next(e)

      // A drag holds the catcher where it was pressed until the drop.
      const held = mirror.drag?.requestId === e.requestId ? mirror.drag.catcher : undefined
      const catcher: Catcher = held ?? { top: plan.top, right: plan.at.right, height: petSize.rows }
      mirror.catcher = { requestId: e.requestId, at: catcher }

      const row = await next(e)

      // The host row follows the pet's every change.
      await read($, offset)
      await read($, size)
      playback.siteRequestId = e.requestId
      playback.framesDir = look.framesDir

      const said = await read($, bubble)
      // No frame while dragging: a moving floating box can leave its old cells.
      // Nor once the catcher moved: the pointer may no longer be over the pet.
      const isLit = (await read($, isHovered)) && mirror.drag === undefined && mirror.hoverKey === plan.key
      const isFading = !isLit && mirror.isFrameFading
      const share = { plan, isLit, isFading, isDebug: mirror.isDebug, look, petSize, said, catcher, screenColumns: screen.columns }
      return rowWithPet($.ui.resolve(e), row, share)
    },
  )

  // The caption in the footer: the pet's name, level, mood and what it's up to,
  // and a handle for the pet. Docked on the prompt, the picture hangs from here.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isFloating || e.surface !== 'terminal') return next(e)

    const look = await petLook($)
    if (look === undefined) return next(e)

    const isDocked = (await read($, dock)) === 'prompt'
    const petSize = sizeOf(await read($, size))
    const at = await read($, offset)
    const said = await read($, bubble)
    const isSaying = isDocked && said !== null && !said.isFading
    // Docked, the caption moves left of the pet; floating, it sits under it.
    const pad = isDocked ? petSize.columns + 2 : Math.min(at.right, Math.max(0, screen.columns - petSize.columns))
    const grip: GripProps = {
      pad,
      name: look.displayName,
      badge: await read($, badge),
      status: isSaying ? `“${said.text}”` : await statusLine($),
    }

    if (isDocked) {
      playback.siteRequestId = e.requestId
      playback.framesDir = look.framesDir
    }

    // Undocking by a drag takes the pet away mid-drag, so the catcher stays
    // until the drop to keep hold of the pointer.
    mirror.footerId = e.requestId
    const isHeld = mirror.drag?.requestId === e.requestId
    const docked = isDocked ? { top: PROMPT_DOCK_TOP, look, petSize, isLit: await read($, isHovered) } : undefined
    const catcher = isDocked || isHeld ? { top: PROMPT_DOCK_TOP, petSize, isOutlined: mirror.isDebug } : undefined
    return footerWithPet($.ui.resolve(e), await next(e), grip, docked, catcher)
  })

  // The pet's catcher, over the conversation or docked: a drag moves it, a
  // click pets it, a double click docks it on the prompt or back, a right
  // click changes its size.
  on('ui.message', { element: 'handle' }, async ($, e) => {
    const kind = fieldOf(e.data, 'kind')
    if (kind === 'hover') await hover($, `${e.requestId}:handle`, fieldOf(e.data, 'isOver') === true)
    if (kind === 'click') await click($, fieldOf(e.data, 'button'), true)
    if (kind !== 'drag' && kind !== 'drop') return {}

    // Docked, the catcher is the footer's: the pet follows the pointer, as
    // from the caption, counted from the footer row.
    if (e.requestId === mirror.footerId) {
      const columns = sizeOf(mirror.size).columns
      const aim = {
        fromRight: 1 + (columns - 1 - numberField(e.data, 'x')),
        up: -(PROMPT_DOCK_TOP + numberField(e.data, 'y')),
      }
      await aimPet($, e.requestId, aim, kind === 'drop')
      return {}
    }

    const gesture = `${e.requestId}:${e.element}:${numberField(e.data, 'gesture')}`
    const move = { dx: numberField(e.data, 'dx'), dy: numberField(e.data, 'dy') }
    await dragPet($, e.requestId, gesture, move, kind === 'drop')
    return {}
  })

  // The footer caption: the same, but dragged, the pet follows the pointer.
  on('ui.message', { element: 'grip' }, async ($, e) => {
    const kind = fieldOf(e.data, 'kind')
    if (kind === 'hover') await hover($, `${e.requestId}:grip`, fieldOf(e.data, 'isOver') === true)
    if (kind === 'click') await click($, fieldOf(e.data, 'button'), false)
    if (kind !== 'aim' && kind !== 'drop') return {}

    const aim = { fromRight: numberField(e.data, 'fromRight'), up: numberField(e.data, 'up') }
    await aimPet($, e.requestId, aim, kind === 'drop')
    return {}
  })
}
