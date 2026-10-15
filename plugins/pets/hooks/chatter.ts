// What the pet says or thinks in its bubble: not what Claude is doing, which
// the conversation already shows, but how the pet feels about it.

// Three lines of the bubble.
const MAX_BUBBLE = 84
// The bubble's text wraps at this width, inside its border and padding.
export const BUBBLE_TEXT_COLUMNS = 28

export const fitBubble = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim().replace(/^["'“]|["'”]$/g, '')
  return line.length <= MAX_BUBBLE ? line : `${line.slice(0, MAX_BUBBLE - 1)}…`
}

// Word-wrapped lines of the bubble's text; a word too long for a line is cut.
export function wrapBubble(text: string, columns = BUBBLE_TEXT_COLUMNS): string[] {
  const words = text.split(' ').filter(word => word !== '')
  return words.reduce<string[]>((lines, word) => {
    const fitted = word.length > columns ? `${word.slice(0, columns - 1)}…` : word
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + fitted.length <= columns) return [...lines.slice(0, -1), `${last} ${fitted}`]
    return [...lines, fitted]
  }, [])
}

const field = (input: unknown, key: string) => {
  if (typeof input !== 'object' || input === null || !(key in input)) return undefined
  const record: Record<string, unknown> = { ...input }
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

const baseName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path
const hostOf = (url: string) => /^[a-z]+:\/\/([^/]+)/i.exec(url)?.[1] ?? url
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

// What a tool call is doing, in a few words: context for the pet's feelings.
export function toolLine(tool: string, input: unknown): string {
  const path = field(input, 'file_path') ?? field(input, 'notebook_path') ?? field(input, 'path')
  const description = field(input, 'description')

  switch (tool) {
    case 'Read':
      return path === undefined ? 'reading' : `reading ${baseName(path)}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return path === undefined ? 'editing' : `editing ${baseName(path)}`
    case 'Write':
      return path === undefined ? 'writing' : `writing ${baseName(path)}`
    case 'Grep':
      return `searching for ${field(input, 'pattern') ?? 'something'}`
    case 'Glob':
      return `looking for ${field(input, 'pattern') ?? 'files'}`
    case 'WebFetch':
      return `reading ${hostOf(field(input, 'url') ?? 'the web')}`
    case 'WebSearch':
      return `searching the web for ${field(input, 'query') ?? 'answers'}`
    case 'TodoWrite':
      return 'updating the to-do list'
    case 'Agent':
    case 'Task':
      return description === undefined ? 'sending out a helper' : `sending a helper to ${lower(description)}`
    case 'Bash': {
      if (description !== undefined) return lower(description)
      const command = field(input, 'command')
      return command === undefined ? 'running a command' : `running \`${command.slice(0, 120)}\``
    }
    default:
      return `using ${tool}`
  }
}

type Mood = 'curious' | 'fussy' | 'thrilled' | 'nosy' | 'proud'

const MOOD_OF: Record<string, Mood> = {
  Read: 'curious',
  Grep: 'curious',
  Glob: 'curious',
  LS: 'curious',
  Edit: 'fussy',
  MultiEdit: 'fussy',
  Write: 'fussy',
  NotebookEdit: 'fussy',
  Bash: 'thrilled',
  WebFetch: 'nosy',
  WebSearch: 'nosy',
  Agent: 'proud',
  Task: 'proud',
}

// Lines for when no model is asked: the pet's feelings, never a report.
const FEELINGS: Record<Mood | 'thinking' | 'other', readonly string[]> = {
  curious: ['ooh, what’s in there?', 'I’ve read that one. twice.', 'nosing around with you 👀', 'so many files, so little time'],
  fussy: ['careful, that one bites', 'I liked it before, honestly', 'ooh, fresh code smell ✨', 'don’t forget the tests…'],
  thrilled: ['the terminal goes brrr', 'I love it when things run', 'fingers crossed 🤞', 'please don’t be red, please'],
  nosy: ['the internet! take me too', 'bring me back something shiny', 'ooh, gossip from the web'],
  proud: ['send a helper? so fancy', 'delegation! very grown up', 'tell the helper I said hi'],
  thinking: [
    'hmm… 🤔',
    'shh, big brain at work',
    'I’d have it by now. probably',
    '*taps paw impatiently*',
    'thinking is napping, with extra steps',
    'the gears are turning ⚙️',
    'is it my turn yet?',
  ],
  other: ['ooh, a new trick', 'I’m watching. closely.', 'mm-hm, mm-hm'],
}

const pick = (lines: readonly string[], turn: number) => lines[turn % lines.length] ?? ''

export const feelingAboutTool = (tool: string, turn: number) => pick(FEELINGS[MOOD_OF[tool] ?? 'other'], turn)
export const feelingWhileThinking = (turn: number) => pick(FEELINGS.thinking, turn)

// Who the pet is, for the model that speaks for it.
export type Persona = { name: string; description: string; mood: number; level: number }

// What the pet has to go on: the person's ask, what Claude has done since, and
// what the pet said already, so it doesn't repeat itself.
export type Scene = { request: string; done: readonly string[]; said: readonly string[] }

const moodWords = (mood: number) => (mood >= 80 ? 'very happy' : mood >= 60 ? 'content' : mood >= 40 ? 'a bit grumpy' : 'sulky')

export const feelingSystem = (persona: Persona) =>
  [
    `You are ${persona.name}, a tiny pixel pet (level ${persona.level}) who lives in a coding terminal.`,
    persona.description === '' ? '' : `About you: ${persona.description}`,
    `You're ${moodWords(persona.mood)} right now.`,
    'You watch Claude, an AI assistant, work for your human. Say how YOU feel about what is going on:',
    'excited, bored, smug, worried, impressed, nosy, proud. Never just describe or summarise what is happening.',
    'One line of at most 10 words, first person, cute and a little snarky, never mean.',
    'No quotes, no hashtags, at most one emoji.',
  ]
    .filter(line => line !== '')
    .join(' ')

const sceneLines = (scene: Scene) => [
  scene.request === '' ? '' : `Your human asked Claude: ${scene.request.slice(0, 400)}`,
  scene.done.length === 0 ? '' : `Claude has been: ${scene.done.join('; ')}.`,
  scene.said.length === 0 ? '' : `You already said (don't repeat): ${scene.said.join(' / ')}`,
]

export const toolPrompt = (scene: Scene, now: string) =>
  [...sceneLines(scene), `Right now Claude is ${now}.`, 'How do you feel about it?'].filter(line => line !== '').join('\n')

export const thinkingPrompt = (scene: Scene) =>
  [...sceneLines(scene), 'Right now Claude is quietly thinking.', 'What goes through your head while you wait?']
    .filter(line => line !== '')
    .join('\n')

export const replyPrompt = (scene: Scene, answer: string) =>
  [...sceneLines(scene), `Claude just replied:\n\n${answer.slice(0, 2000)}`, '\nHow do you feel about that reply?']
    .filter(line => line !== '')
    .join('\n')
