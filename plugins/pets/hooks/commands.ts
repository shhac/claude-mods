import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { describeAchievements } from './achievements'
import { HOW_TO_GET_A_PET, adopt, describePets } from './adoption'
import { describeCare, fed, petted } from './care'
import { NEXT_SIZE, SIZE_ROWS, goHome, isSizeName, mirror, setDebug, setDock, setSize } from './controls'
import { keeper, tend } from './keeper'
import { findPets, homesFor } from './pets'
import { react } from './player'
import { describeStage } from './stage'
import { say } from './voice'

// `/pet` and its subcommands; each resolves the text shown in reply.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)

export async function feedPet($: EngineInterface, name: string) {
  const care = keeper.care
  if (care === undefined) return 'No pet to feed.'

  const meal = fed(care, await $.clock.now())
  if ('waitMinutes' in meal) return `${name} is still full. Try again in ${meal.waitMinutes} min.`

  await tend($, () => meal.care)
  await react($, 'happy')
  await say($, 'nom nom nom 🍪')
  return `${name} loved that.`
}

export async function patPet($: EngineInterface) {
  await tend($, petted)
  await react($, 'happy')
}

export async function hidePet($: EngineInterface, isOff = true) {
  await update($, isHidden, () => isOff)
  await $.store.set('isHidden', isOff)
}

async function switchPet($: EngineInterface, id: string) {
  const homes = await homesFor($)
  const chosen = (await findPets($, homes)).find(one => one.id === id)
  if (chosen === undefined) return `No pet "${id}".\n\n${await describePets($, homes)}`

  const failure = await adopt($, homes, chosen)
  if (failure !== undefined) return `Could not load ${chosen.displayName}: ${failure}`
  await update($, problem, () => null)

  await $.store.set('selected', chosen.id)
  await react($, 'greeting')
  return `${chosen.displayName} is now your pet.`
}

export async function petCommand($: EngineInterface, args: string) {
  const [arg = '', value = ''] = args.trim().split(/\s+/)

  if (arg === '' || arg === 'list') return describePets($, await homesFor($))

  if (arg === 'help') {
    return [
      '/pet                 the pets found; /pet <id> switches',
      '/pet on | off        show or hide the pet',
      '/pet home            back to its corner',
      '/pet size [name]     small, medium or large; cycles without a name',
      '/pet dock            onto the prompt box, or back',
      '/pet stats | feed | pat',
      '/pet debug           show where the pet can be grabbed',
      '',
      'On the pet: drag to move, click to pet, double-click to dock, right-click for its menu',
      '(feed, fetch, tricks as it levels up, size, stats).',
      '',
      HOW_TO_GET_A_PET,
    ].join('\n')
  }

  if (arg === 'home') {
    await goHome($)
    return 'Pet is back in its corner.'
  }

  if (arg === 'size') {
    const next = isSizeName(value) ? value : NEXT_SIZE[mirror.size]
    await setSize($, next)
    return `Pet is ${next} now (${SIZE_ROWS[next]} rows).`
  }

  if (arg === 'dock') {
    const next = mirror.dock === 'conversation' ? 'prompt' : 'conversation'
    await setDock($, next)
    return next === 'prompt' ? 'Pet is sitting on the prompt box.' : 'Pet is back over the conversation.'
  }

  if (arg === 'debug') {
    await setDebug($, !mirror.isDebug)
    return mirror.isDebug
      ? `Grab areas outlined; the footer shows what the pet knows of the screen.\n${describeStage()}`
      : 'Grab areas hidden again.'
  }

  if (['off', 'hide', 'on', 'show'].includes(arg)) {
    const isOff = arg === 'off' || arg === 'hide'
    await hidePet($, isOff)
    return isOff ? 'Pet hidden. /pet on brings it back.' : 'Pet is back.'
  }

  const current = await read($, pet)
  const isCare = arg === 'stats' || arg === 'feed' || arg === 'pat'
  if (isCare && (current === null || keeper.care === undefined)) return 'No pet here yet.'

  if (arg === 'stats' && current !== null && keeper.care !== undefined) {
    return `${describeCare(current.displayName, keeper.care, await $.clock.now())}\n${describeAchievements(keeper.care)}`
  }

  if (arg === 'feed' && current !== null) return feedPet($, current.displayName)

  if (arg === 'pat' && current !== null) {
    await patPet($)
    return `${current.displayName} wiggles happily.`
  }

  return switchPet($, arg)
}
