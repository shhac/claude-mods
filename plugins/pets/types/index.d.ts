export type Activity = 'ready' | 'running' | 'reviewing' | 'waiting'

export type Reaction =
  | 'greeting'
  | 'celebrating'
  | 'failed'
  | 'happy'
  | 'levelUp'
  // Tricks, unlocked by level.
  | 'wave'
  | 'jump'
  | 'dance'
  | 'read'

// Where the floating pet sits: columns in from the right edge, rows up from
// the bottom of the last conversation row a hook sees (below it, negative).
export type Offset = {
  right: number
  lift: number
}

export type SizeName = 'small' | 'medium' | 'large'

// Where the pet lives: floating over the conversation, over the right end of
// the prompt box, or in a sidebar of its own.
export type Dock = 'conversation' | 'prompt' | 'sidebar'

// Which of the sidebar's folding sections are open.
export type Sections = { achievements: boolean; config: boolean; actions: boolean }

// Said aloud, or only thought (Claude is quiet, the pet's mind wanders).
export type BubbleKind = 'say' | 'think'

// While it fades, the bubble draws blank in its own shape, so no old text is
// left where it was.
export type Bubble = { text: string; kind: BubbleKind; isFading: boolean }

// How the pet is doing, kept per pet in the store and shared by every session.
export type Care = {
  xp: number
  // 0 to 100.
  mood: number
  pets: number
  treats: number
  turns: number
  tools: number
  adoptedAt: number
  lastSeenAt: number
  lastFedAt: number
  // Days in a row the pet has been visited.
  streak: number
  lastDay: string
  // 0 to 100, both: a treat fills the pet up, work tires it, rest restores it.
  fullness: number
  energy: number
  fetches: number
  tricks: number
  testsPassed: number
  // Test runs passed in a row, and the best such run.
  greenStreak: number
  bestGreenStreak: number
  // Replies watched between midnight and 5am.
  nightTurns: number
  // Each achievement earned, by id, with when.
  achievements: Record<string, number>
}

export type Pet = {
  id: string
  displayName: string
  framesDir: string
}

declare module 'claude-code' {
  interface PluginState {
    'pets': {
      pet: Pet | null
      activity: Activity
      reaction: Reaction | null
      detail: string | null
      isHidden: boolean
      problem: string | null
      offset: Offset
      // The bubble, while it shows.
      bubble: Bubble | null
      sections: Sections
      // The pointer is over the pet or its name tag: both light up.
      isHovered: boolean
      // The care of the pet on screen, as last saved by any session.
      care: Care | null
    }
  }
}
