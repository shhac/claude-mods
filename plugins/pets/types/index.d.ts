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

// Where the pet lives: floating over the conversation, or over the right end
// of the prompt box.
export type Dock = 'conversation' | 'prompt'

// The right-click menu: shut, showing, or drawn blank a moment as it goes.
export type MenuState = 'closed' | 'open' | 'fading'

// Said aloud, or only thought (Claude is quiet, the pet's mind wanders).
export type BubbleKind = 'say' | 'think'

// While it fades, the bubble draws blank in its own shape, so no old text is
// left where it was.
export type Bubble = { text: string; kind: BubbleKind; isFading: boolean }

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
      // The bubble, while it shows.
      bubble: Bubble | null
      // The pointer is over the pet or its name tag: both light up.
      isHovered: boolean
      // Level and mood hearts, as the caption shows them.
      badge: string
    }
  }
}
