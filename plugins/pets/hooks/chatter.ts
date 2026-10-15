// What the pet says in its speech bubble: a line about the tool Claude is
// using, and a remark when a reply lands.

const MAX_BUBBLE = 48

export const fitBubble = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim().replace(/^["'“]|["'”]$/g, '')
  return line.length <= MAX_BUBBLE ? line : `${line.slice(0, MAX_BUBBLE - 1)}…`
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

// A line for the tools that say what they do in their input; undefined for
// those that need a summary (a shell command with no description, MCP tools).
export function toolLine(tool: string, input: unknown): string | undefined {
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
      return description === undefined ? 'sending out a helper' : `helper: ${lower(description)}`
    case 'Bash':
      return description === undefined ? undefined : lower(description)
    default:
      return tool.startsWith('mcp__') ? undefined : `using ${tool}`
  }
}

// What the summary model is asked about a call no line covers.
export function toolQuestion(tool: string, input: unknown) {
  const command = field(input, 'command')
  const what = command === undefined ? `the tool ${tool} with input ${JSON.stringify(input).slice(0, 600)}` : `the shell command: ${command.slice(0, 600)}`
  return `In at most 7 plain words, lowercase, no punctuation at the end, say what this is doing: ${what}`
}

export const remarkSystem = (name: string) =>
  `You are ${name}, a tiny pixel pet who lives in a coding terminal and watches an AI assistant called Claude work. ` +
  'Reply with one short remark of at most 12 words about Claude\'s latest reply: cute, a little snarky, never mean. ' +
  'No quotes, no hashtags, at most one emoji.'

export const remarkPrompt = (answer: string) => `Claude's latest reply:\n\n${answer.slice(0, 2000)}`
