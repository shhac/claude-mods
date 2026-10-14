export type Activity = 'ready' | 'running' | 'reviewing' | 'waiting'

export type Reaction = 'greeting' | 'celebrating' | 'failed'

// Where the floating pet sits: columns in from the right edge, rows up from the footer.
export type Offset = {
  right: number
  lift: number
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
    }
  }
}
