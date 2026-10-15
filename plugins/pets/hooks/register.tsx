import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Dock, SizeName } from '../types'
import { settleIn } from './adoption'
import { afterTest, afterTool, afterTurn } from './care'
import { isTestRun } from './checks'
import { petCommand } from './commands'
import { HOME_OFFSET, SIDEBAR, isSizeName, mirror, resetControls, settleDock, sizeOf } from './controls'
import type { Catcher } from './controls'
import { bandFigure, footerWithPet, rowWithMenu, rowWithPet } from './drawings'
import type { Look, RowShare } from './drawings'
import type { GripProps } from './grip'
import { fieldOf } from './fields'
import { PROMPT_DOCK_TOP, forgetHover, onGrip, onHandle, onMenu } from './gestures'
import { stopWatchingCare, tend, watchCare } from './keeper'
import { closeMenu, resetMenu, shownMenu } from './menu-actions'
import { menuSize } from './menu-rows'
import { fetchGame } from './play'
import { pressSidebar, sidebarView } from './side-panel'
import { sidebar } from './sidebar'
import { animate, hostPicture, react, setActivity } from './player'
import { forgetRows, noteBottomSlot, noteRow, planFor, screen } from './stage'
import type { Plan, Size } from './stage'
import { petLook, statusLine } from './status'
import { awaitThought, feelTool, hushStale, noteRequest, remark, say, stopMusing, voice } from './voice'
import type { Chatter } from './voice'


// The validator reads state refs per file, so each file declares the atoms it uses.
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)
const offset = atom({ plugin: 'pets', key: 'offset' } as const, HOME_OFFSET)
const bubble = atom({ plugin: 'pets', key: 'bubble' } as const, null)
const badge = atom({ plugin: 'pets', key: 'badge' } as const, '')
const isHovered = atom({ plugin: 'pets', key: 'isHovered' } as const, false)

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch'])
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const ASKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

const activityForTool = (tool: string): Activity => (READ_ONLY_TOOLS.has(tool) ? 'reviewing' : 'running')
const asChatter = (value: unknown): Chatter => (value === 'quiet' || value === 'off' ? value : 'on')

async function cheerTests($: EngineInterface, hasPassed: boolean) {
  await tend($, care => afterTest(care, hasPassed))
  if (hasPassed) await react($, 'celebrating')
  await say($, hasPassed ? 'tests green! 💚' : 'ouch, red… 🩹')
}

// How the person set the pet to be drawn: floating, or in the band.
const placement = { isFloating: true }

// Where the pet is drawn now: the band when that's the placement, else
// where it was put, the sidebar winning over the band.
function site(): 'band' | Dock {
  if (mirror.dock === 'sidebar') return 'sidebar'
  return placement.isFloating ? mirror.dock : 'band'
}

// The menu, opened from the conversation's bottom row while the pet is docked.
function dockedMenu(requestId: string) {
  const menu = shownMenu()
  const plan = menu === undefined ? undefined : planFor({ right: 1, lift: 0 }, menuSize(menu.rows))
  return menu === undefined || plan?.host !== requestId ? undefined : { plan, menu }
}

type Host = { plan: Plan; petSize: Size; catcher: Catcher }

// The floating pet's plan, if this row hosts it. Every row's report can move
// the host, so a new plan redraws them all.
function hostOf($: EngineInterface, requestId: string, component: string): Host | undefined {
  const petSize = sizeOf(mirror.size)
  const plan = planFor(mirror.offset, petSize)
  if (plan === undefined) return undefined

  if (plan.key !== mirror.planKey) {
    mirror.planKey = plan.key
    $.ui.invalidate('ui.render')
  }
  if (plan.host !== requestId) return undefined

  // A drag holds the catcher where it was pressed until the drop.
  const held = mirror.drag?.requestId === requestId ? mirror.drag.catcher : undefined
  const catcher: Catcher = held ?? { top: plan.top, right: plan.at.right, height: petSize.rows }
  mirror.catcher = { requestId, at: catcher }
  mirror.hostKind = component
  return { plan, petSize, catcher }
}

// What the host row draws of the pet. It reads the offset so a move redraws
// it, and only it.
async function floatingShare($: EngineInterface, host: Host, look: Look): Promise<RowShare> {
  await read($, offset)
  const { plan, petSize, catcher } = host
  // No frame while dragging: a moving floating box can leave its old cells.
  // Nor once the catcher moved: the pointer may no longer be over the pet.
  const isLit = (await read($, isHovered)) && mirror.drag === undefined && mirror.hoverKey === plan.key
  return {
    plan,
    isLit,
    isFading: !isLit && mirror.isFrameFading,
    isDebug: mirror.isDebug,
    look,
    petSize,
    said: await read($, bubble),
    menu: shownMenu(),
    catcher,
    screenColumns: screen.columns,
  }
}

export const register: Register = (on, options) => {
  const defaultSize: SizeName = isSizeName(options.size) ? options.size : 'medium'
  placement.isFloating = options.placement !== 'band'
  voice.chatter = asChatter(options.chatter)
  resetControls(defaultSize)
  resetMenu()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Codex-compatible pet: help, list, switch, show, hide, size, dock, stats, feed',
      argumentHint: '[help | list | <id> | on | off | home | size | dock [chat|prompt|sidebar] | stats | feed | pat | debug]',
    })

    await hushStale($)
    await settleIn($, defaultSize)
    animate($)
    watchCare($)

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
    stopWatchingCare()
    fetchGame.generation += 1
    return next(e)
  })

  // What the person asked is what the pet's feelings are about.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) noteRequest(e.text)
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    await forgetHover($)
    await closeMenu($)
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

    // A test run that ran here and wasn't refused: a background one comes
    // back at once, before any result.
    const command = fieldOf(e, 'command')
    const isTestCall = e.tool === 'Bash' && typeof command === 'string' && isTestRun(command)
    if (isTestCall && fieldOf(e, 'run_in_background') !== true && ran.deny === undefined) await cheerTests($, !isError)

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
    if (hasResized && placement.isFloating) $.ui.invalidate('ui.render')
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

    if (site() !== 'band') return next(e)

    const look = await petLook($)
    if (look === undefined) return next(e)

    hostPicture(e.requestId, look.framesDir)

    const caption = { badge: await read($, badge), status: await statusLine($), said: await read($, bubble) }
    const petSize = sizeOf(mirror.size)

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
      const where = site()
      if (where === 'band' || e.surface !== 'terminal') return next(e)

      noteRow(e.requestId, e.props.onScreen)
      const look = await petLook($)
      if (look === undefined || where === 'sidebar') return next(e)

      // Docked, the bottom row only opens the pet's menu, at the right end
      // just above the prompt: the footer can't reach that far up.
      if (where === 'prompt') {
        const docked = dockedMenu(e.requestId)
        return docked === undefined ? next(e) : rowWithMenu($.ui.resolve(e), await next(e), docked.plan, docked.menu)
      }

      const host = hostOf($, e.requestId, e.component)
      if (host === undefined) return next(e)

      const row = await next(e)
      hostPicture(e.requestId, look.framesDir)
      return rowWithPet($.ui.resolve(e), row, await floatingShare($, host, look))
    },
  )

  // The caption in the footer: the pet's name, level, mood and what it's up to,
  // and a handle for the pet. Docked on the prompt, the picture hangs from here.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const where = site()
    if (where === 'band' || where === 'sidebar' || e.surface !== 'terminal') return next(e)

    const look = await petLook($)
    if (look === undefined) return next(e)

    const isDocked = mirror.dock === 'prompt'
    const petSize = sizeOf(mirror.size)
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
      statusColumns: mirror.isDebug ? 64 : 44,
    }

    if (isDocked) {
      hostPicture(e.requestId, look.framesDir)
    }

    // Undocking by a drag takes the pet away mid-drag, so the catcher stays
    // until the drop to keep hold of the pointer.
    mirror.footerId = e.requestId
    const isHeld = mirror.drag?.requestId === e.requestId
    const docked = isDocked ? { top: PROMPT_DOCK_TOP, look, petSize, isLit: await read($, isHovered) } : undefined
    const catcher = isDocked || isHeld ? { top: PROMPT_DOCK_TOP, petSize, isOutlined: mirror.isDebug } : undefined
    return footerWithPet($.ui.resolve(e), await next(e), grip, docked, catcher)
  })

  // The sidebar: what the pet knows of itself, folding sections, and at the
  // bottom, level with the prompt, its bubble, the pet and its name.
  on('ui.render', { component: 'Pane', requestId: SIDEBAR }, async ($, e, next) => {
    if (e.surface !== 'terminal' || mirror.dock !== 'sidebar') return next(e)

    const isInline = e.props.placement === 'inline'
    const view = await sidebarView($, e.props.scroll.bodyRows, e.props.bodyColumns, isInline)
    if (view === undefined) return next(e)

    hostPicture(e.requestId, view.look.framesDir)
    return sidebar($.ui.resolve(e), view, id => void pressSidebar($, id))
  })

  // Closed by its mark or a key, the sidebar sends the pet back over the
  // conversation. Our own closes (a move elsewhere) are already settled.
  on('ui.close', async ($, e, next) => {
    if (e.id === SIDEBAR && e.origin.kind === 'person' && mirror.dock === 'sidebar') await settleDock($, 'conversation')
    return next(e)
  })

  // What the pet's surfaces post: its catcher, its name tag, its menu.
  on('ui.message', { element: 'handle' }, async ($, e) => {
    await onHandle($, e.requestId, e.element, e.data)
    return {}
  })

  on('ui.message', { element: 'grip' }, async ($, e) => {
    await onGrip($, e.requestId, e.data)
    return {}
  })

  on('ui.message', { element: 'menu' }, async ($, e) => {
    await onMenu($, e.data)
    return {}
  })
}
