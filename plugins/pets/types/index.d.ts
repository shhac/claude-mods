export type Activity = 'ready' | 'running' | 'reviewing' | 'waiting'

export type Reaction = 'greeting' | 'celebrating' | 'failed' | 'happy' | 'levelUp'

// Where the floating pet sits: columns in from the right edge, rows up from
// the bottom of the conversation.
export type Offset = {
  right: number
  lift: number
}

export type SizeName = 'small' | 'medium' | 'large'

// Where the pet lives: floating over the conversation, or over the right end
// of the prompt box.
export type Dock = 'conversation' | 'prompt'

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
      size: SizeName
      dock: Dock
      // The speech bubble's text, while it shows.
      bubble: string | null
      // Level and mood hearts, as the caption shows them.
      badge: string
    }
  }
}
