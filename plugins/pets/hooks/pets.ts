import type { EngineInterface } from 'claude-code'

import type { Pet } from '../types'
import { CELL_HEIGHT, CELL_WIDTH, COLUMNS, FRAME_COUNT, ROWS } from './atlas'

export type PetPackage = {
  id: string
  displayName: string
  description: string
  spritesheet: string
}

export type PetHomes = {
  claude: string
  codex: string
  cache: string
}

export async function homesFor($: EngineInterface): Promise<PetHomes> {
  const home = (await $.env.get('HOME')) ?? ''
  const codex = (await $.env.get('CODEX_HOME')) ?? `${home}/.codex`

  return {
    claude: `${home}/.claude/pets`,
    codex: `${codex}/pets`,
    cache: `${home}/.claude/cache/pets`,
  }
}

const asText = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() !== '' ? value : fallback

export const parseManifest = (folder: string, dir: string, text: string): PetPackage => {
  const manifest: Record<string, unknown> = JSON.parse(text)
  const id = asText(manifest.id, folder)

  return {
    id,
    displayName: asText(manifest.displayName, id),
    description: asText(manifest.description, ''),
    spritesheet: `${dir}/${asText(manifest.spritesheetPath, 'spritesheet.webp')}`,
  }
}

async function readPackage($: EngineInterface, root: string, folder: string) {
  const dir = `${root}/${folder}`
  const manifestPath = `${dir}/pet.json`
  if (!(await $.fs.exists(manifestPath))) return undefined

  try {
    return parseManifest(folder, dir, await $.fs.read(manifestPath))
  } catch {
    return undefined
  }
}

// A pet in ~/.claude/pets shadows a Codex pet of the same id.
export async function findPets($: EngineInterface, homes: PetHomes): Promise<PetPackage[]> {
  const found = new Map<string, PetPackage>()

  for (const root of [homes.claude, homes.codex]) {
    if (!(await $.fs.exists(root))) continue

    for (const entry of await $.fs.list(root)) {
      const pet = await readPackage($, root, entry.name)
      if (pet !== undefined && !found.has(pet.id)) found.set(pet.id, pet)
    }
  }

  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export const parseCodexSelection = (configToml: string) =>
  /^\s*pet\s*=\s*"custom:([^"]+)"/m.exec(configToml)?.[1]

export async function codexSelection($: EngineInterface, homes: PetHomes) {
  const config = homes.codex.replace(/\/pets$/, '/config.toml')
  if (!(await $.fs.exists(config))) return undefined

  return parseCodexSelection(await $.fs.read(config))
}

const lastFrame = (dir: string) => `${dir}/frame-${String(FRAME_COUNT - 1).padStart(2, '0')}.png`

// Slices the atlas into one PNG per cell, once per spritesheet version, so the
// terminal reads each frame from disk and no pixels cross into the plugin.
const SLICERS = (spritesheet: string, dir: string): readonly (readonly string[])[] => [
  ['magick', spritesheet, '-crop', `${CELL_WIDTH}x${CELL_HEIGHT}`, '+repage', `PNG32:${dir}/frame-%02d.png`],
  ['ffmpeg', '-loglevel', 'error', '-y', '-i', spritesheet, '-vf', `untile=${COLUMNS}x${ROWS}`, '-start_number', '0', '-pix_fmt', 'rgba', `${dir}/frame-%02d.png`],
]

async function trySlice($: EngineInterface, argv: readonly string[]) {
  try {
    const { exitCode, stderr } = await $.process.run(argv, { timeoutMs: 60_000 })
    return exitCode === 0 ? undefined : `${argv[0]}: ${stderr.trim().split('\n')[0]}`
  } catch {
    return `${argv[0]}: not installed`
  }
}

export async function prepareFrames($: EngineInterface, homes: PetHomes, pet: PetPackage): Promise<Pet> {
  const { mtimeMs } = await $.fs.stat(pet.spritesheet)
  const framesDir = `${homes.cache}/${pet.id}-${Math.round(mtimeMs)}`
  const ready: Pet = { id: pet.id, displayName: pet.displayName, framesDir }

  if (await $.fs.exists(lastFrame(framesDir))) return ready

  await $.process.run(['mkdir', '-p', framesDir])

  const failures: string[] = []
  for (const argv of SLICERS(pet.spritesheet, framesDir)) {
    const failure = await trySlice($, argv)
    if (failure === undefined && (await $.fs.exists(lastFrame(framesDir)))) return ready
    failures.push(failure ?? `${argv[0]}: produced no frames`)
  }

  throw new Error(`could not slice ${pet.spritesheet} (${failures.join('; ')}); install ImageMagick or ffmpeg`)
}
