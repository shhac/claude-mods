import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SizeName } from '../types'
import { restoreControls } from './controls'
import { loadCare } from './keeper'
import { codexSelection, findPets, homesFor, prepareFrames } from './pets'
import type { PetHomes, PetPackage } from './pets'
import { playback, react } from './player'
import { meetPet, say } from './voice'

// Finding the pet to show, getting it ready and bringing it in.

const pet = atom({ plugin: 'pets', key: 'pet' } as const, null)
const isHidden = atom({ plugin: 'pets', key: 'isHidden' } as const, false)
const problem = atom({ plugin: 'pets', key: 'problem' } as const, null)

// The pet's frames, sliced from its spritesheet, or why they couldn't be.
async function framesFor($: EngineInterface, homes: PetHomes, chosen: PetPackage) {
  try {
    return await prepareFrames($, homes, chosen)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// Resolves why the pet could not be loaded, or its care once it is shown.
// Only the slicing can fail that way: anything after it is a bug, not a pet
// that won't load.
export async function adopt($: EngineInterface, homes: PetHomes, chosen: PetPackage) {
  const ready = await framesFor($, homes, chosen)
  if (typeof ready === 'string') return ready

  playback.framesDir = ready.framesDir
  await update($, pet, () => ready)
  meetPet(chosen.displayName, chosen.description)
  return loadCare($, ready.id)
}

async function choosePet($: EngineInterface, homes: PetHomes, available: readonly PetPackage[]) {
  const stored = await $.store.get('selected')
  const wanted = typeof stored === 'string' ? stored : await codexSelection($, homes)

  return available.find(one => one.id === wanted) ?? available[0]
}

export const HOW_TO_GET_A_PET = [
  'Getting a pet:',
  '- hatch one in Codex with its hatch-pet skill (saved to ~/.codex/pets/<id>/)',
  '- download one from https://petdex.dev into ~/.claude/pets/<id>/',
  '- or make one: pet.json (id, displayName, description, spritesheetPath) and a 1536×1872',
  '  transparent spritesheet of 8×9 cells, 192×208 each, one animation per row.',
  '  The pets mod README lists the rows; the description is all the pet knows of itself.',
].join('\n')

export async function describePets($: EngineInterface, homes: PetHomes) {
  const available = await findPets($, homes)
  if (available.length === 0) {
    return `No pets found in ${homes.claude} or ${homes.codex}.\n\n${HOW_TO_GET_A_PET}`
  }

  const current = await read($, pet)
  const lines = available.map(one => `${one.id === current?.id ? '●' : '○'} ${one.id} — ${one.displayName}`)

  return [
    'Pets:',
    ...lines,
    '',
    'Switch with /pet <id>; hide with /pet off.',
    'Also: /pet size, /pet dock, /pet stats, /pet feed, /pet pat, /pet home, /pet debug.',
    'New pets: /pet help.',
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

  const adopted = await adopt($, homes, chosen)
  await update($, problem, () => (typeof adopted === 'string' ? adopted : null))
  if (typeof adopted === 'string') return

  await react($, 'greeting')
  if (adopted.streak > 1) await say($, `Day ${adopted.streak} in a row! 🎉`)
}
