export type Mode = 'focus' | 'overview'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type ClaudeTask = { id: string; text: string; detail: string | null; status: TaskStatus }

export type ArcTodo = {
  id: string
  text: string
  date: string | null
  note: string
  repo: string | null
  session: string | null
}

export type ArcListing = { repo: string | null; todos: ArcTodo[] }

export type ArcStory = {
  id: number
  name?: string
  state?: string | null
  url?: string
}

export type ArcContext = {
  story: ArcStory
  branch: string
  note: string | null
  sessions: string[]
}

export type ArcSnapshot =
  | { kind: 'loading' }
  | { kind: 'loaded'; context: ArcContext | null; repo: string | null; todos: ArcTodo[] }
  | { kind: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    agenda: {
      mode: Mode | null
      tasks: ClaudeTask[]
      arc: ArcSnapshot
      expanded: string[]
    }
  }
}
