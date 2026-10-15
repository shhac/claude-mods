import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SizeName } from '../types'
import { restoreControls } from './controls'
import { keeper, loadCare } from './keeper'
import { codexSelection, findPets, homesFor, prepareFrames } from './pets'
import type { PetHomes, PetPackage } from './pets'
import { playback, react } from './player'
import { say } from './voice'

// Finding the pet to show, getting it ready and bringing it in.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)

// Resolves why the pet could not be loaded, or undefined once it is shown.
export async function adopt($: EngineInterface, homes: PetHomes, chosen: PetPackage) {
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

export async function describePets($: EngineInterface, homes: PetHomes) {
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
export async function settleIn($: EngineInterface, defaultSize: SizeName) {
  const wasHidden = (await $.store.get('isHidden')) === true
  await update($, isHidden, () => wasHidden)
  await restoreControls($, defaultSize)

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
